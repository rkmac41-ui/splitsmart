/**
 * Format cents to currency string: 8500 -> "$85.00"
 */
export function formatCurrency(cents) {
  if (cents == null) return '$0.00';
  const amount = Math.abs(cents) / 100;
  const formatted = amount.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  });
  return cents < 0 ? `-${formatted}` : formatted;
}

/**
 * Parse a dollar string to cents: "$85.00" -> 8500, "85" -> 8500
 */
export function dollarsToCents(dollars) {
  if (!dollars && dollars !== 0) return 0;
  const num = typeof dollars === 'string' ? parseFloat(dollars) : dollars;
  return Math.round(num * 100);
}

/**
 * Format cents to dollar number: 8500 -> 85.00
 */
export function centsToDollars(cents) {
  if (!cents) return '0.00';
  return (cents / 100).toFixed(2);
}

/**
 * Format ISO date: "2026-02-14" -> "Feb 14, 2026"
 */
export function formatDate(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * Format relative time: "2026-02-14T12:00:00" -> "2 hours ago"
 */
export function formatRelativeTime(isoString) {
  if (!isoString) return '';

  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now - date;
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSeconds < 60) return 'just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return formatDate(isoString.split('T')[0]);
}
