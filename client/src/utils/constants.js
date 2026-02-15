export const CATEGORIES = [
  { key: 'food_drink', label: 'Food & Drink', emoji: '\uD83C\uDF7D\uFE0F' },
  { key: 'transport', label: 'Transport', emoji: '\uD83D\uDE97' },
  { key: 'entertainment', label: 'Entertainment', emoji: '\uD83C\uDFAC' },
  { key: 'shopping', label: 'Shopping', emoji: '\uD83D\uDECD\uFE0F' },
  { key: 'groceries', label: 'Groceries', emoji: '\uD83D\uDED2' },
  { key: 'rent', label: 'Rent', emoji: '\uD83C\uDFE0' },
  { key: 'utilities', label: 'Utilities', emoji: '\u26A1' },
  { key: 'other', label: 'Other', emoji: '\uD83D\uDCCB' },
];

export const SPLIT_TYPES = [
  { key: 'equal', label: 'Equal', description: 'Split evenly' },
  { key: 'exact', label: 'Exact', description: 'Enter exact amounts' },
  { key: 'percentage', label: 'Percentage', description: 'Split by percentage' },
  { key: 'shares', label: 'Shares', description: 'Split by shares' },
];

export const getCategoryByKey = (key) =>
  CATEGORIES.find(c => c.key === key) || CATEGORIES[CATEGORIES.length - 1];
