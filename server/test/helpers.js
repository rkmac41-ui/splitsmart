// Shared setup for tests that need a database. Each test file runs in its own
// process (node --test), so each gets a fresh throwaway SQLite file.
const os = require('os');
const path = require('path');
const fs = require('fs');

const dbPath = path.join(os.tmpdir(), `splitsmart-test-${process.pid}-${Date.now()}.db`);
process.env.DB_PATH = dbPath;
process.on('exit', () => {
  for (const suffix of ['', '-wal', '-shm']) fs.rmSync(dbPath + suffix, { force: true });
});

const log = console.log;
console.log = () => {}; // silence migration output
require('../src/db/migrate').runMigrations();
console.log = log;

const db = require('../src/db/connection');
const expenses = require('../src/services/expenseService');
const payments = require('../src/services/paymentService');
const balances = require('../src/services/balanceService');
const groups = require('../src/services/groupService');

let userCounter = 0;
let clock = 0;

function createUser(name) {
  const email = `${name.toLowerCase()}-${++userCounter}@test.local`;
  const id = db.prepare('INSERT INTO users (email, password_hash, name) VALUES (?, ?, ?)')
    .run(email, 'x', name).lastInsertRowid;
  return Number(id);
}

/** Create a group whose first member is the admin. Returns { groupId, ids: {name: id} }. */
function createGroup(memberNames) {
  const ids = {};
  for (const name of memberNames) ids[name] = createUser(name);
  const adminId = ids[memberNames[0]];
  const groupId = Number(db.prepare('INSERT INTO groups (name, created_by) VALUES (?, ?)')
    .run('Test group', adminId).lastInsertRowid);
  for (const name of memberNames) {
    db.prepare('INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, ?)')
      .run(groupId, ids[name], ids[name] === adminId ? 'admin' : 'member');
  }
  return { groupId, ids };
}

// Rows created in the same second would tie, so give each a distinct timestamp
function tick(table, id) {
  db.prepare(`UPDATE ${table} SET created_at = datetime('2026-01-01', '+${++clock} minutes') WHERE id = ?`).run(id);
}

/** Add an expense paid by `payers` ({id: cents}) split equally between `splitIds`. */
function addExpense(groupId, actorId, payers, splitIds, extra = {}) {
  const amount = Object.values(payers).reduce((a, b) => a + b, 0);
  const e = expenses.createExpense(groupId, {
    description: 'Expense', amount, category: 'other', split_type: 'equal',
    date: '2026-01-01', trip_id: null,
    payers: Object.entries(payers).map(([user_id, a]) => ({ user_id: Number(user_id), amount: a })),
    splits: splitIds.map(user_id => ({ user_id })),
    ...extra,
  }, actorId);
  tick('expenses', e.id);
  return e;
}

function pay(groupId, recorderId, payerId, payeeId, amount) {
  const p = payments.recordPayment(groupId, recorderId, payerId, payeeId, amount);
  tick('payments', p.id);
  return p;
}

/** Net balance per user id: positive = is owed, negative = owes. */
function netBalances(groupId) {
  return Object.fromEntries(
    balances.computeGroupBalances(groupId).memberBalances.map(m => [m.user_id, m.balance])
  );
}

module.exports = { db, expenses, payments, balances, groups, createUser, createGroup, addExpense, pay, netBalances };
