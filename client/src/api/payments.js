import client from './client';

export const getPayments = (groupId) =>
  client.get(`/groups/${groupId}/payments`).then(r => r.data);

export const recordPayment = (groupId, data) =>
  client.post(`/groups/${groupId}/payments`, data).then(r => r.data);
