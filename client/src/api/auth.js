import client from './client';

export const signup = (email, password, name) =>
  client.post('/auth/signup', { email, password, name }).then(r => r.data);

export const login = (email, password) =>
  client.post('/auth/login', { email, password }).then(r => r.data);

export const getMe = () =>
  client.get('/auth/me').then(r => r.data);
