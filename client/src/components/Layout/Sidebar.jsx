import { useState, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import * as groupsApi from '../../api/groups';
import Modal from '../Modal/Modal';
import styles from './Sidebar.module.css';

export default function Sidebar({ isOpen, onClose }) {
  const [groups, setGroups] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [creating, setCreating] = useState(false);
  const navigate = useNavigate();

  const fetchGroups = async () => {
    try {
      const data = await groupsApi.getGroups();
      setGroups(data.groups);
    } catch (err) {
      // ignore
    }
  };

  useEffect(() => {
    fetchGroups();
  }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!newGroupName.trim() || creating) return;
    setCreating(true);
    try {
      const data = await groupsApi.createGroup(newGroupName.trim());
      setGroups(prev => [data.group, ...prev]);
      setShowCreate(false);
      setNewGroupName('');
      navigate(`/groups/${data.group.id}`);
    } catch (err) {
      // ignore
    } finally {
      setCreating(false);
    }
  };

  return (
    <>
      {isOpen && <div className={styles.overlay} onClick={onClose} />}
      <aside className={`${styles.sidebar} ${isOpen ? styles.open : ''}`}>
        <nav className={styles.nav}>
          <NavLink
            to="/"
            end
            className={({ isActive }) => `${styles.navItem} ${isActive ? styles.active : ''}`}
            onClick={onClose}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
              <polyline points="9,22 9,12 15,12 15,22" />
            </svg>
            Dashboard
          </NavLink>

          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <span>Groups</span>
              <button
                className={styles.addBtn}
                onClick={() => setShowCreate(true)}
                aria-label="Create group"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 5v14M5 12h14" />
                </svg>
              </button>
            </div>

            <div className={styles.groupList}>
              {groups.length === 0 ? (
                <p className={styles.empty}>No groups yet</p>
              ) : (
                groups.map(g => (
                  <NavLink
                    key={g.id}
                    to={`/groups/${g.id}`}
                    className={({ isActive }) =>
                      `${styles.navItem} ${styles.groupItem} ${isActive ? styles.active : ''}`
                    }
                    onClick={onClose}
                  >
                    <span className={styles.groupIcon}>
                      {g.name.charAt(0).toUpperCase()}
                    </span>
                    <span className={styles.groupName}>{g.name}</span>
                    <span className={styles.memberCount}>{g.trip_count || 0}</span>
                  </NavLink>
                ))
              )}
            </div>
          </div>
        </nav>
      </aside>

      <Modal isOpen={showCreate} onClose={() => setShowCreate(false)} title="Create Group" size="small">
        <form onSubmit={handleCreate}>
          <div className={styles.formGroup}>
            <label className={styles.label}>Group Name</label>
            <input
              className={styles.input}
              type="text"
              placeholder="e.g., Apartment, Trip to Bali"
              value={newGroupName}
              onChange={e => setNewGroupName(e.target.value)}
              autoFocus
              maxLength={100}
            />
          </div>
          <button
            type="submit"
            className={styles.createBtn}
            disabled={!newGroupName.trim() || creating}
          >
            {creating ? 'Creating...' : 'Create Group'}
          </button>
        </form>
      </Modal>
    </>
  );
}
