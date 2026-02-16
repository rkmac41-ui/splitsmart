import { useState, useEffect, useRef } from 'react';
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

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [claimData, setClaimData] = useState(null); // { groupId, placeholders }
  const [claiming, setClaiming] = useState(false);
  const joinAttempted = useRef(false);

  // Auto-join on mount: join immediately, then check for unclaimed placeholders
  useEffect(() => {
    if (joinAttempted.current) return;
    joinAttempted.current = true;

    const autoJoin = async () => {
      try {
        const data = await groupsApi.joinGroupViaInvite(token);
        const group = data.group;
        const unclaimed = group.unclaimed_placeholders || [];

        if (unclaimed.length > 0) {
          // Show claim UI
          setClaimData({ groupId: group.id, groupName: group.name, placeholders: unclaimed });
          setLoading(false);
        } else {
          showToast(`Joined "${group.name}"!`, 'success');
          navigate(`/groups/${group.id}`, { replace: true });
        }
      } catch (err) {
        const msg = err.response?.data?.error || 'Failed to join group';
        if (msg.includes('Already a member')) {
          try {
            const info = await groupsApi.getGroupByInviteToken(token);
            showToast('You are already a member of this group', 'info');
            navigate(`/groups/${info.group.id}`, { replace: true });
          } catch {
            showToast('You are already a member', 'info');
            navigate('/', { replace: true });
          }
        } else {
          setError(msg);
          setLoading(false);
        }
      }
    };
    autoJoin();
  }, [token, navigate, showToast]);

  const handleClaim = async (placeholderId) => {
    setClaiming(true);
    try {
      await groupsApi.claimPlaceholder(claimData.groupId, placeholderId);
      const phName = claimData.placeholders.find(p => p.id === placeholderId)?.name;
      showToast(`Joined "${claimData.groupName}" as ${phName}! All previous expenses have been linked to your account.`, 'success');
      navigate(`/groups/${claimData.groupId}`, { replace: true });
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to claim identity', 'error');
      setClaiming(false);
    }
  };

  const handleSkipClaim = () => {
    showToast(`Joined "${claimData.groupName}"!`, 'success');
    navigate(`/groups/${claimData.groupId}`, { replace: true });
  };

  if (loading) {
    return (
      <div className={styles.page}>
        <div className={styles.card}>
          <div className={styles.spinner} />
          <p className={styles.joiningText}>Joining group...</p>
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

  // Claim UI: show unclaimed placeholders for the user to pick
  if (claimData) {
    return (
      <div className={styles.page}>
        <div className={styles.card}>
          <h2 className={styles.title}>Welcome to {claimData.groupName}!</h2>
          <p className={styles.claimSubtitle}>
            Are you one of these people? Select your name to link their expenses to your account.
          </p>
          <div className={styles.claimList}>
            {claimData.placeholders.map(ph => (
              <button
                key={ph.id}
                className={styles.claimOption}
                onClick={() => handleClaim(ph.id)}
                disabled={claiming}
              >
                <span className={styles.claimName}>{ph.name}</span>
                <span className={styles.claimArrow}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
                </span>
              </button>
            ))}
          </div>
          <button
            className={styles.skipBtn}
            onClick={handleSkipClaim}
            disabled={claiming}
          >
            I'm someone new — skip this
          </button>
        </div>
      </div>
    );
  }

  return null;
}
