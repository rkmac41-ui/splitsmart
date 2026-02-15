const express = require('express');
const router = express.Router();
const activityService = require('../services/activityService');
const authMiddleware = require('../middleware/auth');
const { groupAccess } = require('../middleware/groupAccess');

router.use(authMiddleware);

// Group activity feed
router.get('/groups/:groupId/activity', groupAccess, (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;
    const activities = activityService.getGroupActivity(req.params.groupId, limit, offset);
    res.json({ activities });
  } catch (err) {
    next(err);
  }
});

// Global activity feed
router.get('/activity', (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;
    const activities = activityService.getGlobalActivity(req.user.id, limit, offset);
    res.json({ activities });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
