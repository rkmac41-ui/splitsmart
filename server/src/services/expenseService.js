const db = require('../db/connection');
const { NotFoundError, ValidationError } = require('../utils/errors');
const { calculateSplit } = require('../utils/splitCalculator');
const activityService = require('./activityService');
const { getSettlementState, loadMembers } = require('./balanceService');
const notificationService = require('./notificationService');

/**
 * Make sure everyone on the expense belongs to the group and the trip (if any)
 * is one of the group's trips. `alsoAllowed` lets an edit keep people who were
 * already on the expense even if they have since left the group.
 */
function validateParticipants(groupId, { trip_id, payers, splits }, alsoAllowed = []) {
  const allowed = new Set([...loadMembers(groupId).map(m => m.id), ...alsoAllowed]);

  for (const [label, list] of [['payer', payers], ['split', splits]]) {
    const seen = new Set();
    for (const { user_id } of list) {
      if (!allowed.has(user_id)) {
        throw new ValidationError(`Every ${label} must be a member of this group`);
      }
      if (seen.has(user_id)) {
        throw new ValidationError(`The same person is listed twice as a ${label}`);
      }
      seen.add(user_id);
    }
  }

  if (trip_id !== null && trip_id !== undefined) {
    const trip = db.prepare('SELECT id FROM trips WHERE id = ? AND group_id = ?').get(trip_id, groupId);
    if (!trip) throw new ValidationError('Trip not found in this group');
  }
}

function createExpense(groupId, data, userId) {
  const { description, amount, category, split_type, date, trip_id, payers, splits } = data;
  validateParticipants(groupId, data);

  // Validate payers sum equals total
  const payerSum = payers.reduce((s, p) => s + p.amount, 0);
  if (payerSum !== amount) {
    throw new ValidationError(`Payer amounts (${payerSum}) must equal total (${amount})`);
  }

  // Calculate split amounts
  const calculatedSplits = calculateSplit(split_type, amount, splits);

  const user = db.prepare('SELECT name FROM users WHERE id = ?').get(userId);

  const expense = db.transaction(() => {
    const result = db.prepare(`
      INSERT INTO expenses (group_id, trip_id, description, amount, category, split_type, date, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(groupId, trip_id, description, amount, category, split_type, date, userId);

    const expenseId = result.lastInsertRowid;

    // Insert payers
    const payerStmt = db.prepare(
      'INSERT INTO expense_payers (expense_id, user_id, amount) VALUES (?, ?, ?)'
    );
    for (const payer of payers) {
      payerStmt.run(expenseId, payer.user_id, payer.amount);
    }

    // Insert splits
    const splitStmt = db.prepare(
      'INSERT INTO expense_splits (expense_id, user_id, amount, share_value) VALUES (?, ?, ?, ?)'
    );
    for (const split of calculatedSplits) {
      splitStmt.run(expenseId, split.user_id, split.amount, split.share_value);
    }

    // Log activity
    activityService.logActivity(groupId, userId, 'expense_added', 'expense', expenseId, {
      description,
      amount,
      category,
      split_type,
    });

    // Notify group members
    const formattedAmount = (amount / 100).toFixed(2);
    notificationService.notifyGroupMembers(
      'expense_added',
      groupId,
      userId,
      'expense',
      expenseId,
      `${user.name} added "${description}" ($${formattedAmount})`
    );

    return expenseId;
  })();

  return getExpenseById(expense);
}

function getGroupExpenses(groupId, tripId = null) {
  let query = `
    SELECT e.*, u.name as created_by_name
    FROM expenses e
    JOIN users u ON u.id = e.created_by
    WHERE e.group_id = ? AND e.is_deleted = 0
  `;
  const params = [groupId];

  if (tripId !== null && tripId !== undefined) {
    if (tripId === 'none') {
      query += ' AND e.trip_id IS NULL';
    } else {
      query += ' AND e.trip_id = ?';
      params.push(tripId);
    }
  }

  // Latest first: by expense date, then by when it was recorded
  query += ' ORDER BY date(e.date) DESC, e.created_at DESC, e.id DESC';

  const expenses = db.prepare(query).all(...params);
  const { settledExpenseIds } = getSettlementState(groupId);

  // Fetch payers and splits for each expense
  return expenses.map(e => ({ ...enrichExpense(e), is_settled: settledExpenseIds.has(e.id) }));
}

function getExpenseById(expenseId, groupId) {
  const expense = db.prepare(`
    SELECT e.*, u.name as created_by_name
    FROM expenses e
    JOIN users u ON u.id = e.created_by
    WHERE e.id = ? AND e.is_deleted = 0
  `).get(expenseId);

  // Scope to the group the caller has access to, so a member of one group
  // can't read or modify another group's expenses by guessing IDs.
  if (!expense || (groupId !== undefined && expense.group_id !== Number(groupId))) {
    throw new NotFoundError('Expense not found');
  }

  const { settledExpenseIds } = getSettlementState(expense.group_id);
  return { ...enrichExpense(expense), is_settled: settledExpenseIds.has(expense.id) };
}

function enrichExpense(expense) {
  // LEFT JOIN to users for real members; placeholder IDs are negative
  const payers = db.prepare(`
    SELECT ep.*,
      CASE WHEN ep.user_id > 0 THEN u.name
           ELSE (SELECT pm.name FROM placeholder_members pm WHERE pm.id = -ep.user_id)
      END as user_name
    FROM expense_payers ep
    LEFT JOIN users u ON u.id = ep.user_id
    WHERE ep.expense_id = ?
  `).all(expense.id);

  const splits = db.prepare(`
    SELECT es.*,
      CASE WHEN es.user_id > 0 THEN u.name
           ELSE (SELECT pm.name FROM placeholder_members pm WHERE pm.id = -es.user_id)
      END as user_name
    FROM expense_splits es
    LEFT JOIN users u ON u.id = es.user_id
    WHERE es.expense_id = ?
  `).all(expense.id);

  return { ...expense, payers, splits };
}

function updateExpense(expenseId, data, userId, groupId) {
  const oldExpense = getExpenseById(expenseId, groupId);
  const { description, amount, category, split_type, date, trip_id, payers, splits } = data;
  validateParticipants(oldExpense.group_id, data, [
    ...oldExpense.payers.map(p => p.user_id),
    ...oldExpense.splits.map(s => s.user_id),
  ]);

  // Validate payers sum
  const payerSum = payers.reduce((s, p) => s + p.amount, 0);
  if (payerSum !== amount) {
    throw new ValidationError(`Payer amounts (${payerSum}) must equal total (${amount})`);
  }

  const calculatedSplits = calculateSplit(split_type, amount, splits);
  const user = db.prepare('SELECT name FROM users WHERE id = ?').get(userId);

  db.transaction(() => {
    db.prepare(`
      UPDATE expenses SET description = ?, amount = ?, category = ?, split_type = ?,
        date = ?, trip_id = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(description, amount, category, split_type, date, trip_id, expenseId);

    // Replace payers
    db.prepare('DELETE FROM expense_payers WHERE expense_id = ?').run(expenseId);
    const payerStmt = db.prepare(
      'INSERT INTO expense_payers (expense_id, user_id, amount) VALUES (?, ?, ?)'
    );
    for (const payer of payers) {
      payerStmt.run(expenseId, payer.user_id, payer.amount);
    }

    // Replace splits
    db.prepare('DELETE FROM expense_splits WHERE expense_id = ?').run(expenseId);
    const splitStmt = db.prepare(
      'INSERT INTO expense_splits (expense_id, user_id, amount, share_value) VALUES (?, ?, ?, ?)'
    );
    for (const split of calculatedSplits) {
      splitStmt.run(expenseId, split.user_id, split.amount, split.share_value);
    }

    // Log activity with old/new diff
    activityService.logActivity(oldExpense.group_id, userId, 'expense_edited', 'expense', expenseId, {
      old: { description: oldExpense.description, amount: oldExpense.amount, category: oldExpense.category },
      new: { description, amount, category },
    });

    const formattedAmount = (amount / 100).toFixed(2);
    notificationService.notifyGroupMembers(
      'expense_edited',
      oldExpense.group_id,
      userId,
      'expense',
      expenseId,
      `${user.name} edited "${description}" ($${formattedAmount})`
    );
  })();

  return getExpenseById(expenseId);
}

function deleteExpense(expenseId, userId, groupId) {
  const expense = getExpenseById(expenseId, groupId);
  const user = db.prepare('SELECT name FROM users WHERE id = ?').get(userId);

  db.transaction(() => {
    db.prepare("UPDATE expenses SET is_deleted = 1, updated_at = datetime('now') WHERE id = ?").run(expenseId);

    activityService.logActivity(expense.group_id, userId, 'expense_deleted', 'expense', expenseId, {
      description: expense.description,
      amount: expense.amount,
    });

    const formattedAmount = (expense.amount / 100).toFixed(2);
    notificationService.notifyGroupMembers(
      'expense_deleted',
      expense.group_id,
      userId,
      'expense',
      expenseId,
      `${user.name} deleted "${expense.description}" ($${formattedAmount})`
    );
  })();

  return expense;
}

module.exports = {
  createExpense,
  getGroupExpenses,
  getExpenseById,
  updateExpense,
  deleteExpense,
};
