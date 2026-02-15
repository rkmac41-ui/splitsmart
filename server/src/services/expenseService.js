const db = require('../db/connection');
const { NotFoundError, ValidationError } = require('../utils/errors');
const { calculateSplit } = require('../utils/splitCalculator');
const activityService = require('./activityService');
const notificationService = require('./notificationService');

function createExpense(groupId, data, userId) {
  const { description, amount, category, split_type, date, trip_id, payers, splits } = data;

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

  query += ' ORDER BY e.date DESC, e.created_at DESC';

  const expenses = db.prepare(query).all(...params);

  // Fetch payers and splits for each expense
  return expenses.map(e => enrichExpense(e));
}

function getExpenseById(expenseId) {
  const expense = db.prepare(`
    SELECT e.*, u.name as created_by_name
    FROM expenses e
    JOIN users u ON u.id = e.created_by
    WHERE e.id = ? AND e.is_deleted = 0
  `).get(expenseId);

  if (!expense) throw new NotFoundError('Expense not found');

  return enrichExpense(expense);
}

function enrichExpense(expense) {
  const payers = db.prepare(`
    SELECT ep.*, u.name as user_name
    FROM expense_payers ep
    JOIN users u ON u.id = ep.user_id
    WHERE ep.expense_id = ?
  `).all(expense.id);

  const splits = db.prepare(`
    SELECT es.*, u.name as user_name
    FROM expense_splits es
    JOIN users u ON u.id = es.user_id
    WHERE es.expense_id = ?
  `).all(expense.id);

  return { ...expense, payers, splits };
}

function updateExpense(expenseId, data, userId) {
  const oldExpense = getExpenseById(expenseId);
  const { description, amount, category, split_type, date, trip_id, payers, splits } = data;

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

function deleteExpense(expenseId, userId) {
  const expense = getExpenseById(expenseId);
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
