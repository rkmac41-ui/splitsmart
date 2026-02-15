const express = require('express');
const router = express.Router();
const notificationService = require('../services/notificationService');
const authMiddleware = require('../middleware/auth');

router.use(authMiddleware);

// Get notifications
router.get('/', (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;
    const notifications = notificationService.getUserNotifications(req.user.id, limit, offset);
    res.json({ notifications });
  } catch (err) {
    next(err);
  }
});

// Get unread count
router.get('/count', (req, res, next) => {
  try {
    const count = notificationService.getUnreadCount(req.user.id);
    res.json({ count });
  } catch (err) {
    next(err);
  }
});

// Mark one as read
router.put('/:id/read', (req, res, next) => {
  try {
    notificationService.markAsRead(req.params.id, req.user.id);
    res.json({ message: 'Marked as read' });
  } catch (err) {
    next(err);
  }
});

// Mark all as read
router.put('/read-all', (req, res, next) => {
  try {
    notificationService.markAllAsRead(req.user.id);
    res.json({ message: 'All marked as read' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
