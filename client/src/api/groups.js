import client from './client';

export const getGroups = () =>
  client.get('/groups').then(r => r.data);

export const createGroup = (name) =>
  client.post('/groups', { name }).then(r => r.data);

export const getGroup = (groupId) =>
  client.get(`/groups/${groupId}`).then(r => r.data);

export const updateGroup = (groupId, data) =>
  client.put(`/groups/${groupId}`, data).then(r => r.data);

export const deleteGroup = (groupId) =>
  client.delete(`/groups/${groupId}`).then(r => r.data);

export const getGroupMembers = (groupId) =>
  client.get(`/groups/${groupId}/members`).then(r => r.data);

export const removeMember = (groupId, userId) =>
  client.delete(`/groups/${groupId}/members/${userId}`).then(r => r.data);

export const generateInviteLink = (groupId) =>
  client.post(`/groups/${groupId}/invite-link`).then(r => r.data);

export const getInviteLink = (groupId) =>
  client.get(`/groups/${groupId}/invite-link`).then(r => r.data);

export const getGroupByInviteToken = (token) =>
  client.get(`/groups/invite/${token}/info`).then(r => r.data);

export const joinGroupViaInvite = (token) =>
  client.post(`/groups/invite/${token}`).then(r => r.data);

// Placeholder members
export const addPlaceholderMember = (groupId, name) =>
  client.post(`/groups/${groupId}/placeholders`, { name }).then(r => r.data);

export const getPlaceholderMembers = (groupId) =>
  client.get(`/groups/${groupId}/placeholders`).then(r => r.data);

export const removePlaceholderMember = (groupId, placeholderId) =>
  client.delete(`/groups/${groupId}/placeholders/${placeholderId}`).then(r => r.data);

export const claimPlaceholder = (groupId, placeholderId) =>
  client.post(`/groups/${groupId}/placeholders/${placeholderId}/claim`).then(r => r.data);

export const getUnclaimedPlaceholders = (groupId) =>
  client.get(`/groups/${groupId}/placeholders/unclaimed`).then(r => r.data);
