import client from './client';

export const getPayments = (groupId) =>
  client.get(`/groups/${groupId}/payments`).then(r => r.data);

export const recordPayment = (groupId, data) =>
  client.post(`/groups/${groupId}/payments`, data).then(r => r.data);

export const getPayment = (groupId, paymentId, { includeDeleted = false } = {}) =>
  client.get(`/groups/${groupId}/payments/${paymentId}${includeDeleted ? '?include_deleted=1' : ''}`).then(r => r.data);

export const updatePayment = (groupId, paymentId, data) =>
  client.put(`/groups/${groupId}/payments/${paymentId}`, data).then(r => r.data);

export const deletePayment = (groupId, paymentId) =>
  client.delete(`/groups/${groupId}/payments/${paymentId}`).then(r => r.data);

export const restorePayment = (groupId, paymentId) =>
  client.post(`/groups/${groupId}/payments/${paymentId}/restore`).then(r => r.data);
