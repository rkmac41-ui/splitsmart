const db = require('../db/connection');

function logActivity(groupId, userId, action, entityType, entityId, metadata = null) {
  db.prepare(`
    INSERT INTO activity_log (group_id, user_id, action, entity_type, entity_id, metadata)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(groupId, userId, action, entityType, entityId, metadata ? JSON.stringify(metadata) : null);
}

function getGroupActivity(groupId, limit = 50, offset = 0) {
  const activities = db.prepare(`
    SELECT al.*, u.name as user_name
    FROM activity_log al
    JOIN users u ON u.id = al.user_id
    WHERE al.group_id = ?
    ORDER BY al.created_at DESC
    LIMIT ? OFFSET ?
  `).all(groupId, limit, offset);

  return activities.map(a => ({
    ...a,
    metadata: a.metadata ? JSON.parse(a.metadata) : null,
  }));
}

function getGlobalActivity(userId, limit = 50, offset = 0) {
  const activities = db.prepare(`
    SELECT al.*, u.name as user_name, g.name as group_name
    FROM activity_log al
    JOIN users u ON u.id = al.user_id
    JOIN groups g ON g.id = al.group_id
    WHERE al.group_id IN (
      SELECT group_id FROM group_members WHERE user_id = ?
    )
    ORDER BY al.created_at DESC
    LIMIT ? OFFSET ?
  `).all(userId, limit, offset);

  return activities.map(a => ({
    ...a,
    metadata: a.metadata ? JSON.parse(a.metadata) : null,
  }));
}

module.exports = { logActivity, getGroupActivity, getGlobalActivity };
