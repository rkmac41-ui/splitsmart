const db = require('../db/connection');

/**
 * Create notifications for multiple recipients.
 * @param {string} type - Notification type
 * @param {number} groupId - Group ID
 * @param {number} actorId - User who triggered the notification
 * @param {string} entityType - 'expense', 'payment', 'member'
 * @param {number} entityId - ID of the related entity
 * @param {number[]} recipientIds - Array of user IDs to notify (actor is automatically excluded)
 * @param {string} message - Notification message
 */
function createNotification(type, groupId, actorId, entityType, entityId, recipientIds, message) {
  const stmt = db.prepare(`
    INSERT INTO notifications (user_id, type, group_id, actor_id, entity_type, entity_id, message)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const insertMany = db.transaction((recipients) => {
    for (const recipientId of recipients) {
      if (recipientId !== actorId) {
        stmt.run(recipientId, type, groupId, actorId, entityType, entityId, message);
      }
    }
  });

  insertMany(recipientIds);
}

/**
 * Create notifications for all group members except the actor.
 */
function notifyGroupMembers(type, groupId, actorId, entityType, entityId, message) {
  const members = db.prepare(
    'SELECT user_id FROM group_members WHERE group_id = ?'
  ).all(groupId);

  const recipientIds = members.map(m => m.user_id);
  createNotification(type, groupId, actorId, entityType, entityId, recipientIds, message);
}

function getUserNotifications(userId, limit = 50, offset = 0) {
  return db.prepare(`
    SELECT n.*, u.name as actor_name, g.name as group_name
    FROM notifications n
    JOIN users u ON u.id = n.actor_id
    LEFT JOIN groups g ON g.id = n.group_id
    WHERE n.user_id = ?
    ORDER BY n.created_at DESC
    LIMIT ? OFFSET ?
  `).all(userId, limit, offset);
}

function getUnreadCount(userId) {
  const result = db.prepare(
    'SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = 0'
  ).get(userId);
  return result.count;
}

function markAsRead(notificationId, userId) {
  db.prepare(
    'UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?'
  ).run(notificationId, userId);
}

function markAllAsRead(userId) {
  db.prepare(
    'UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0'
  ).run(userId);
}

module.exports = {
  createNotification,
  notifyGroupMembers,
  getUserNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
};
