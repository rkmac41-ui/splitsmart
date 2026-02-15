const { ValidationError } = require('./errors');

/**
 * Distribute remainder cents to participants with largest fractional parts.
 * Ensures total always sums correctly.
 */
function distributeRemainder(participants, total) {
  const currentSum = participants.reduce((sum, p) => sum + p.amount, 0);
  let remainder = total - currentSum;

  if (remainder === 0) return participants;

  // Sort by fractional part descending, then user_id ascending for determinism
  const sorted = [...participants].sort((a, b) => {
    if (b.fractionalPart !== a.fractionalPart) {
      return b.fractionalPart - a.fractionalPart;
    }
    return a.user_id - b.user_id;
  });

  for (let i = 0; i < remainder && i < sorted.length; i++) {
    sorted[i].amount += 1;
  }

  return sorted;
}

/**
 * Equal split among selected participants
 */
function splitEqual(totalAmount, splits) {
  const numParticipants = splits.length;
  if (numParticipants === 0) throw new ValidationError('At least one participant required');

  const baseShare = Math.floor(totalAmount / numParticipants);
  const remainder = totalAmount - baseShare * numParticipants;

  const participants = splits.map((s, i) => ({
    user_id: s.user_id,
    amount: baseShare,
    fractionalPart: i < remainder ? 1 : 0, // First N get extra cent
    share_value: null,
  }));

  // Give extra cent to first `remainder` participants
  for (let i = 0; i < remainder; i++) {
    participants[i].amount += 1;
  }

  return participants.map(p => ({
    user_id: p.user_id,
    amount: p.amount,
    share_value: p.share_value,
  }));
}

/**
 * Exact amount split - each participant specifies exact amount
 */
function splitExact(totalAmount, splits) {
  const sum = splits.reduce((s, p) => s + Math.round(p.share_value), 0);
  if (sum !== totalAmount) {
    throw new ValidationError(
      `Exact split amounts (${sum}) must equal total (${totalAmount})`
    );
  }

  return splits.map(s => ({
    user_id: s.user_id,
    amount: Math.round(s.share_value),
    share_value: s.share_value,
  }));
}

/**
 * Percentage-based split
 */
function splitPercentage(totalAmount, splits) {
  const totalPercent = splits.reduce((s, p) => s + p.share_value, 0);
  if (Math.abs(totalPercent - 100) > 0.01) {
    throw new ValidationError(
      `Percentages must sum to 100 (got ${totalPercent})`
    );
  }

  const participants = splits.map(s => {
    const rawAmount = (totalAmount * s.share_value) / 100;
    const floored = Math.floor(rawAmount);
    return {
      user_id: s.user_id,
      amount: floored,
      fractionalPart: rawAmount - floored,
      share_value: s.share_value,
    };
  });

  const distributed = distributeRemainder(participants, totalAmount);

  return distributed.map(p => ({
    user_id: p.user_id,
    amount: p.amount,
    share_value: p.share_value,
  }));
}

/**
 * Shares-based split (e.g., 2x for one person, 1x for another)
 */
function splitShares(totalAmount, splits) {
  const totalShares = splits.reduce((s, p) => s + p.share_value, 0);
  if (totalShares <= 0) {
    throw new ValidationError('Total shares must be positive');
  }

  const participants = splits.map(s => {
    const rawAmount = (totalAmount * s.share_value) / totalShares;
    const floored = Math.floor(rawAmount);
    return {
      user_id: s.user_id,
      amount: floored,
      fractionalPart: rawAmount - floored,
      share_value: s.share_value,
    };
  });

  const distributed = distributeRemainder(participants, totalAmount);

  return distributed.map(p => ({
    user_id: p.user_id,
    amount: p.amount,
    share_value: p.share_value,
  }));
}

/**
 * Main entry point: calculate split based on type
 */
function calculateSplit(splitType, totalAmount, splits) {
  switch (splitType) {
    case 'equal':
      return splitEqual(totalAmount, splits);
    case 'exact':
      return splitExact(totalAmount, splits);
    case 'percentage':
      return splitPercentage(totalAmount, splits);
    case 'shares':
      return splitShares(totalAmount, splits);
    default:
      throw new ValidationError(`Unknown split type: ${splitType}`);
  }
}

module.exports = {
  calculateSplit,
  splitEqual,
  splitExact,
  splitPercentage,
  splitShares,
};
