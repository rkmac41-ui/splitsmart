const test = require('node:test');
const assert = require('node:assert');
const { simplifyDebts } = require('../src/utils/debtSimplifier');

test('simplified debts settle every balance', () => {
  const balances = { 1: 3000, 2: -1000, 3: -1500, 4: -500 };
  const txns = simplifyDebts(balances);
  const after = { ...balances };
  for (const t of txns) {
    after[t.from_user] += t.amount;
    after[t.to_user] -= t.amount;
  }
  assert.ok(Object.values(after).every(v => v === 0));
  assert.ok(txns.length <= 3);
});

test('a chain A->B->C collapses into one payment', () => {
  // A owes B 10, B owes C 10: net A -10, B 0, C +10
  assert.deepStrictEqual(simplifyDebts({ 1: -1000, 2: 0, 3: 1000 }), [{ from_user: 1, to_user: 3, amount: 1000 }]);
});

test('everyone square means no payments', () => {
  assert.deepStrictEqual(simplifyDebts({ 1: 0, 2: 0 }), []);
});
