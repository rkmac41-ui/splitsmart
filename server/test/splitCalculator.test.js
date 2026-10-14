const test = require('node:test');
const assert = require('node:assert');
const { calculateSplit } = require('../src/utils/splitCalculator');

const sum = (splits) => splits.reduce((s, x) => s + x.amount, 0);

test('equal split gives leftover cents to the first participants', () => {
  const r = calculateSplit('equal', 1000, [{ user_id: 1 }, { user_id: 2 }, { user_id: 3 }]);
  assert.deepStrictEqual(r.map(x => x.amount), [334, 333, 333]);
  assert.strictEqual(sum(r), 1000);
});

test('exact split must add up to the total', () => {
  const r = calculateSplit('exact', 1000, [{ user_id: 1, share_value: 700 }, { user_id: 2, share_value: 300 }]);
  assert.deepStrictEqual(r.map(x => x.amount), [700, 300]);
  assert.throws(() => calculateSplit('exact', 1000, [{ user_id: 1, share_value: 600 }]), /must equal total/);
});

test('percentage split sums exactly and rejects bad totals', () => {
  const r = calculateSplit('percentage', 1000, [
    { user_id: 1, share_value: 33.33 }, { user_id: 2, share_value: 33.33 }, { user_id: 3, share_value: 33.34 },
  ]);
  assert.strictEqual(sum(r), 1000);
  assert.throws(() => calculateSplit('percentage', 1000, [{ user_id: 1, share_value: 90 }]), /sum to 100/);
});

test('shares split is proportional and sums exactly', () => {
  const r = calculateSplit('shares', 1000, [{ user_id: 1, share_value: 2 }, { user_id: 2, share_value: 1 }]);
  const byUser = Object.fromEntries(r.map(x => [x.user_id, x.amount]));
  assert.strictEqual(byUser[1], 667);
  assert.strictEqual(byUser[2], 333);
  assert.throws(() => calculateSplit('shares', 1000, [{ user_id: 1, share_value: 0 }]), /must be positive/);
});

test('unknown split type is rejected', () => {
  assert.throws(() => calculateSplit('weird', 100, [{ user_id: 1 }]), /Unknown split type/);
});
