const express = require('express');
const router = express.Router();
const paymentService = require('../services/paymentService');
const authMiddleware = require('../middleware/auth');
const { groupAccess } = require('../middleware/groupAccess');
const validate = require('../middleware/validate');
const { createPaymentSchema, updatePaymentSchema } = require('../validators/paymentValidator');

router.use(authMiddleware);

// List payments in group
router.get('/:groupId/payments', groupAccess, (req, res, next) => {
  try {
    const payments = paymentService.getGroupPayments(req.params.groupId);
    res.json({ payments });
  } catch (err) {
    next(err);
  }
});

// Record a payment
router.post('/:groupId/payments', groupAccess, validate(createPaymentSchema), (req, res, next) => {
  try {
    const payment = paymentService.recordPayment(
      Number(req.params.groupId),
      req.user.id,
      req.body.payer_id ?? req.user.id, // defaults to "I paid"
      req.body.payee_id,
      req.body.amount,
      req.body.note
    );
    res.status(201).json({ payment });
  } catch (err) {
    next(err);
  }
});

// Get one payment (?include_deleted=1 to view a deleted one so it can be restored)
router.get('/:groupId/payments/:paymentId', groupAccess, (req, res, next) => {
  try {
    const payment = paymentService.getPaymentById(req.params.paymentId, req.params.groupId, {
      includeDeleted: req.query.include_deleted === '1',
    });
    res.json({ payment });
  } catch (err) {
    next(err);
  }
});

// Edit a payment
router.put('/:groupId/payments/:paymentId', groupAccess, validate(updatePaymentSchema), (req, res, next) => {
  try {
    const payment = paymentService.updatePayment(
      req.params.paymentId, req.params.groupId, req.user.id, req.body
    );
    res.json({ payment });
  } catch (err) {
    next(err);
  }
});

// Delete a payment (soft delete; can be restored)
router.delete('/:groupId/payments/:paymentId', groupAccess, (req, res, next) => {
  try {
    paymentService.deletePayment(req.params.paymentId, req.params.groupId, req.user.id);
    res.json({ message: 'Payment deleted' });
  } catch (err) {
    next(err);
  }
});

// Restore a deleted payment
router.post('/:groupId/payments/:paymentId/restore', groupAccess, (req, res, next) => {
  try {
    const payment = paymentService.restorePayment(req.params.paymentId, req.params.groupId, req.user.id);
    res.json({ payment });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
