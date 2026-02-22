import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useNotifications } from '../../contexts/NotificationContext';
import Avatar from '../Avatar/Avatar';
import { formatRelativeTime } from '../../utils/formatters';
import styles from './NotificationDropdown.module.css';

export default function NotificationDropdown({ onClose }) {
  const { notifications, fetchNotifications, markAsRead, markAllAsRead } = useNotifications();
  const navigate = useNavigate();

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  const handleClick = async (notification) => {
    if (!notification.is_read) {
      await markAsRead(notification.id);
    }
    if (notification.group_id) {
      // Navigate to the group and switch to the relevant tab
      const tab = notification.entity_type === 'expense' ? 'expenses' : 'activity';
      navigate(`/groups/${notification.group_id}?tab=${tab}`);
    }
    onClose();
  };

  return (
    <div className={styles.dropdown}>
      <div className={styles.header}>
        <h3 className={styles.title}>Notifications</h3>
        <button className={styles.markAll} onClick={markAllAsRead}>
          Mark all read
        </button>
      </div>
      <div className={styles.list}>
        {notifications.length === 0 ? (
          <div className={styles.empty}>No notifications yet</div>
        ) : (
          notifications.slice(0, 20).map(n => (
            <button
              key={n.id}
              className={`${styles.item} ${!n.is_read ? styles.unread : ''}`}
              onClick={() => handleClick(n)}
            >
              <Avatar name={n.actor_name} size="small" />
              <div className={styles.content}>
                <p className={styles.message}>{n.message}</p>
                <span className={styles.meta}>
                  {n.group_name && <span className={styles.group}>{n.group_name}</span>}
                  <span className={styles.time}>{formatRelativeTime(n.created_at)}</span>
                </span>
              </div>
              {!n.is_read && <span className={styles.dot} />}
            </button>
          ))
        )}
      </div>
    </div>
  );
}
