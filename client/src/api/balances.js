import client from './client';

export const getGroupBalances = (groupId) =>
  client.get(`/groups/${groupId}/balances`).then(r => r.data);

export const getDashboard = () =>
  client.get('/dashboard').then(r => r.data);

export const getActivity = (limit = 50, offset = 0) =>
  client.get(`/activity?limit=${limit}&offset=${offset}`).then(r => r.data);

export const getGroupActivity = (groupId, limit = 50, offset = 0) =>
  client.get(`/groups/${groupId}/activity?limit=${limit}&offset=${offset}`).then(r => r.data);
