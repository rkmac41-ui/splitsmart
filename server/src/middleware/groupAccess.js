const db = require('../db/connection');
const { ForbiddenError, NotFoundError } = require('../utils/errors');

/**
 * Middleware to verify the authenticated user is a member of the specified group.
 * Expects req.params.groupId and req.user.id to be set.
 */
function groupAccess(req, res, next) {
  const groupId = req.params.groupId;
  const userId = req.user.id;

  // Check group exists
  const group = db.prepare('SELECT id FROM groups WHERE id = ?').get(groupId);
  if (!group) {
    throw new NotFoundError('Group not found');
  }

  // Check membership
  const member = db
    .prepare('SELECT id, role FROM group_members WHERE group_id = ? AND user_id = ?')
    .get(groupId, userId);

  if (!member) {
    throw new ForbiddenError('You are not a member of this group');
  }

  req.groupMember = member;
  next();
}

/**
 * Middleware to verify the user is an admin of the group.
 */
function adminAccess(req, res, next) {
  groupAccess(req, res, () => {
    if (req.groupMember.role !== 'admin') {
      throw new ForbiddenError('Admin access required');
    }
    next();
  });
}

module.exports = { groupAccess, adminAccess };
