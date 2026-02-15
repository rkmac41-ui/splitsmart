const express = require('express');
const router = express.Router();
const paymentService = require('../services/paymentService');
const authMiddleware = require('../middleware/auth');
const { groupAccess } = require('../middleware/groupAccess');
const validate = require('../middleware/validate');
const { createPaymentSchema } = require('../validators/paymentValidator');

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
      req.body.payee_id,
      req.body.amount,
      req.body.note
    );
    res.status(201).json({ payment });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
