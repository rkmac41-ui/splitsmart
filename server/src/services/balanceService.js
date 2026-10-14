const db = require('../db/connection');
const { simplifyDebts } = require('../utils/debtSimplifier');

/**
 * Everyone who can take part in a group's expenses and payments: current
 * members plus unclaimed placeholder members (as negative IDs).
 */
function loadMembers(groupId) {
  // Real members
  const realMembers = db.prepare(`
    SELECT u.id, u.name FROM group_members gm
    JOIN users u ON u.id = gm.user_id
    WHERE gm.group_id = ?
  `).all(groupId);

  // Unclaimed placeholder members (represented with negative IDs)
  const placeholders = db.prepare(`
    SELECT id, name FROM placeholder_members
    WHERE group_id = ? AND claimed_by IS NULL
  `).all(groupId);

  return [
    ...realMembers,
    ...placeholders.map(p => ({ id: -p.id, name: p.name })),
  ];
}

/**
 * Split an expense into pairwise debts: each split member owes each payer
 * their share, distributed proportionally to how much each payer paid.
 * Returns [{ from, to, amount }] (amounts in cents, rounded).
 */
function expenseDebts(payers, splits) {
  const totalPaid = payers.reduce((s, p) => s + p.amount, 0);
  if (totalPaid === 0) return [];

  const result = [];
  for (const split of splits) {
    for (const payer of payers) {
      if (split.user_id === payer.user_id) continue;
      const amount = Math.round((split.amount * payer.amount) / totalPaid);
      if (amount > 0) result.push({ from: split.user_id, to: payer.user_id, amount });
    }
  }
  return result;
}

/**
 * Replay a group's expenses and payments in the order they were recorded and
 * find the last moment at which everyone was settled up (every member's net
 * balance back to zero). Everything recorded up to that moment is "settled"
 * and no longer counts toward balances; balances start fresh from there.
 *
 * Because this is derived on every call, editing or deleting an old expense
 * (or adding a payment) correctly re-opens or closes settlement periods.
 */
function getSettlementState(groupId) {
  const expenses = db.prepare(`
    SELECT e.id, e.amount, e.description, e.date, e.category, e.created_at
    FROM expenses e
    WHERE e.group_id = ? AND e.is_deleted = 0
  `).all(groupId);

  const payerStmt = db.prepare('SELECT user_id, amount FROM expense_payers WHERE expense_id = ?');
  const splitStmt = db.prepare('SELECT user_id, amount FROM expense_splits WHERE expense_id = ?');
  for (const e of expenses) {
    e.payers = payerStmt.all(e.id);
    e.splits = splitStmt.all(e.id);
    e.debts = expenseDebts(e.payers, e.splits);
  }

  const payments = db.prepare(
    'SELECT id, payer_id, payee_id, amount, created_at FROM payments WHERE group_id = ? AND is_deleted = 0'
  ).all(groupId);

  // Chronological timeline. On a timestamp tie, expenses go before payments
  // (a payment recorded in the same second most likely settles that expense).
  const events = [
    ...expenses.map(e => ({ kind: 'expense', order: 0, item: e })),
    ...payments.map(p => ({ kind: 'payment', order: 1, item: p })),
  ].sort((a, b) =>
    a.item.created_at.localeCompare(b.item.created_at) ||
    a.order - b.order ||
    a.item.id - b.item.id
  );

  const nets = {};
  let settledUpTo = -1;
  events.forEach((ev, i) => {
    if (ev.kind === 'expense') {
      for (const d of ev.item.debts) {
        nets[d.from] = (nets[d.from] || 0) - d.amount;
        nets[d.to] = (nets[d.to] || 0) + d.amount;
      }
    } else {
      // A payment from A to B moves A's balance up and B's down
      nets[ev.item.payer_id] = (nets[ev.item.payer_id] || 0) + ev.item.amount;
      nets[ev.item.payee_id] = (nets[ev.item.payee_id] || 0) - ev.item.amount;
    }
    if (Object.values(nets).every(n => n === 0)) settledUpTo = i;
  });

  const settledExpenseIds = new Set();
  const activeExpenses = [];
  const activePayments = [];
  events.forEach((ev, i) => {
    if (i <= settledUpTo) {
      if (ev.kind === 'expense') settledExpenseIds.add(ev.item.id);
    } else if (ev.kind === 'expense') {
      activeExpenses.push(ev.item);
    } else {
      activePayments.push(ev.item);
    }
  });

  return {
    settledExpenseIds,
    activeExpenses,
    activePayments,
    settledAt: settledUpTo >= 0 ? events[settledUpTo].item.created_at : null,
  };
}

/**
 * Compute balances for a group.
 * Returns pairwise debts (or simplified debts if enabled) and per-member net balances.
 * Only expenses/payments since the group was last fully settled are counted.
 */
function computeGroupBalances(groupId) {
  const group = db.prepare('SELECT simplify_debts FROM groups WHERE id = ?').get(groupId);
  const members = loadMembers(groupId);
  const { activeExpenses, activePayments, settledAt } = getSettlementState(groupId);

  // Build pairwise debt map: debts[fromUser][toUser] = amount
  // This represents "fromUser owes toUser"
  const debts = {};
  for (const m of members) {
    debts[m.id] = {};
  }

  // Also track per-pair per-expense breakdown
  // pairExpenseDebts[fromUser:toUser] = { expenseId: { expense info, amount_owed } }
  const pairExpenseDebts = {};

  for (const expense of activeExpenses) {
    for (const d of expense.debts) {
      if (!debts[d.from]) debts[d.from] = {};
      debts[d.from][d.to] = (debts[d.from][d.to] || 0) + d.amount;

      // Track per-expense contribution (aggregate by expense ID per pair)
      const pairKey = `${d.from}:${d.to}`;
      if (!pairExpenseDebts[pairKey]) pairExpenseDebts[pairKey] = {};
      if (!pairExpenseDebts[pairKey][expense.id]) {
        pairExpenseDebts[pairKey][expense.id] = {
          id: expense.id,
          description: expense.description,
          total_amount: expense.amount,
          date: expense.date,
          category: expense.category,
          amount_owed: 0,
        };
      }
      pairExpenseDebts[pairKey][expense.id].amount_owed += d.amount;
    }
  }

  // Process payments (a payment from A to B reduces A's debt to B)
  for (const payment of activePayments) {
    if (!debts[payment.payer_id]) debts[payment.payer_id] = {};
    debts[payment.payer_id][payment.payee_id] = (debts[payment.payer_id][payment.payee_id] || 0) - payment.amount;
  }

  // Net out reciprocal debts
  const netDebts = [];
  const processed = new Set();

  for (const fromId of Object.keys(debts)) {
    for (const toId of Object.keys(debts[fromId] || {})) {
      const key = [Math.min(fromId, toId), Math.max(fromId, toId)].join('-');
      if (processed.has(key)) continue;
      processed.add(key);

      const aOwesB = debts[fromId]?.[toId] || 0;
      const bOwesA = debts[toId]?.[fromId] || 0;
      const net = aOwesB - bOwesA;

      if (net > 0) {
        netDebts.push({ from_user: Number(fromId), to_user: Number(toId), amount: net });
      } else if (net < 0) {
        netDebts.push({ from_user: Number(toId), to_user: Number(fromId), amount: Math.abs(net) });
      }
    }
  }

  // Calculate per-member net balances
  const memberBalances = {};
  for (const m of members) {
    memberBalances[m.id] = 0;
  }
  for (const debt of netDebts) {
    memberBalances[debt.from_user] = (memberBalances[debt.from_user] || 0) - debt.amount;
    memberBalances[debt.to_user] = (memberBalances[debt.to_user] || 0) + debt.amount;
  }

  let balances;
  if (group.simplify_debts) {
    // Use simplified debts
    balances = simplifyDebts(memberBalances);
  } else {
    // Use pairwise debts
    balances = netDebts;
  }

  // Enrich with user names
  const memberMap = {};
  for (const m of members) {
    memberMap[m.id] = m.name;
  }
  // People who have since left the group can still appear in balances
  // (e.g. an old expense they were in gets edited) - look up their names too
  const nameStmt = db.prepare('SELECT name FROM users WHERE id = ?');
  for (const id of Object.keys(memberBalances)) {
    if (memberMap[id] === undefined && Number(id) > 0) {
      memberMap[id] = nameStmt.get(Number(id))?.name;
    }
  }

  const enrichedBalances = balances.map(b => ({
    ...b,
    from_user_name: memberMap[b.from_user] || 'Unknown',
    to_user_name: memberMap[b.to_user] || 'Unknown',
  }));

  // Convert per-expense objects to arrays
  const pairExpenses = Object.fromEntries(
    Object.entries(pairExpenseDebts).map(([key, expMap]) => [key, Object.values(expMap)])
  );

  // Also build per-member expense breakdown (for simplified debt view)
  // Shows each member's net position per expense
  const memberExpenses = {};
  for (const expense of activeExpenses) {
    const { payers, splits } = expense;

    for (const m of members) {
      const paidAmount = payers.filter(p => p.user_id === m.id).reduce((s, p) => s + p.amount, 0);
      const splitAmount = splits.filter(s => s.user_id === m.id).reduce((s, s2) => s + s2.amount, 0);
      const net = paidAmount - splitAmount;
      if (net === 0) continue;

      if (!memberExpenses[m.id]) memberExpenses[m.id] = [];
      memberExpenses[m.id].push({
        id: expense.id,
        description: expense.description,
        total_amount: expense.amount,
        date: expense.date,
        category: expense.category,
        paid: paidAmount,
        share: splitAmount,
        net: net, // positive = they paid more than their share, negative = they owe
      });
    }
  }

  return {
    balances: enrichedBalances,
    memberBalances: Object.entries(memberBalances).map(([userId, balance]) => ({
      user_id: Number(userId),
      name: memberMap[userId] || 'Unknown',
      balance,
    })),
    simplify_debts: Boolean(group.simplify_debts),
    pairExpenses,
    memberExpenses,
    settled_at: settledAt,
  };
}

/**
 * Compute dashboard balances across all groups for a user.
 */
function computeDashboardBalances(userId) {
  const groups = db.prepare(`
    SELECT g.id, g.name FROM groups g
    JOIN group_members gm ON gm.group_id = g.id
    WHERE gm.user_id = ?
  `).all(userId);

  let totalOwed = 0;    // Others owe you
  let totalOwe = 0;     // You owe others
  const byPerson = {};  // Aggregated across groups
  const groupSummaries = [];

  for (const group of groups) {
    const { balances, memberBalances } = computeGroupBalances(group.id);

    // Find current user's net balance in this group
    const userBalance = memberBalances.find(mb => mb.user_id === userId);
    const netBalance = userBalance ? userBalance.balance : 0;

    if (netBalance > 0) totalOwed += netBalance;
    if (netBalance < 0) totalOwe += Math.abs(netBalance);

    // Build per-person breakdown
    for (const debt of balances) {
      if (debt.from_user === userId) {
        // You owe this person
        const key = debt.to_user;
        if (!byPerson[key]) {
          byPerson[key] = { user_id: key, name: debt.to_user_name, amount: 0 };
        }
        byPerson[key].amount -= debt.amount;
      } else if (debt.to_user === userId) {
        // This person owes you
        const key = debt.from_user;
        if (!byPerson[key]) {
          byPerson[key] = { user_id: key, name: debt.from_user_name, amount: 0 };
        }
        byPerson[key].amount += debt.amount;
      }
    }

    groupSummaries.push({
      group_id: group.id,
      group_name: group.name,
      balance: netBalance,
    });
  }

  return {
    totalOwed,
    totalOwe,
    netBalance: totalOwed - totalOwe,
    byPerson: Object.values(byPerson).filter(p => p.amount !== 0),
    groupSummaries: groupSummaries.filter(g => g.balance !== 0),
  };
}

/**
 * Compute detailed per-member breakdown for a group.
 * For each member: their total paid, total share owed, and the list of expenses involved.
 */
function computeDetailedBreakdown(groupId) {
  const members = loadMembers(groupId);
  const { settledExpenseIds } = getSettlementState(groupId);

  const memberMap = {};
  for (const m of members) memberMap[m.id] = m.name;

  // Get all active expenses with payer/split details
  const expenses = db.prepare(`
    SELECT e.id, e.description, e.amount, e.category, e.date, e.trip_id,
      e.created_by, u.name as created_by_name
    FROM expenses e
    JOIN users u ON u.id = e.created_by
    WHERE e.group_id = ? AND e.is_deleted = 0
    ORDER BY date(e.date) DESC, e.created_at DESC, e.id DESC
  `).all(groupId);

  const detailedExpenses = expenses.map(e => {
    const payers = db.prepare(`
      SELECT ep.user_id, ep.amount,
        CASE WHEN ep.user_id > 0 THEN u.name
             ELSE (SELECT pm.name FROM placeholder_members pm WHERE pm.id = -ep.user_id)
        END as user_name
      FROM expense_payers ep
      LEFT JOIN users u ON u.id = ep.user_id
      WHERE ep.expense_id = ?
    `).all(e.id);

    const splits = db.prepare(`
      SELECT es.user_id, es.amount, es.share_value,
        CASE WHEN es.user_id > 0 THEN u.name
             ELSE (SELECT pm.name FROM placeholder_members pm WHERE pm.id = -es.user_id)
        END as user_name
      FROM expense_splits es
      LEFT JOIN users u ON u.id = es.user_id
      WHERE es.expense_id = ?
    `).all(e.id);

    return { ...e, payers, splits, is_settled: settledExpenseIds.has(e.id) };
  });
  const activeDetailedExpenses = detailedExpenses.filter(e => !e.is_settled);

  // Compute per-member summary
  const memberDetails = members.map(m => {
    let totalPaid = 0;
    let totalShare = 0;
    const involvedExpenses = [];

    for (const exp of activeDetailedExpenses) {
      const payer = exp.payers.find(p => p.user_id === m.id);
      const split = exp.splits.find(s => s.user_id === m.id);

      if (payer || split) {
        const paid = payer ? payer.amount : 0;
        const share = split ? split.amount : 0;
        totalPaid += paid;
        totalShare += share;

        involvedExpenses.push({
          id: exp.id,
          description: exp.description,
          total_amount: exp.amount,
          date: exp.date,
          category: exp.category,
          paid: paid,
          share: share,
          net: paid - share,
        });
      }
    }

    return {
      user_id: m.id,
      name: m.name,
      total_paid: totalPaid,
      total_share: totalShare,
      net_balance: totalPaid - totalShare,
      expenses: involvedExpenses,
    };
  });

  // Compute per-pair expense breakdown (which expenses contribute to each A→B debt)
  const pairExpenses = {};
  for (const exp of activeDetailedExpenses) {
    for (const d of expenseDebts(exp.payers, exp.splits)) {
      // d.from owes d.to for this expense
      const pairKey = `${d.from}:${d.to}`;
      if (!pairExpenses[pairKey]) pairExpenses[pairKey] = [];
      pairExpenses[pairKey].push({
        id: exp.id,
        description: exp.description,
        total_amount: exp.amount,
        date: exp.date,
        category: exp.category,
        amount_owed: d.amount,
      });
    }
  }

  // Get payments
  const payments = db.prepare(`
    SELECT p.id, p.payer_id, p.payee_id, p.amount, p.created_at,
      CASE WHEN p.payer_id > 0 THEN payer.name
           ELSE (SELECT pm.name FROM placeholder_members pm WHERE pm.id = -p.payer_id)
      END as payer_name,
      CASE WHEN p.payee_id > 0 THEN payee.name
           ELSE (SELECT pm.name FROM placeholder_members pm WHERE pm.id = -p.payee_id)
      END as payee_name
    FROM payments p
    LEFT JOIN users payer ON payer.id = p.payer_id
    LEFT JOIN users payee ON payee.id = p.payee_id
    WHERE p.group_id = ? AND p.is_deleted = 0
    ORDER BY p.created_at DESC
  `).all(groupId);

  return {
    members: memberDetails,
    expenses: detailedExpenses,
    payments,
    pairExpenses,
  };
}

module.exports = {
  computeGroupBalances,
  computeDashboardBalances,
  computeDetailedBreakdown,
  getSettlementState,
  loadMembers,
};
