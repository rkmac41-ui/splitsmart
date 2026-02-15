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

// Get group members
router.get('/:groupId/members', groupAccess, (req, res, next) => {
  try {
    const members = groupService.getGroupMembers(req.params.groupId);
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

module.exports = router;
