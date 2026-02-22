const db = require('../db/connection');
const { simplifyDebts } = require('../utils/debtSimplifier');

/**
 * Compute balances for a group.
 * Returns pairwise debts (or simplified debts if enabled) and per-member net balances.
 */
function computeGroupBalances(groupId) {
  const group = db.prepare('SELECT simplify_debts FROM groups WHERE id = ?').get(groupId);

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

  const members = [
    ...realMembers,
    ...placeholders.map(p => ({ id: -p.id, name: p.name })),
  ];

  // Build pairwise debt map: debts[fromUser][toUser] = amount
  // This represents "fromUser owes toUser"
  const debts = {};
  for (const m of members) {
    debts[m.id] = {};
  }

  // Also track per-pair per-expense breakdown
  // pairExpenseDebts[fromUser:toUser] = [ { expense info, amount_owed } ]
  const pairExpenseDebts = {};

  // Process all non-deleted expenses
  const allExpenses = db.prepare(`
    SELECT e.id, e.amount, e.description, e.date, e.category
    FROM expenses e
    WHERE e.group_id = ? AND e.is_deleted = 0
  `).all(groupId);

  for (const expense of allExpenses) {
    const payers = db.prepare(
      'SELECT user_id, amount FROM expense_payers WHERE expense_id = ?'
    ).all(expense.id);

    const splits = db.prepare(
      'SELECT user_id, amount FROM expense_splits WHERE expense_id = ?'
    ).all(expense.id);

    // Total paid for this expense
    const totalPaid = payers.reduce((s, p) => s + p.amount, 0);

    // For each split member, they owe their split amount.
    // That amount is distributed to payers proportionally to how much each payer paid.
    for (const split of splits) {
      for (const payer of payers) {
        if (split.user_id === payer.user_id) continue;

        // This split user owes the payer: split.amount * (payer.amount / totalPaid)
        const owedAmount = Math.round((split.amount * payer.amount) / totalPaid);
        if (owedAmount <= 0) continue;

        if (!debts[split.user_id]) debts[split.user_id] = {};
        debts[split.user_id][payer.user_id] = (debts[split.user_id][payer.user_id] || 0) + owedAmount;

        // Track per-expense contribution (aggregate by expense ID per pair)
        const pairKey = `${split.user_id}:${payer.user_id}`;
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
        pairExpenseDebts[pairKey][expense.id].amount_owed += owedAmount;
      }
    }
  }

  // Process payments (a payment from A to B reduces A's debt to B)
  const payments = db.prepare(
    'SELECT payer_id, payee_id, amount FROM payments WHERE group_id = ?'
  ).all(groupId);

  for (const payment of payments) {
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

  const enrichedBalances = balances.map(b => ({
    ...b,
    from_user_name: memberMap[b.from_user] || 'Unknown',
    to_user_name: memberMap[b.to_user] || 'Unknown',
  }));

  return {
    balances: enrichedBalances,
    memberBalances: Object.entries(memberBalances).map(([userId, balance]) => ({
      user_id: Number(userId),
      name: memberMap[userId] || 'Unknown',
      balance,
    })),
    simplify_debts: Boolean(group.simplify_debts),
    // Convert per-expense objects to arrays
    pairExpenses: Object.fromEntries(
      Object.entries(pairExpenseDebts).map(([key, expMap]) => [key, Object.values(expMap)])
    ),
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
  // Real members
  const realMembers = db.prepare(`
    SELECT u.id, u.name FROM group_members gm
    JOIN users u ON u.id = gm.user_id
    WHERE gm.group_id = ?
  `).all(groupId);

  const placeholders = db.prepare(`
    SELECT id, name FROM placeholder_members
    WHERE group_id = ? AND claimed_by IS NULL
  `).all(groupId);

  const members = [
    ...realMembers,
    ...placeholders.map(p => ({ id: -p.id, name: p.name })),
  ];

  const memberMap = {};
  for (const m of members) memberMap[m.id] = m.name;

  // Get all active expenses with payer/split details
  const expenses = db.prepare(`
    SELECT e.id, e.description, e.amount, e.category, e.date, e.trip_id,
      e.created_by, u.name as created_by_name
    FROM expenses e
    JOIN users u ON u.id = e.created_by
    WHERE e.group_id = ? AND e.is_deleted = 0
    ORDER BY e.date DESC, e.created_at DESC
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

    return { ...e, payers, splits };
  });

  // Compute per-member summary
  const memberDetails = members.map(m => {
    let totalPaid = 0;
    let totalShare = 0;
    const involvedExpenses = [];

    for (const exp of detailedExpenses) {
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
  for (const exp of detailedExpenses) {
    const totalPaid = exp.payers.reduce((s, p) => s + p.amount, 0);
    if (totalPaid === 0) continue;

    for (const split of exp.splits) {
      for (const payer of exp.payers) {
        if (split.user_id === payer.user_id) continue;
        // split.user_id owes payer.user_id for this expense
        const owedAmount = Math.round((split.amount * payer.amount) / totalPaid);
        if (owedAmount <= 0) continue;

        const pairKey = `${split.user_id}:${payer.user_id}`;
        if (!pairExpenses[pairKey]) pairExpenses[pairKey] = [];
        pairExpenses[pairKey].push({
          id: exp.id,
          description: exp.description,
          total_amount: exp.amount,
          date: exp.date,
          category: exp.category,
          amount_owed: owedAmount,
        });
      }
    }
  }

  // Get payments
  const payments = db.prepare(`
    SELECT p.id, p.payer_id, p.payee_id, p.amount, p.created_at,
      payer.name as payer_name, payee.name as payee_name
    FROM payments p
    JOIN users payer ON payer.id = p.payer_id
    JOIN users payee ON payee.id = p.payee_id
    WHERE p.group_id = ?
    ORDER BY p.created_at DESC
  `).all(groupId);

  return {
    members: memberDetails,
    expenses: detailedExpenses,
    payments,
    pairExpenses,
  };
}

module.exports = { computeGroupBalances, computeDashboardBalances, computeDetailedBreakdown };
