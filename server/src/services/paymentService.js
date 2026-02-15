const db = require('../db/connection');
const { NotFoundError, ValidationError } = require('../utils/errors');
const activityService = require('./activityService');
const notificationService = require('./notificationService');

function recordPayment(groupId, payerId, payeeId, amount, note) {
  if (payerId === payeeId) {
    throw new ValidationError('Cannot pay yourself');
  }

  // Verify both are group members
  const payerMember = db.prepare(
    'SELECT user_id FROM group_members WHERE group_id = ? AND user_id = ?'
  ).get(groupId, payerId);
  const payeeMember = db.prepare(
    'SELECT user_id FROM group_members WHERE group_id = ? AND user_id = ?'
  ).get(groupId, payeeId);

  if (!payerMember || !payeeMember) {
    throw new ValidationError('Both payer and payee must be group members');
  }

  const payer = db.prepare('SELECT name FROM users WHERE id = ?').get(payerId);
  const payee = db.prepare('SELECT name FROM users WHERE id = ?').get(payeeId);

  const paymentId = db.transaction(() => {
    const result = db.prepare(
      'INSERT INTO payments (group_id, payer_id, payee_id, amount, note) VALUES (?, ?, ?, ?, ?)'
    ).run(groupId, payerId, payeeId, amount, note || null);

    const pid = result.lastInsertRowid;

    activityService.logActivity(groupId, payerId, 'payment_recorded', 'payment', pid, {
      payer_name: payer.name,
      payee_name: payee.name,
      amount,
    });

    const formattedAmount = (amount / 100).toFixed(2);
    notificationService.createNotification(
      'payment_recorded',
      groupId,
      payerId,
      'payment',
      pid,
      [payeeId],
      `${payer.name} paid you $${formattedAmount}`
    );

    // Also notify other group members
    const members = db.prepare(
      'SELECT user_id FROM group_members WHERE group_id = ? AND user_id NOT IN (?, ?)'
    ).all(groupId, payerId, payeeId);

    if (members.length > 0) {
      const memberIds = members.map(m => m.user_id);
      notificationService.createNotification(
        'payment_recorded',
        groupId,
        payerId,
        'payment',
        pid,
        memberIds,
        `${payer.name} paid ${payee.name} $${formattedAmount}`
      );
    }

    return pid;
  })();

  return getPaymentById(paymentId);
}

function getGroupPayments(groupId) {
  return db.prepare(`
    SELECT p.*,
      payer.name as payer_name,
      payee.name as payee_name
    FROM payments p
    JOIN users payer ON payer.id = p.payer_id
    JOIN users payee ON payee.id = p.payee_id
    WHERE p.group_id = ?
    ORDER BY p.created_at DESC
  `).all(groupId);
}

function getPaymentById(paymentId) {
  const payment = db.prepare(`
    SELECT p.*,
      payer.name as payer_name,
      payee.name as payee_name
    FROM payments p
    JOIN users payer ON payer.id = p.payer_id
    JOIN users payee ON payee.id = p.payee_id
    WHERE p.id = ?
  `).get(paymentId);

  if (!payment) throw new NotFoundError('Payment not found');
  return payment;
}

module.exports = {
  recordPayment,
  getGroupPayments,
  getPaymentById,
};
