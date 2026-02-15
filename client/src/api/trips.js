import client from './client';

export const getTrips = (groupId) =>
  client.get(`/groups/${groupId}/trips`).then(r => r.data);

export const createTrip = (groupId, data) =>
  client.post(`/groups/${groupId}/trips`, data).then(r => r.data);

export const getTrip = (groupId, tripId) =>
  client.get(`/groups/${groupId}/trips/${tripId}`).then(r => r.data);

export const updateTrip = (groupId, tripId, data) =>
  client.put(`/groups/${groupId}/trips/${tripId}`, data).then(r => r.data);

export const deleteTrip = (groupId, tripId) =>
  client.delete(`/groups/${groupId}/trips/${tripId}`).then(r => r.data);
