import styles from './Avatar.module.css';

const COLORS = [
  '#1cc29f', '#3498db', '#9b59b6', '#e74c3c', '#f39c12',
  '#1abc9c', '#2ecc71', '#e67e22', '#e91e63', '#00bcd4',
];

function getColorFromName(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return COLORS[Math.abs(hash) % COLORS.length];
}

function getInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function Avatar({ name, size = 'medium' }) {
  const color = getColorFromName(name || '');
  const initials = getInitials(name);

  return (
    <div
      className={`${styles.avatar} ${styles[size]}`}
      style={{ backgroundColor: color }}
      title={name}
    >
      {initials}
    </div>
  );
}
