import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import * as groupsApi from '../../api/groups';
import styles from './JoinGroupPage.module.css';

export default function JoinGroupPage() {
  const { token } = useParams();
  const { user } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [group, setGroup] = useState(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchGroup = async () => {
      try {
        const data = await groupsApi.getGroupByInviteToken(token);
        setGroup(data.group);
      } catch (err) {
        setError('Invalid or expired invite link');
      } finally {
        setLoading(false);
      }
    };
    fetchGroup();
  }, [token]);

  const handleJoin = async () => {
    setJoining(true);
    try {
      const data = await groupsApi.joinGroupViaInvite(token);
      showToast(`Joined ${data.group.name}!`, 'success');
      navigate(`/groups/${data.group.id}`);
    } catch (err) {
      const msg = err.response?.data?.error || 'Failed to join group';
      if (msg.includes('Already a member')) {
        showToast('You are already a member', 'info');
        navigate(`/groups/${group.id}`);
      } else {
        setError(msg);
      }
    } finally {
      setJoining(false);
    }
  };

  if (loading) {
    return (
      <div className={styles.page}>
        <div className={styles.card}>
          <div className={styles.spinner} />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.page}>
        <div className={styles.card}>
          <h2 className={styles.title}>Oops!</h2>
          <p className={styles.error}>{error}</p>
          <button className={styles.btn} onClick={() => navigate('/')}>Go to Dashboard</button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <h2 className={styles.title}>Join Group</h2>
        <p className={styles.groupName}>{group?.name}</p>
        <p className={styles.info}>{group?.member_count} members</p>
        <button className={styles.joinBtn} onClick={handleJoin} disabled={joining}>
          {joining ? 'Joining...' : 'Join Group'}
        </button>
      </div>
    </div>
  );
}
