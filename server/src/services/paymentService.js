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
    END as payee_name
  FROM payments p
  LEFT JOIN users payer ON payer.id = p.payer_id
  LEFT JOIN users payee ON payee.id = p.payee_id
`;

/**
 * Record that payerId paid payeeId. Any group member can record a payment
 * between any two participants (e.g. "Bob paid me in cash", or settling up
 * with a placeholder member who hasn't joined yet).
 */
function recordPayment(groupId, recorderId, payerId, payeeId, amount, note) {
  if (payerId === payeeId) {
    throw new ValidationError('Payer and payee must be different people');
  }

  const participants = new Map(loadMembers(groupId).map(m => [m.id, m.name]));
  if (!participants.has(payerId) || !participants.has(payeeId)) {
    throw new ValidationError('Both payer and payee must be group members');
  }

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
    WHERE p.group_id = ?
    ORDER BY p.created_at DESC
  `).all(groupId);
}

function getPaymentById(paymentId) {
  const payment = db.prepare(`${PAYMENT_SELECT} WHERE p.id = ?`).get(paymentId);

  if (!payment) throw new NotFoundError('Payment not found');
  return payment;
}

module.exports = {
  recordPayment,
  getGroupPayments,
  getPaymentById,
};
