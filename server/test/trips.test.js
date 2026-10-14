const test = require('node:test');
const assert = require('node:assert');
const { db, expenses, createGroup, addExpense } = require('./helpers');
const trips = require('../src/services/tripService');

const tripExists = (id) => Boolean(db.prepare('SELECT 1 FROM trips WHERE id = ?').get(id));

test('an empty trip can be deleted', () => {
  const { groupId, ids: { A } } = createGroup(['A']);
  const trip = trips.createTrip(groupId, 'Beach', null, A);
  trips.deleteTrip(trip.id, A, groupId);
  assert.strictEqual(tripExists(trip.id), false);
});

test('a trip with expenses cannot be deleted', () => {
  const { groupId, ids: { A, B } } = createGroup(['A', 'B']);
  const trip = trips.createTrip(groupId, 'Beach', null, A);
  addExpense(groupId, A, { [A]: 1000 }, [A, B], { trip_id: trip.id });
  assert.throws(() => trips.deleteTrip(trip.id, A, groupId), /still has 1 expense\./);
  assert.strictEqual(tripExists(trip.id), true);
});

test('a trip whose only expenses were deleted counts as empty', () => {
  const { groupId, ids: { A, B } } = createGroup(['A', 'B']);
  const trip = trips.createTrip(groupId, 'Beach', null, A);
  const e = addExpense(groupId, A, { [A]: 1000 }, [A, B], { trip_id: trip.id });
  expenses.deleteExpense(e.id, A, groupId);
  trips.deleteTrip(trip.id, A, groupId);
  assert.strictEqual(tripExists(trip.id), false);
});

test("another group's trip cannot be read, edited or deleted", () => {
  const g1 = createGroup(['A']);
  const g2 = createGroup(['X']);
  const trip = trips.createTrip(g1.groupId, 'Beach', null, g1.ids.A);
  assert.throws(() => trips.getTripById(trip.id, g2.groupId), /not found/);
  assert.throws(() => trips.updateTrip(trip.id, { name: 'Mine now' }, g2.groupId), /not found/);
  assert.throws(() => trips.deleteTrip(trip.id, g2.ids.X, g2.groupId), /not found/);
  assert.strictEqual(trips.getTripById(trip.id, g1.groupId).name, 'Beach');
});
