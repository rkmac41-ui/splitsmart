import client from './client';

export const getExpenses = (groupId, tripId = null) => {
  const params = tripId ? `?tripId=${tripId}` : '';
  return client.get(`/groups/${groupId}/expenses${params}`).then(r => r.data);
};

export const createExpense = (groupId, data) =>
  client.post(`/groups/${groupId}/expenses`, data).then(r => r.data);

export const getExpense = (groupId, expenseId, { includeDeleted = false } = {}) =>
  client.get(`/groups/${groupId}/expenses/${expenseId}${includeDeleted ? '?include_deleted=1' : ''}`).then(r => r.data);

export const restoreExpense = (groupId, expenseId) =>
  client.post(`/groups/${groupId}/expenses/${expenseId}/restore`).then(r => r.data);

export const updateExpense = (groupId, expenseId, data) =>
  client.put(`/groups/${groupId}/expenses/${expenseId}`, data).then(r => r.data);

export const deleteExpense = (groupId, expenseId) =>
  client.delete(`/groups/${groupId}/expenses/${expenseId}`).then(r => r.data);
