const test = require('node:test');
const assert = require('node:assert');
const { expenses, payments, balances, groups, createGroup, addExpense, pay, netBalances } = require('./helpers');

test('equal split: the payer is owed everyone else\'s share', () => {
  const { groupId, ids: { A, B, C } } = createGroup(['A', 'B', 'C']);
  addExpense(groupId, A, { [A]: 3000 }, [A, B, C]);
  assert.deepStrictEqual(netBalances(groupId), { [A]: 2000, [B]: -1000, [C]: -1000 });
});

test('multiple payers: each person owes payers in proportion to what they paid', () => {
  const { groupId, ids: { A, B, C } } = createGroup(['A', 'B', 'C']);
  addExpense(groupId, A, { [A]: 2000, [B]: 1000 }, [A, B, C]);
  const { balances: debts } = balances.computeGroupBalances(groupId);
  const owed = (from, to) => debts.find(d => d.from_user === from && d.to_user === to)?.amount || 0;
  // Each share is 1000, owed 2/3 to A and 1/3 to B.
  // C owes A 667 and B 333. B owes A 667 but A owes B 333, which nets to 334.
  assert.strictEqual(owed(C, A), 667);
  assert.strictEqual(owed(C, B), 333);
  assert.strictEqual(owed(B, A), 334);
  assert.strictEqual(owed(A, B), 0);
});

test('reciprocal debts net out between a pair', () => {
  const { groupId, ids: { A, B } } = createGroup(['A', 'B']);
  addExpense(groupId, A, { [A]: 2000 }, [A, B]); // B owes A 10
  addExpense(groupId, B, { [B]: 600 }, [A, B]);  // A owes B 3
  const { balances: debts } = balances.computeGroupBalances(groupId);
  assert.deepStrictEqual(debts.map(d => [d.from_user, d.to_user, d.amount]), [[B, A, 700]]);
});

test('a partial payment reduces the debt', () => {
  const { groupId, ids: { A, B } } = createGroup(['A', 'B']);
  addExpense(groupId, A, { [A]: 2000 }, [A, B]);
  pay(groupId, B, B, A, 400);
  assert.deepStrictEqual(netBalances(groupId), { [A]: 600, [B]: -600 });
});

test('after everyone settles up, old expenses are settled and balances start fresh', () => {
  const { groupId, ids: { A, B, C } } = createGroup(['A', 'B', 'C']);
  const old = addExpense(groupId, A, { [A]: 3000 }, [A, B, C]);
  pay(groupId, B, B, A, 1000);
  assert.strictEqual(expenses.getExpenseById(old.id, groupId).is_settled, false, 'C still owes');
  pay(groupId, C, C, A, 1000);
  assert.strictEqual(expenses.getExpenseById(old.id, groupId).is_settled, true);

  // An expense recorded later counts, even if it is backdated
  const later = addExpense(groupId, B, { [B]: 900 }, [A, B, C], { date: '2025-01-01' });
  assert.strictEqual(expenses.getExpenseById(later.id, groupId).is_settled, false);
  assert.deepStrictEqual(netBalances(groupId), { [A]: -300, [B]: 600, [C]: -300 });
});

test('editing a settled expense re-opens it', () => {
  const { groupId, ids: { A, B } } = createGroup(['A', 'B']);
  const e = addExpense(groupId, A, { [A]: 2000 }, [A, B]);
  pay(groupId, B, B, A, 1000);
  assert.strictEqual(expenses.getExpenseById(e.id, groupId).is_settled, true);

  expenses.updateExpense(e.id, {
    description: 'Expense', amount: 4000, category: 'other', split_type: 'equal', date: '2026-01-01',
    trip_id: null, payers: [{ user_id: A, amount: 4000 }], splits: [{ user_id: A }, { user_id: B }],
  }, A, groupId);
  assert.strictEqual(expenses.getExpenseById(e.id, groupId).is_settled, false);
  assert.deepStrictEqual(netBalances(groupId), { [A]: 1000, [B]: -1000 });
});

test('expenses are listed latest first', () => {
  const { groupId, ids: { A, B } } = createGroup(['A', 'B']);
  addExpense(groupId, A, { [A]: 100 }, [A, B], { description: 'old', date: '2026-01-01' });
  addExpense(groupId, A, { [A]: 100 }, [A, B], { description: 'new', date: '2026-03-01' });
  addExpense(groupId, A, { [A]: 100 }, [A, B], { description: 'mid', date: '2026-02-01' });
  assert.deepStrictEqual(expenses.getGroupExpenses(groupId).map(e => e.description), ['new', 'mid', 'old']);
});

test('expenses from another group cannot be read or changed', () => {
  const g1 = createGroup(['A', 'B']);
  const g2 = createGroup(['X']);
  const e = addExpense(g1.groupId, g1.ids.A, { [g1.ids.A]: 100 }, [g1.ids.A, g1.ids.B]);
  assert.throws(() => expenses.getExpenseById(e.id, g2.groupId), /not found/);
  assert.throws(() => expenses.deleteExpense(e.id, g2.ids.X, g2.groupId), /not found/);
});

test('expense participants and trip must belong to the group', () => {
  const { groupId, ids: { A, B } } = createGroup(['A', 'B']);
  const other = createGroup(['X']);
  assert.throws(() => addExpense(groupId, A, { [A]: 100 }, [A, other.ids.X]), /must be a member/);
  assert.throws(() => addExpense(groupId, A, { [A]: 100 }, [A, A]), /listed twice/);
  const trip = require('./helpers').db.prepare('INSERT INTO trips (group_id, name, created_by) VALUES (?, ?, ?)')
    .run(other.groupId, 'Not yours', other.ids.X).lastInsertRowid;
  assert.throws(() => addExpense(groupId, A, { [A]: 100 }, [A, B], { trip_id: Number(trip) }), /Trip not found/);
});

test('deleting an expense removes it from balances; restoring brings it back', () => {
  const { groupId, ids: { A, B } } = createGroup(['A', 'B']);
  const e = addExpense(groupId, A, { [A]: 2000 }, [A, B]);
  expenses.deleteExpense(e.id, A, groupId);
  assert.deepStrictEqual(netBalances(groupId), { [A]: 0, [B]: 0 });
  assert.throws(() => expenses.getExpenseById(e.id, groupId), /not found/);
  assert.strictEqual(expenses.getExpenseById(e.id, groupId, { includeDeleted: true }).is_deleted, 1);

  expenses.restoreExpense(e.id, B, groupId);
  assert.deepStrictEqual(netBalances(groupId), { [A]: 1000, [B]: -1000 });
  assert.throws(() => expenses.restoreExpense(e.id, B, groupId), /not deleted/);
});

test('editing, deleting and restoring a payment updates balances', () => {
  const { groupId, ids: { A, B } } = createGroup(['A', 'B']);
  addExpense(groupId, A, { [A]: 2000 }, [A, B]);
  const p = pay(groupId, B, B, A, 1000);
  assert.deepStrictEqual(netBalances(groupId), { [A]: 0, [B]: 0 });

  payments.updatePayment(p.id, groupId, A, { amount: 400 });
  assert.deepStrictEqual(netBalances(groupId), { [A]: 600, [B]: -600 });

  payments.deletePayment(p.id, groupId, A);
  assert.deepStrictEqual(netBalances(groupId), { [A]: 1000, [B]: -1000 });
  assert.strictEqual(payments.getGroupPayments(groupId).length, 0);

  payments.restorePayment(p.id, groupId, A);
  assert.deepStrictEqual(netBalances(groupId), { [A]: 600, [B]: -600 });
});

test('a payment cannot be edited into an invalid one', () => {
  const { groupId, ids: { A, B } } = createGroup(['A', 'B']);
  const other = createGroup(['X']);
  const p = pay(groupId, B, B, A, 100);
  assert.throws(() => payments.updatePayment(p.id, groupId, A, { payee_id: B, amount: 100 }), /different people/);
  assert.throws(() => payments.updatePayment(p.id, groupId, A, { payee_id: other.ids.X, amount: 100 }), /group members/);
  assert.throws(() => payments.updatePayment(p.id, other.groupId, other.ids.X, { amount: 1 }), /not found/);
});

test('placeholder members can be in expenses and settle up', () => {
  const { groupId, ids: { A } } = createGroup(['A']);
  const carol = -groups.addPlaceholderMember(groupId, 'Carol', A).id;
  addExpense(groupId, A, { [A]: 2000 }, [A, carol]);
  assert.deepStrictEqual(netBalances(groupId), { [A]: 1000, [carol]: -1000 });
  pay(groupId, A, carol, A, 1000); // A records Carol's cash payment
  assert.deepStrictEqual(netBalances(groupId), { [A]: 0, [carol]: 0 });
});

test('claiming a placeholder merges them into the real user', () => {
  const { groupId, ids: { A, D } } = createGroup(['A', 'D']);
  const ph = groups.addPlaceholderMember(groupId, 'Carol', A);
  addExpense(groupId, A, { [A]: 900 }, [A, D, -ph.id]);
  groups.claimPlaceholder(groupId, ph.id, D);
  assert.deepStrictEqual(netBalances(groupId), { [A]: 600, [D]: -600 });
});

test('members cannot leave while they owe or are owed money', () => {
  const { groupId, ids: { A, B } } = createGroup(['A', 'B']);
  addExpense(groupId, A, { [A]: 2000 }, [A, B]);
  assert.throws(() => groups.removeMember(groupId, B, B), /You still owe \$10.00/);
  assert.throws(() => groups.removeMember(groupId, B, A), /B still owes \$10.00/);
  pay(groupId, B, B, A, 1000);
  groups.removeMember(groupId, B, B);
});

test('a deleted expense cannot be restored once someone on it has left', () => {
  const { groupId, ids: { A, B } } = createGroup(['A', 'B']);
  const e = addExpense(groupId, A, { [A]: 2000 }, [A, B]);
  expenses.deleteExpense(e.id, A, groupId);
  groups.removeMember(groupId, B, B);
  assert.throws(() => expenses.restoreExpense(e.id, A, groupId), /no longer in the group/);
});
