const db = require('../db/connection');
const { NotFoundError, ConflictError } = require('../utils/errors');
const activityService = require('./activityService');
const notificationService = require('./notificationService');

function createTrip(groupId, name, description, userId) {
  const result = db.prepare(
    'INSERT INTO trips (group_id, name, description, created_by) VALUES (?, ?, ?, ?)'
  ).run(groupId, name, description || null, userId);

  const tripId = result.lastInsertRowid;

  const user = db.prepare('SELECT name as user_name FROM users WHERE id = ?').get(userId);

  activityService.logActivity(groupId, userId, 'trip_created', 'trip', tripId, { name });

  notificationService.notifyGroupMembers(
    'trip_created',
    groupId,
    userId,
    'trip',
    tripId,
    `${user.user_name} created trip "${name}"`
  );

  return getTripById(tripId);
}

function getGroupTrips(groupId) {
  return db.prepare(`
    SELECT t.*,
      (SELECT COUNT(*) FROM expenses WHERE trip_id = t.id AND is_deleted = 0) as expense_count,
      (SELECT COALESCE(SUM(amount), 0) FROM expenses WHERE trip_id = t.id AND is_deleted = 0) as total_amount
    FROM trips t
    WHERE t.group_id = ?
    ORDER BY t.created_at DESC
  `).all(groupId);
}

function getTripById(tripId, groupId) {
  const trip = db.prepare(`
    SELECT t.*,
      (SELECT COUNT(*) FROM expenses WHERE trip_id = t.id AND is_deleted = 0) as expense_count,
      (SELECT COALESCE(SUM(amount), 0) FROM expenses WHERE trip_id = t.id AND is_deleted = 0) as total_amount
    FROM trips t
    WHERE t.id = ?
  `).get(tripId);

  // Scope to the caller's group so trips can't be read or changed by guessing IDs
  if (!trip || (groupId !== undefined && trip.group_id !== Number(groupId))) {
    throw new NotFoundError('Trip not found');
  }
  return trip;
}

function updateTrip(tripId, updates, groupId) {
  getTripById(tripId, groupId);
  const fields = [];
  const values = [];

  if (updates.name !== undefined) {
    fields.push('name = ?');
    values.push(updates.name);
  }
  if (updates.description !== undefined) {
    fields.push('description = ?');
    values.push(updates.description);
  }

  if (fields.length === 0) return getTripById(tripId);

  fields.push("updated_at = datetime('now')");
  values.push(tripId);

  db.prepare(`UPDATE trips SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  return getTripById(tripId);
}

/**
 * Only an empty trip can be deleted. Deleting a trip with expenses would
 * silently move them out of the trip, so those must be moved or deleted first.
 */
function deleteTrip(tripId, userId, groupId) {
  const trip = getTripById(tripId, groupId);
  if (trip.expense_count > 0) {
    throw new ConflictError(
      `This trip still has ${trip.expense_count} expense${trip.expense_count === 1 ? '' : 's'}. ` +
      'Move or delete them before deleting the trip.'
    );
  }

  db.transaction(() => {
    db.prepare('DELETE FROM trips WHERE id = ?').run(tripId);

    activityService.logActivity(trip.group_id, userId, 'trip_deleted', 'trip', tripId, {
      name: trip.name,
    });
  })();

  return trip;
}

module.exports = {
  createTrip,
  getGroupTrips,
  getTripById,
  updateTrip,
  deleteTrip,
};
