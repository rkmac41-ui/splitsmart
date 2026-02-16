const express = require('express');
const router = express.Router();
const groupService = require('../services/groupService');
const authMiddleware = require('../middleware/auth');
const { groupAccess } = require('../middleware/groupAccess');
const validate = require('../middleware/validate');
const { createGroupSchema, updateGroupSchema } = require('../validators/groupValidator');

// All routes require authentication
router.use(authMiddleware);

// List user's groups
router.get('/', (req, res, next) => {
  try {
    const groups = groupService.getUserGroups(req.user.id);
    res.json({ groups });
  } catch (err) {
    next(err);
  }
});

// Create group
router.post('/', validate(createGroupSchema), (req, res, next) => {
  try {
    const group = groupService.createGroup(req.body.name, req.user.id);
    res.status(201).json({ group });
  } catch (err) {
    next(err);
  }
});

// Get group by invite token (public info)
router.get('/invite/:token/info', (req, res, next) => {
  try {
    const group = groupService.getGroupByInviteToken(req.params.token);
    res.json({ group: { id: group.id, name: group.name, member_count: group.member_count } });
  } catch (err) {
    next(err);
  }
});

// Join group via invite
router.post('/invite/:token', (req, res, next) => {
  try {
    const group = groupService.joinGroupViaInvite(req.params.token, req.user.id);
    res.json({ group });
  } catch (err) {
    next(err);
  }
});

// Get group details
router.get('/:groupId', groupAccess, (req, res, next) => {
  try {
    const group = groupService.getGroupById(req.params.groupId);
    res.json({ group });
  } catch (err) {
    next(err);
  }
});

// Update group
router.put('/:groupId', groupAccess, validate(updateGroupSchema), (req, res, next) => {
  try {
    const group = groupService.updateGroup(req.params.groupId, req.body);
    res.json({ group });
  } catch (err) {
    next(err);
  }
});

// Delete group
router.delete('/:groupId', groupAccess, (req, res, next) => {
  try {
    groupService.deleteGroup(req.params.groupId, req.user.id);
    res.json({ message: 'Group deleted' });
  } catch (err) {
    next(err);
  }
});

// Get group members (includes unclaimed placeholders)
router.get('/:groupId/members', groupAccess, (req, res, next) => {
  try {
    const members = groupService.getAllGroupMembers(req.params.groupId);
    res.json({ members });
  } catch (err) {
    next(err);
  }
});

// Remove member
router.delete('/:groupId/members/:userId', groupAccess, (req, res, next) => {
  try {
    groupService.removeMember(req.params.groupId, Number(req.params.userId), req.user.id);
    res.json({ message: 'Member removed' });
  } catch (err) {
    next(err);
  }
});

// Generate invite link
router.post('/:groupId/invite-link', groupAccess, (req, res, next) => {
  try {
    const link = groupService.generateInviteLink(req.params.groupId, req.user.id);
    res.json({ invite: link });
  } catch (err) {
    next(err);
  }
});

// Get active invite link
router.get('/:groupId/invite-link', groupAccess, (req, res, next) => {
  try {
    const link = groupService.getActiveInviteLink(req.params.groupId);
    res.json({ invite: link });
  } catch (err) {
    next(err);
  }
});

// ─── Placeholder Members ─────────────────────────────────────

// Add placeholder member by name
router.post('/:groupId/placeholders', groupAccess, (req, res, next) => {
  try {
    const { name } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Name is required' });
    }
    const placeholder = groupService.addPlaceholderMember(req.params.groupId, name, req.user.id);
    res.status(201).json({ placeholder });
  } catch (err) {
    next(err);
  }
});

// Get placeholder members for a group
router.get('/:groupId/placeholders', groupAccess, (req, res, next) => {
  try {
    const placeholders = groupService.getPlaceholderMembers(req.params.groupId);
    res.json({ placeholders });
  } catch (err) {
    next(err);
  }
});

// Remove a placeholder member
router.delete('/:groupId/placeholders/:placeholderId', groupAccess, (req, res, next) => {
  try {
    groupService.removePlaceholderMember(req.params.groupId, Number(req.params.placeholderId));
    res.json({ message: 'Placeholder removed' });
  } catch (err) {
    next(err);
  }
});

// Claim a placeholder (called by joining user)
router.post('/:groupId/placeholders/:placeholderId/claim', groupAccess, (req, res, next) => {
  try {
    const result = groupService.claimPlaceholder(
      req.params.groupId,
      Number(req.params.placeholderId),
      req.user.id
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// Get unclaimed placeholders (for the claim flow)
router.get('/:groupId/placeholders/unclaimed', groupAccess, (req, res, next) => {
  try {
    const placeholders = groupService.getUnclaimedPlaceholders(req.params.groupId);
    res.json({ placeholders });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
