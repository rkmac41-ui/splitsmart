/**
 * Simplify debts using a greedy algorithm.
 *
 * Given a map of net balances per user, produces the minimum (near-optimal)
 * set of transactions to settle all debts.
 *
 * @param {Map<number, number>} balanceMap - userId -> netBalance
 *   Positive = they are owed money (creditor)
 *   Negative = they owe money (debtor)
 * @returns {Array<{from_user: number, to_user: number, amount: number}>}
 */
function simplifyDebts(balanceMap) {
  const transactions = [];

  const debtors = [];   // People who owe (negative balance)
  const creditors = []; // People who are owed (positive balance)

  for (const [userId, balance] of Object.entries(balanceMap)) {
    const uid = Number(userId);
    if (balance < 0) {
      debtors.push({ userId: uid, balance: Math.abs(balance) });
    } else if (balance > 0) {
      creditors.push({ userId: uid, balance });
    }
  }

  // Sort by balance descending (largest amounts first)
  debtors.sort((a, b) => b.balance - a.balance);
  creditors.sort((a, b) => b.balance - a.balance);

  let i = 0;
  let j = 0;

  while (i < debtors.length && j < creditors.length) {
    const debtor = debtors[i];
    const creditor = creditors[j];

    const settlement = Math.min(debtor.balance, creditor.balance);

    if (settlement > 0) {
      transactions.push({
        from_user: debtor.userId,
        to_user: creditor.userId,
        amount: settlement,
      });
    }

    debtor.balance -= settlement;
    creditor.balance -= settlement;

    if (debtor.balance === 0) i++;
    if (creditor.balance === 0) j++;
  }

  return transactions;
}

module.exports = { simplifyDebts };
