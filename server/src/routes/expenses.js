const express = require('express');
const router = express.Router();
const expenseService = require('../services/expenseService');
const authMiddleware = require('../middleware/auth');
const { groupAccess } = require('../middleware/groupAccess');
const validate = require('../middleware/validate');
const { createExpenseSchema, updateExpenseSchema } = require('../validators/expenseValidator');

router.use(authMiddleware);

// List expenses in group
router.get('/:groupId/expenses', groupAccess, (req, res, next) => {
  try {
    const tripId = req.query.tripId || null;
    const expenses = expenseService.getGroupExpenses(req.params.groupId, tripId);
    res.json({ expenses });
  } catch (err) {
    next(err);
  }
});

// Create expense
router.post('/:groupId/expenses', groupAccess, validate(createExpenseSchema), (req, res, next) => {
  try {
    const expense = expenseService.createExpense(
      Number(req.params.groupId),
      req.body,
      req.user.id
    );
    res.status(201).json({ expense });
  } catch (err) {
    next(err);
  }
});

// Get expense
router.get('/:groupId/expenses/:expenseId', groupAccess, (req, res, next) => {
  try {
    const expense = expenseService.getExpenseById(req.params.expenseId);
    res.json({ expense });
  } catch (err) {
    next(err);
  }
});

// Update expense
router.put('/:groupId/expenses/:expenseId', groupAccess, validate(updateExpenseSchema), (req, res, next) => {
  try {
    const expense = expenseService.updateExpense(
      req.params.expenseId,
      req.body,
      req.user.id
    );
    res.json({ expense });
  } catch (err) {
    next(err);
  }
});

// Delete expense
router.delete('/:groupId/expenses/:expenseId', groupAccess, (req, res, next) => {
  try {
    expenseService.deleteExpense(req.params.expenseId, req.user.id);
    res.json({ message: 'Expense deleted' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
