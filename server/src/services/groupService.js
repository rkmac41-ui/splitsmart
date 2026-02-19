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
      (SELECT COUNT(*) FROM group_members WHERE group_id = g.id) as member_count,
      (SELECT COUNT(*) FROM trips WHERE group_id = g.id) as trip_count
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

  // Check for unclaimed placeholders in this group
  const unclaimed = db.prepare(
    'SELECT * FROM placeholder_members WHERE group_id = ? AND claimed_by IS NULL ORDER BY name ASC'
  ).all(invite.group_id);

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

  const group = getGroupById(invite.group_id);

  // Return unclaimed placeholders so frontend can prompt claiming
  return { ...group, unclaimed_placeholders: unclaimed };
}

function getGroupByInviteToken(token) {
  const invite = db.prepare(
    'SELECT group_id FROM group_invite_links WHERE token = ? AND is_active = 1'
  ).get(token);

  if (!invite) throw new NotFoundError('Invalid or expired invite link');

  return getGroupById(invite.group_id);
}

// ─── Placeholder Members ─────────────────────────────────────

function addPlaceholderMember(groupId, name, createdBy) {
  const trimmedName = name.trim();
  if (!trimmedName) throw new ConflictError('Name cannot be empty');

  // Check if a real member already has this name
  const existingReal = db.prepare(`
    SELECT u.name FROM group_members gm
    JOIN users u ON u.id = gm.user_id
    WHERE gm.group_id = ? AND LOWER(u.name) = LOWER(?)
  `).get(groupId, trimmedName);

  if (existingReal) throw new ConflictError(`A member named "${trimmedName}" already exists`);

  try {
    db.prepare(
      'INSERT INTO placeholder_members (group_id, name, created_by) VALUES (?, ?, ?)'
    ).run(groupId, trimmedName, createdBy);
  } catch (err) {
    if (err.message.includes('UNIQUE constraint')) {
      throw new ConflictError(`A placeholder named "${trimmedName}" already exists in this group`);
    }
    throw err;
  }

  const placeholder = db.prepare(
    'SELECT * FROM placeholder_members WHERE group_id = ? AND name = ?'
  ).get(groupId, trimmedName);

  activityService.logActivity(groupId, createdBy, 'placeholder_added', 'placeholder', placeholder.id, {
    name: trimmedName,
  });

  return placeholder;
}

function getPlaceholderMembers(groupId) {
  return db.prepare(
    'SELECT * FROM placeholder_members WHERE group_id = ? ORDER BY created_at ASC'
  ).all(groupId);
}

function getUnclaimedPlaceholders(groupId) {
  return db.prepare(
    'SELECT * FROM placeholder_members WHERE group_id = ? AND claimed_by IS NULL ORDER BY name ASC'
  ).all(groupId);
}

function removePlaceholderMember(groupId, placeholderId) {
  const ph = db.prepare(
    'SELECT * FROM placeholder_members WHERE id = ? AND group_id = ?'
  ).get(placeholderId, groupId);

  if (!ph) throw new NotFoundError('Placeholder member not found');
  if (ph.claimed_by) throw new ConflictError('Cannot remove a claimed placeholder');

  // Check if they have expenses
  const negId = -placeholderId;
  const hasExpenses = db.prepare(`
    SELECT 1 FROM expense_payers WHERE user_id = ? AND expense_id IN
      (SELECT id FROM expenses WHERE group_id = ? AND is_deleted = 0)
    UNION
    SELECT 1 FROM expense_splits WHERE user_id = ? AND expense_id IN
      (SELECT id FROM expenses WHERE group_id = ? AND is_deleted = 0)
  `).get(negId, groupId, negId, groupId);

  if (hasExpenses) {
    throw new ConflictError('Cannot remove placeholder with assigned expenses');
  }

  db.prepare('DELETE FROM placeholder_members WHERE id = ?').run(placeholderId);
  return ph;
}

/**
 * Claim a placeholder member: transfers all their expense records to the real user.
 * Placeholder user_ids are stored as negative: -placeholder.id
 */
function claimPlaceholder(groupId, placeholderId, userId) {
  const ph = db.prepare(
    'SELECT * FROM placeholder_members WHERE id = ? AND group_id = ? AND claimed_by IS NULL'
  ).get(placeholderId, groupId);

  if (!ph) throw new NotFoundError('Placeholder not found or already claimed');

  const user = db.prepare('SELECT name FROM users WHERE id = ?').get(userId);
  const negId = -placeholderId;

  db.transaction(() => {
    // Mark placeholder as claimed
    db.prepare(
      "UPDATE placeholder_members SET claimed_by = ?, claimed_at = datetime('now') WHERE id = ?"
    ).run(userId, placeholderId);

    // Transfer expense_payers records from placeholder (-id) to real user
    db.prepare('UPDATE expense_payers SET user_id = ? WHERE user_id = ?').run(userId, negId);

    // Transfer expense_splits records from placeholder (-id) to real user
    db.prepare('UPDATE expense_splits SET user_id = ? WHERE user_id = ?').run(userId, negId);

    // Transfer any payment records
    db.prepare('UPDATE payments SET payer_id = ? WHERE payer_id = ?').run(userId, negId);
    db.prepare('UPDATE payments SET payee_id = ? WHERE payee_id = ?').run(userId, negId);

    // Log activity
    activityService.logActivity(groupId, userId, 'placeholder_claimed', 'placeholder', placeholderId, {
      placeholder_name: ph.name,
      user_name: user.name,
    });
  })();

  return { placeholder: ph, user_id: userId };
}

/**
 * Returns combined list of real members + unclaimed placeholder members for a group.
 * Placeholder members get negative IDs to distinguish them.
 */
function getAllGroupMembers(groupId) {
  const realMembers = db.prepare(`
    SELECT u.id, u.name, u.email, gm.role, gm.joined_at, 0 as is_placeholder
    FROM group_members gm
    JOIN users u ON u.id = gm.user_id
    WHERE gm.group_id = ?
  `).all(groupId);

  const placeholders = db.prepare(`
    SELECT id, name, created_at as joined_at
    FROM placeholder_members
    WHERE group_id = ? AND claimed_by IS NULL
  `).all(groupId);

  const placeholderMembers = placeholders.map(p => ({
    id: -p.id,
    name: p.name,
    email: null,
    role: 'placeholder',
    joined_at: p.joined_at,
    is_placeholder: 1,
    placeholder_id: p.id,
  }));

  return [...realMembers, ...placeholderMembers];
}

module.exports = {
  createGroup,
  getUserGroups,
  getGroupById,
  updateGroup,
  deleteGroup,
  getGroupMembers,
  getAllGroupMembers,
  removeMember,
  generateInviteLink,
  getActiveInviteLink,
  joinGroupViaInvite,
  getGroupByInviteToken,
  addPlaceholderMember,
  getPlaceholderMembers,
  getUnclaimedPlaceholders,
  removePlaceholderMember,
  claimPlaceholder,
};
