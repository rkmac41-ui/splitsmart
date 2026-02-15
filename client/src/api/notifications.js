import client from './client';

export const getNotifications = (limit = 50, offset = 0) =>
  client.get(`/notifications?limit=${limit}&offset=${offset}`).then(r => r.data);

export const getUnreadCount = () =>
  client.get('/notifications/count').then(r => r.data);

export const markAsRead = (id) =>
  client.put(`/notifications/${id}/read`).then(r => r.data);

export const markAllAsRead = () =>
  client.put('/notifications/read-all').then(r => r.data);
