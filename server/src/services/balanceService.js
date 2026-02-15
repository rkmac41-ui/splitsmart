const db = require('../db/connection');
const { simplifyDebts } = require('../utils/debtSimplifier');

/**
 * Compute balances for a group.
 * Returns pairwise debts (or simplified debts if enabled) and per-member net balances.
 */
function computeGroupBalances(groupId) {
  const group = db.prepare('SELECT simplify_debts FROM groups WHERE id = ?').get(groupId);
  const members = db.prepare(`
    SELECT u.id, u.name FROM group_members gm
    JOIN users u ON u.id = gm.user_id
    WHERE gm.group_id = ?
  `).all(groupId);

  // Build pairwise debt map: debts[fromUser][toUser] = amount
  // This represents "fromUser owes toUser"
  const debts = {};
  for (const m of members) {
    debts[m.id] = {};
  }

  // Process all non-deleted expenses
  const expenses = db.prepare(
    'SELECT id, amount FROM expenses WHERE group_id = ? AND is_deleted = 0'
  ).all(groupId);

  for (const expense of expenses) {
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

        if (!debts[split.user_id]) debts[split.user_id] = {};
        debts[split.user_id][payer.user_id] = (debts[split.user_id][payer.user_id] || 0) + owedAmount;
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

module.exports = { computeGroupBalances, computeDashboardBalances };
