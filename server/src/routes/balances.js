const express = require('express');
const router = express.Router();
const balanceService = require('../services/balanceService');
const authMiddleware = require('../middleware/auth');
const { groupAccess } = require('../middleware/groupAccess');

router.use(authMiddleware);

// Get group balances
router.get('/:groupId/balances', groupAccess, (req, res, next) => {
  try {
    const balances = balanceService.computeGroupBalances(Number(req.params.groupId));
    res.json(balances);
  } catch (err) {
    next(err);
  }
});

// Get dashboard balances
router.get('/dashboard', (req, res, next) => {
  try {
    const dashboard = balanceService.computeDashboardBalances(req.user.id);
    res.json(dashboard);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
