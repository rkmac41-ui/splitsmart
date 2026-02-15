import { formatRelativeTime, formatCurrency } from '../../utils/formatters';
import styles from './ActivityFeed.module.css';

const ACTION_ICONS = {
  expense_added: '+',
  expense_edited: '\u270E',
  expense_deleted: '\u2717',
  payment_recorded: '\uD83D\uDCB0',
  member_joined: '\u2192',
  member_left: '\u2190',
  member_removed: '\u2190',
  trip_created: '\u2708',
  trip_deleted: '\u2717',
  group_created: '\u2605',
};

const ACTION_COLORS = {
  expense_added: 'var(--color-success)',
  expense_edited: 'var(--color-info)',
  expense_deleted: 'var(--color-danger)',
  payment_recorded: 'var(--color-primary)',
  member_joined: 'var(--color-success)',
  member_left: 'var(--color-warning)',
  member_removed: 'var(--color-danger)',
  trip_created: 'var(--color-info)',
  trip_deleted: 'var(--color-danger)',
  group_created: 'var(--color-primary)',
};

function getDescription(activity) {
  const { action, user_name, metadata } = activity;
  const meta = metadata || {};

  switch (action) {
    case 'expense_added':
      return `${user_name} added "${meta.description}" (${formatCurrency(meta.amount)})`;
    case 'expense_edited':
      if (meta.old && meta.new) {
        const changes = [];
        if (meta.old.description !== meta.new.description) {
          changes.push(`"${meta.old.description}" \u2192 "${meta.new.description}"`);
        }
        if (meta.old.amount !== meta.new.amount) {
          changes.push(`${formatCurrency(meta.old.amount)} \u2192 ${formatCurrency(meta.new.amount)}`);
        }
        return `${user_name} edited expense: ${changes.join(', ') || 'updated details'}`;
      }
      return `${user_name} edited an expense`;
    case 'expense_deleted':
      return `${user_name} deleted "${meta.description}" (${formatCurrency(meta.amount)})`;
    case 'payment_recorded':
      return `${meta.payer_name} paid ${meta.payee_name} ${formatCurrency(meta.amount)}`;
    case 'member_joined':
      return `${meta.member_name || user_name} joined the group`;
    case 'member_left':
      return `${meta.member_name || user_name} left the group`;
    case 'member_removed':
      return `${user_name} removed ${meta.member_name} from the group`;
    case 'trip_created':
      return `${user_name} created trip "${meta.name}"`;
    case 'trip_deleted':
      return `${user_name} deleted trip "${meta.name}"`;
    case 'group_created':
      return `${user_name} created the group`;
    default:
      return `${user_name} performed an action`;
  }
}

export default function ActivityFeed({ activities, showGroup = false }) {
  if (!activities || activities.length === 0) {
    return <div className={styles.empty}>No activity yet</div>;
  }

  return (
    <div className={styles.feed}>
      {activities.map(activity => (
        <div key={activity.id} className={styles.item}>
          <div
            className={styles.icon}
            style={{ color: ACTION_COLORS[activity.action] || 'var(--color-text-secondary)' }}
          >
            {ACTION_ICONS[activity.action] || '\u2022'}
          </div>
          <div className={styles.content}>
            <p className={styles.description}>{getDescription(activity)}</p>
            <div className={styles.meta}>
              {showGroup && activity.group_name && (
                <span className={styles.group}>{activity.group_name}</span>
              )}
              <span className={styles.time}>{formatRelativeTime(activity.created_at)}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
