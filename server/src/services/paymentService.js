const db = require('../db/connection');
const { NotFoundError, ValidationError } = require('../utils/errors');
const activityService = require('./activityService');
const notificationService = require('./notificationService');
const { loadMembers } = require('./balanceService');

// Payer/payee may be placeholder members (negative IDs), so resolve names either way
const PAYMENT_SELECT = `
  SELECT p.*,
    CASE WHEN p.payer_id > 0 THEN payer.name
         ELSE (SELECT pm.name FROM placeholder_members pm WHERE pm.id = -p.payer_id)
    END as payer_name,
    CASE WHEN p.payee_id > 0 THEN payee.name
         ELSE (SELECT pm.name FROM placeholder_members pm WHERE pm.id = -p.payee_id)
    END as payee_name,
    recorder.name as recorded_by_name
  FROM payments p
  LEFT JOIN users payer ON payer.id = p.payer_id
  LEFT JOIN users payee ON payee.id = p.payee_id
  LEFT JOIN users recorder ON recorder.id = p.recorded_by
`;

function formatCents(cents) {
  return `$${(cents / 100).toFixed(2)}`;
}

/** Check payer/payee are different people who are both in the group; returns id -> name. */
function validateParties(groupId, payerId, payeeId) {
  if (payerId === payeeId) {
    throw new ValidationError('Payer and payee must be different people');
  }

  const participants = new Map(loadMembers(groupId).map(m => [m.id, m.name]));
  if (!participants.has(payerId) || !participants.has(payeeId)) {
    throw new ValidationError('Both payer and payee must be group members');
  }
  return participants;
}

/** Notify the (real) payer and payee about a change to their payment. */
function notifyParties(type, payment, actorId, message) {
  const recipients = [payment.payer_id, payment.payee_id].filter(id => id > 0);
  notificationService.createNotification(
    type, payment.group_id, actorId, 'payment', payment.id, recipients, message
  );
}

/**
 * Record that payerId paid payeeId. Any group member can record a payment
 * between any two participants (e.g. "Bob paid me in cash", or settling up
 * with a placeholder member who hasn't joined yet).
 */
function recordPayment(groupId, recorderId, payerId, payeeId, amount, note) {
  const participants = validateParties(groupId, payerId, payeeId);

  const payerName = participants.get(payerId);
  const payeeName = participants.get(payeeId);
  const recorder = db.prepare('SELECT name FROM users WHERE id = ?').get(recorderId);

  const paymentId = db.transaction(() => {
    const result = db.prepare(
      'INSERT INTO payments (group_id, payer_id, payee_id, amount, note, recorded_by) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(groupId, payerId, payeeId, amount, note || null, recorderId);

    const pid = result.lastInsertRowid;

    activityService.logActivity(groupId, recorderId, 'payment_recorded', 'payment', pid, {
      payer_name: payerName,
      payee_name: payeeName,
      amount,
    });

    const formattedAmount = (amount / 100).toFixed(2);
    const recordedBy = recorderId !== payerId ? ` (recorded by ${recorder.name})` : '';

    // The payee hears "X paid you", the payer "you paid Y" (when someone else
    // recorded it), everyone else "X paid Y". Placeholders can't be notified.
    if (payeeId > 0) {
      notificationService.createNotification(
        'payment_recorded', groupId, recorderId, 'payment', pid, [payeeId],
        `${payerName} paid you $${formattedAmount}${recordedBy}`
      );
    }
    if (payerId > 0) {
      notificationService.createNotification(
        'payment_recorded', groupId, recorderId, 'payment', pid, [payerId],
        `You paid ${payeeName} $${formattedAmount}${recordedBy}`
      );
    }

    const others = db.prepare(
      'SELECT user_id FROM group_members WHERE group_id = ? AND user_id NOT IN (?, ?)'
    ).all(groupId, payerId, payeeId);

    if (others.length > 0) {
      notificationService.createNotification(
        'payment_recorded', groupId, recorderId, 'payment', pid,
        others.map(m => m.user_id),
        `${payerName} paid ${payeeName} $${formattedAmount}`
      );
    }

    return pid;
  })();

  return getPaymentById(paymentId);
}

function getGroupPayments(groupId) {
  return db.prepare(`${PAYMENT_SELECT}
    WHERE p.group_id = ? AND p.is_deleted = 0
    ORDER BY p.created_at DESC, p.id DESC
  `).all(groupId);
}

function getPaymentById(paymentId, groupId, { includeDeleted = false } = {}) {
  const payment = db.prepare(`${PAYMENT_SELECT} WHERE p.id = ?`).get(paymentId);

  // Scope to the caller's group, like expenses
  if (
    !payment ||
    (groupId !== undefined && payment.group_id !== Number(groupId)) ||
    (payment.is_deleted && !includeDeleted)
  ) {
    throw new NotFoundError('Payment not found');
  }
  return payment;
}

/**
 * Fix a payment's people, amount or note. It keeps its original place in the
 * timeline (created_at), so settlement periods are recomputed correctly.
 */
function updatePayment(paymentId, groupId, userId, { payer_id, payee_id, amount, note }) {
  const old = getPaymentById(paymentId, groupId);
  const payerId = payer_id ?? old.payer_id;
  const payeeId = payee_id ?? old.payee_id;
  const participants = validateParties(old.group_id, payerId, payeeId);
  const user = db.prepare('SELECT name FROM users WHERE id = ?').get(userId);

  db.transaction(() => {
    db.prepare(`
      UPDATE payments SET payer_id = ?, payee_id = ?, amount = ?, note = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(payerId, payeeId, amount, note || null, paymentId);

    activityService.logActivity(old.group_id, userId, 'payment_edited', 'payment', old.id, {
      old: { payer_name: old.payer_name, payee_name: old.payee_name, amount: old.amount },
      new: { payer_name: participants.get(payerId), payee_name: participants.get(payeeId), amount },
    });

    // Tell everyone involved before and after the edit
    const recipients = [...new Set([old.payer_id, old.payee_id, payerId, payeeId])].filter(id => id > 0);
    notificationService.createNotification(
      'payment_edited', old.group_id, userId, 'payment', old.id, recipients,
      `${user.name} edited a payment: ${participants.get(payerId)} paid ${participants.get(payeeId)} ${formatCents(amount)}`
    );
  })();

  return getPaymentById(paymentId, groupId);
}

function deletePayment(paymentId, groupId, userId) {
  const payment = getPaymentById(paymentId, groupId);
  const user = db.prepare('SELECT name FROM users WHERE id = ?').get(userId);

  db.transaction(() => {
    db.prepare("UPDATE payments SET is_deleted = 1, updated_at = datetime('now') WHERE id = ?").run(paymentId);

    activityService.logActivity(payment.group_id, userId, 'payment_deleted', 'payment', payment.id, {
      payer_name: payment.payer_name,
      payee_name: payment.payee_name,
      amount: payment.amount,
    });

    notifyParties('payment_deleted', payment, userId,
      `${user.name} deleted the payment: ${payment.payer_name} paid ${payment.payee_name} ${formatCents(payment.amount)}`);
  })();

  return payment;
}

function restorePayment(paymentId, groupId, userId) {
  const payment = getPaymentById(paymentId, groupId, { includeDeleted: true });
  if (!payment.is_deleted) throw new ValidationError('Payment is not deleted');

  // Both people must still be in the group
  try {
    validateParties(payment.group_id, payment.payer_id, payment.payee_id);
  } catch {
    throw new ValidationError("Can't restore: someone on this payment is no longer in the group");
  }

  const user = db.prepare('SELECT name FROM users WHERE id = ?').get(userId);

  db.transaction(() => {
    db.prepare("UPDATE payments SET is_deleted = 0, updated_at = datetime('now') WHERE id = ?").run(paymentId);

    activityService.logActivity(payment.group_id, userId, 'payment_restored', 'payment', payment.id, {
      payer_name: payment.payer_name,
      payee_name: payment.payee_name,
      amount: payment.amount,
    });

    notifyParties('payment_restored', payment, userId,
      `${user.name} restored the payment: ${payment.payer_name} paid ${payment.payee_name} ${formatCents(payment.amount)}`);
  })();

  return getPaymentById(paymentId, groupId);
}

module.exports = {
  recordPayment,
  getGroupPayments,
  getPaymentById,
  updatePayment,
  deletePayment,
  restorePayment,
};
