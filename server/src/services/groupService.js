const db = require('../db/connection');
const { v4: uuidv4 } = require('uuid');
const { NotFoundError, ForbiddenError, ConflictError } = require('../utils/errors');
const activityService = require('./activityService');
const notificationService = require('./notificationService');

function createGroup(name, userId) {
  const create = db.transaction(() => {
    const result = db.prepare(
      'INSERT INTO groups (name, created_by) VALUES (?, ?)'
    ).run(name, userId);

    const groupId = result.lastInsertRowid;

    db.prepare(
      'INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, ?)'
    ).run(groupId, userId, 'admin');

    activityService.logActivity(groupId, userId, 'group_created', 'group', groupId, { name });

    return groupId;
  });

  const groupId = create();
  return getGroupById(groupId);
}

function getUserGroups(userId) {
  return db.prepare(`
    SELECT g.*, gm.role,
      (SELECT COUNT(*) FROM group_members WHERE group_id = g.id) as member_count
    FROM groups g
    JOIN group_members gm ON gm.group_id = g.id AND gm.user_id = ?
    ORDER BY g.updated_at DESC
  `).all(userId);
}

function getGroupById(groupId) {
  const group = db.prepare(`
    SELECT g.*,
      (SELECT COUNT(*) FROM group_members WHERE group_id = g.id) as member_count
    FROM groups g
    WHERE g.id = ?
  `).get(groupId);

  if (!group) throw new NotFoundError('Group not found');
  return group;
}

function updateGroup(groupId, updates) {
  const fields = [];
  const values = [];

  if (updates.name !== undefined) {
    fields.push('name = ?');
    values.push(updates.name);
  }
  if (updates.simplify_debts !== undefined) {
    fields.push('simplify_debts = ?');
    values.push(updates.simplify_debts ? 1 : 0);
  }

  if (fields.length === 0) return getGroupById(groupId);

  fields.push("updated_at = datetime('now')");
  values.push(groupId);

  db.prepare(`UPDATE groups SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  return getGroupById(groupId);
}

function deleteGroup(groupId, userId) {
  const group = getGroupById(groupId);
  const member = db.prepare(
    'SELECT role FROM group_members WHERE group_id = ? AND user_id = ?'
  ).get(groupId, userId);

  if (!member || member.role !== 'admin') {
    throw new ForbiddenError('Only admins can delete groups');
  }

  db.prepare('DELETE FROM groups WHERE id = ?').run(groupId);
  return group;
}

function getGroupMembers(groupId) {
  return db.prepare(`
    SELECT u.id, u.name, u.email, gm.role, gm.joined_at
    FROM group_members gm
    JOIN users u ON u.id = gm.user_id
    WHERE gm.group_id = ?
    ORDER BY gm.joined_at ASC
  `).all(groupId);
}

function removeMember(groupId, targetUserId, requestorId) {
  // Users can remove themselves, admins can remove anyone
  if (targetUserId !== requestorId) {
    const requestor = db.prepare(
      'SELECT role FROM group_members WHERE group_id = ? AND user_id = ?'
    ).get(groupId, requestorId);

    if (!requestor || requestor.role !== 'admin') {
      throw new ForbiddenError('Only admins can remove other members');
    }
  }

  const target = db.prepare(
    'SELECT user_id FROM group_members WHERE group_id = ? AND user_id = ?'
  ).get(groupId, targetUserId);

  if (!target) throw new NotFoundError('Member not found in group');

  const targetUser = db.prepare('SELECT name FROM users WHERE id = ?').get(targetUserId);

  db.transaction(() => {
    db.prepare(
      'DELETE FROM group_members WHERE group_id = ? AND user_id = ?'
    ).run(groupId, targetUserId);

    const action = targetUserId === requestorId ? 'member_left' : 'member_removed';
    activityService.logActivity(groupId, requestorId, action, 'member', targetUserId, {
      member_name: targetUser.name,
    });

    notificationService.notifyGroupMembers(
      action,
      groupId,
      requestorId,
      'member',
      targetUserId,
      `${targetUser.name} ${action === 'member_left' ? 'left' : 'was removed from'} the group`
    );
  })();
}

function generateInviteLink(groupId, userId) {
  // Deactivate existing links
  db.prepare(
    'UPDATE group_invite_links SET is_active = 0 WHERE group_id = ?'
  ).run(groupId);

  const token = uuidv4();
  db.prepare(
    'INSERT INTO group_invite_links (group_id, token, created_by) VALUES (?, ?, ?)'
  ).run(groupId, token, userId);

  return { token };
}

function getActiveInviteLink(groupId) {
  return db.prepare(
    'SELECT token, created_at FROM group_invite_links WHERE group_id = ? AND is_active = 1'
  ).get(groupId);
}

function joinGroupViaInvite(token, userId) {
  const invite = db.prepare(
    'SELECT * FROM group_invite_links WHERE token = ? AND is_active = 1'
  ).get(token);

  if (!invite) throw new NotFoundError('Invalid or expired invite link');

  // Check if already a member
  const existing = db.prepare(
    'SELECT id FROM group_members WHERE group_id = ? AND user_id = ?'
  ).get(invite.group_id, userId);

  if (existing) throw new ConflictError('Already a member of this group');

  const user = db.prepare('SELECT name FROM users WHERE id = ?').get(userId);

  db.transaction(() => {
    db.prepare(
      'INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, ?)'
    ).run(invite.group_id, userId, 'member');

    activityService.logActivity(invite.group_id, userId, 'member_joined', 'member', userId, {
      member_name: user.name,
    });

    notificationService.notifyGroupMembers(
      'member_joined',
      invite.group_id,
      userId,
      'member',
      userId,
      `${user.name} joined the group`
    );
  })();

  return getGroupById(invite.group_id);
}

function getGroupByInviteToken(token) {
  const invite = db.prepare(
    'SELECT group_id FROM group_invite_links WHERE token = ? AND is_active = 1'
  ).get(token);

  if (!invite) throw new NotFoundError('Invalid or expired invite link');

  return getGroupById(invite.group_id);
}

module.exports = {
  createGroup,
  getUserGroups,
  getGroupById,
  updateGroup,
  deleteGroup,
  getGroupMembers,
  removeMember,
  generateInviteLink,
  getActiveInviteLink,
  joinGroupViaInvite,
  getGroupByInviteToken,
};
