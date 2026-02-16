import { useState, useEffect, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import * as groupsApi from '../../api/groups';
import * as expensesApi from '../../api/expenses';
import * as tripsApi from '../../api/trips';
import * as paymentsApi from '../../api/payments';
import * as balancesApi from '../../api/balances';
import Modal from '../../components/Modal/Modal';
import ExpenseForm from '../../components/ExpenseForm/ExpenseForm';
import BalanceList from '../../components/BalanceList/BalanceList';
import ActivityFeed from '../../components/ActivityFeed/ActivityFeed';
import { formatCurrency, formatDate, centsToDollars } from '../../utils/formatters';
import { getCategoryByKey } from '../../utils/constants';
import styles from './GroupPage.module.css';

export default function GroupPage() {
  const { groupId } = useParams();
  const { user } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [group, setGroup] = useState(null);
  const [members, setMembers] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [trips, setTrips] = useState([]);
  const [balances, setBalances] = useState(null);
  const [detailedBalances, setDetailedBalances] = useState(null);
  const [activity, setActivity] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('expenses');

  // Modals
  const [showAddExpense, setShowAddExpense] = useState(false);
  const [editingExpense, setEditingExpense] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showAddTrip, setShowAddTrip] = useState(false);
  const [showSettleUp, setShowSettleUp] = useState(null);
  const [expenseLoading, setExpenseLoading] = useState(false);

  // Settings state
  const [inviteLink, setInviteLink] = useState(null);
  const [newTripName, setNewTripName] = useState('');

  const fetchAll = useCallback(async () => {
    try {
      const [gData, mData, eData, tData, bData, aData, dData] = await Promise.all([
        groupsApi.getGroup(groupId),
        groupsApi.getGroupMembers(groupId),
        expensesApi.getExpenses(groupId),
        tripsApi.getTrips(groupId),
        balancesApi.getGroupBalances(groupId),
        balancesApi.getGroupActivity(groupId, 30),
        balancesApi.getDetailedBalances(groupId),
      ]);
      setGroup(gData.group);
      setMembers(mData.members);
      setExpenses(eData.expenses);
      setTrips(tData.trips);
      setBalances(bData);
      setActivity(aData.activities);
      setDetailedBalances(dData);
    } catch (err) {
      showToast('Failed to load group', 'error');
    } finally {
      setLoading(false);
    }
  }, [groupId, showToast]);

  useEffect(() => {
    setLoading(true);
    fetchAll();
  }, [fetchAll]);

  const handleAddExpense = async (data) => {
    setExpenseLoading(true);
    try {
      await expensesApi.createExpense(groupId, data);
      showToast('Expense added', 'success');
      setShowAddExpense(false);
      fetchAll();
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to add expense', 'error');
    } finally {
      setExpenseLoading(false);
    }
  };

  const handleEditExpense = async (data) => {
    setExpenseLoading(true);
    try {
      await expensesApi.updateExpense(groupId, editingExpense.id, data);
      showToast('Expense updated', 'success');
      setEditingExpense(null);
      fetchAll();
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to update expense', 'error');
    } finally {
      setExpenseLoading(false);
    }
  };

  const handleDeleteExpense = async (expenseId) => {
    if (!confirm('Delete this expense?')) return;
    try {
      await expensesApi.deleteExpense(groupId, expenseId);
      showToast('Expense deleted', 'success');
      fetchAll();
    } catch (err) {
      showToast('Failed to delete expense', 'error');
    }
  };

  const handleSettleUp = async (amount) => {
    try {
      await paymentsApi.recordPayment(groupId, {
        payee_id: showSettleUp.to_user,
        amount: amount,
        note: '',
      });
      showToast('Payment recorded', 'success');
      setShowSettleUp(null);
      fetchAll();
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to record payment', 'error');
    }
  };

  const handleGenerateInvite = async () => {
    try {
      const data = await groupsApi.generateInviteLink(groupId);
      setInviteLink(data.invite.token);
    } catch (err) {
      showToast('Failed to generate invite', 'error');
    }
  };

  const handleToggleSimplify = async () => {
    try {
      await groupsApi.updateGroup(groupId, { simplify_debts: !group.simplify_debts });
      fetchAll();
      showToast(`Debt simplification ${group.simplify_debts ? 'disabled' : 'enabled'}`, 'success');
    } catch (err) {
      showToast('Failed to update', 'error');
    }
  };

  const handleCreateTrip = async (e) => {
    e.preventDefault();
    if (!newTripName.trim()) return;
    try {
      await tripsApi.createTrip(groupId, { name: newTripName.trim() });
      setNewTripName('');
      setShowAddTrip(false);
      showToast('Trip created', 'success');
      fetchAll();
    } catch (err) {
      showToast('Failed to create trip', 'error');
    }
  };

  const handleLeaveGroup = async () => {
    if (!confirm('Leave this group?')) return;
    try {
      await groupsApi.removeMember(groupId, user.id);
      showToast('Left group', 'success');
      navigate('/');
    } catch (err) {
      showToast('Failed to leave group', 'error');
    }
  };

  const inviteUrl = inviteLink ? `${window.location.origin}/invite/${inviteLink}` : '';

  if (loading) {
    return <div className={styles.loading}><div className={styles.spinner} /></div>;
  }

  if (!group) {
    return <div className={styles.notFound}>Group not found</div>;
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>{group.name}</h1>
          <span className={styles.memberInfo}>{members.length} members</span>
        </div>
        <div className={styles.headerActions}>
          <button className={styles.settingsBtn} onClick={() => setShowSettings(true)}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/>
            </svg>
          </button>
          <button className={styles.addExpenseBtn} onClick={() => setShowAddExpense(true)}>
            + Add Expense
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className={styles.tabs}>
        {['expenses', 'balances', 'trips', 'activity'].map(tab => (
          <button
            key={tab}
            className={`${styles.tab} ${activeTab === tab ? styles.activeTab : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className={styles.content}>
        {activeTab === 'expenses' && (
          <div className={styles.expenseList}>
            {expenses.length === 0 ? (
              <div className={styles.empty}>
                <p>No expenses yet</p>
                <button className={styles.addFirstBtn} onClick={() => setShowAddExpense(true)}>
                  Add your first expense
                </button>
              </div>
            ) : (
              <ExpensesByTrip
                expenses={expenses}
                trips={trips}
                onEdit={setEditingExpense}
                onDelete={handleDeleteExpense}
              />
            )}
          </div>
        )}

        {activeTab === 'balances' && (
          <div>
            <div className={styles.simplifyToggle}>
              <label className={styles.toggleLabel}>
                <input
                  type="checkbox"
                  checked={Boolean(group.simplify_debts)}
                  onChange={handleToggleSimplify}
                />
                <span>Simplify debts</span>
              </label>
              <span className={styles.toggleHint}>
                {group.simplify_debts
                  ? 'Minimizing the number of payments needed'
                  : 'Showing exact debts between each pair'}
              </span>
            </div>
            <BalanceList
              balances={balances?.balances}
              memberBalances={balances?.memberBalances}
              onSettleUp={(debt) => setShowSettleUp(debt)}
              detailedMembers={detailedBalances?.members}
            />
          </div>
        )}

        {activeTab === 'trips' && (
          <div className={styles.tripsSection}>
            <button className={styles.addTripBtn} onClick={() => setShowAddTrip(true)}>
              + Create Trip
            </button>
            {trips.length === 0 ? (
              <div className={styles.empty}><p>No trips yet</p></div>
            ) : (
              <div className={styles.tripList}>
                {trips.map(trip => (
                  <Link key={trip.id} to={`/groups/${groupId}/trips/${trip.id}`} className={styles.tripItem}>
                    <div className={styles.tripInfo}>
                      <span className={styles.tripName}>{trip.name}</span>
                      <span className={styles.tripMeta}>{trip.expense_count} expenses &middot; {formatCurrency(trip.total_amount)}</span>
                    </div>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg>
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'activity' && (
          <ActivityFeed activities={activity} />
        )}
      </div>

      {/* Add Expense Modal */}
      <Modal isOpen={showAddExpense} onClose={() => setShowAddExpense(false)} title="Add Expense" size="large">
        <ExpenseForm
          members={members}
          trips={trips}
          onSubmit={handleAddExpense}
          onCancel={() => setShowAddExpense(false)}
          loading={expenseLoading}
        />
      </Modal>

      {/* Edit Expense Modal */}
      <Modal isOpen={Boolean(editingExpense)} onClose={() => setEditingExpense(null)} title="Edit Expense" size="large">
        {editingExpense && (
          <ExpenseForm
            members={members}
            trips={trips}
            expense={editingExpense}
            onSubmit={handleEditExpense}
            onCancel={() => setEditingExpense(null)}
            loading={expenseLoading}
          />
        )}
      </Modal>

      {/* Settle Up Modal */}
      <Modal isOpen={Boolean(showSettleUp)} onClose={() => setShowSettleUp(null)} title="Settle Up" size="small">
        {showSettleUp && (
          <SettleUpForm
            debt={showSettleUp}
            onSubmit={handleSettleUp}
            onCancel={() => setShowSettleUp(null)}
          />
        )}
      </Modal>

      {/* Settings Modal */}
      <Modal isOpen={showSettings} onClose={() => setShowSettings(false)} title="Group Settings" size="medium">
        <GroupSettingsContent
          group={group}
          members={members}
          userId={user.id}
          inviteUrl={inviteUrl}
          onGenerateInvite={handleGenerateInvite}
          onLeave={handleLeaveGroup}
          onRemoveMember={async (memberId) => {
            try {
              await groupsApi.removeMember(groupId, memberId);
              showToast('Member removed', 'success');
              fetchAll();
            } catch (err) {
              showToast('Failed to remove member', 'error');
            }
          }}
          onAddPlaceholder={async (name) => {
            try {
              await groupsApi.addPlaceholderMember(groupId, name);
              showToast(`Added "${name}" as a pending member`, 'success');
              fetchAll();
            } catch (err) {
              showToast(err.response?.data?.error || 'Failed to add member', 'error');
            }
          }}
          onRemovePlaceholder={async (placeholderId) => {
            try {
              await groupsApi.removePlaceholderMember(groupId, placeholderId);
              showToast('Placeholder member removed', 'success');
              fetchAll();
            } catch (err) {
              showToast(err.response?.data?.error || 'Failed to remove placeholder', 'error');
            }
          }}
        />
      </Modal>

      {/* Create Trip Modal */}
      <Modal isOpen={showAddTrip} onClose={() => setShowAddTrip(false)} title="Create Trip" size="small">
        <form onSubmit={handleCreateTrip}>
          <div style={{ marginBottom: 16 }}>
            <label className={styles.formLabel}>Trip Name</label>
            <input
              className={styles.formInput}
              type="text"
              value={newTripName}
              onChange={e => setNewTripName(e.target.value)}
              placeholder="e.g., Beach Weekend"
              autoFocus
              maxLength={100}
            />
          </div>
          <button type="submit" className={styles.addExpenseBtn} style={{ width: '100%' }} disabled={!newTripName.trim()}>
            Create Trip
          </button>
        </form>
      </Modal>
    </div>
  );
}

function SettleUpForm({ debt, onSubmit, onCancel }) {
  const [amount, setAmount] = useState(centsToDollars(debt.amount));

  const handleSubmit = (e) => {
    e.preventDefault();
    const cents = Math.round(parseFloat(amount) * 100);
    if (cents > 0) onSubmit(cents);
  };

  return (
    <form onSubmit={handleSubmit}>
      <p style={{ marginBottom: 16, fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
        You owe <strong>{debt.to_user_name}</strong>
      </p>
      <div style={{ marginBottom: 16 }}>
        <label className={styles.formLabel}>Amount ($)</label>
        <input
          className={styles.formInput}
          type="number"
          step="0.01"
          min="0.01"
          value={amount}
          onChange={e => setAmount(e.target.value)}
          autoFocus
        />
      </div>
      <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
        <button type="button" onClick={onCancel} style={{
          padding: '8px 16px', border: '1px solid var(--color-border)', borderRadius: 8,
          background: 'none', cursor: 'pointer', fontSize: '0.875rem'
        }}>Cancel</button>
        <button type="submit" className={styles.addExpenseBtn}>Record Payment</button>
      </div>
    </form>
  );
}

function GroupSettingsContent({ group, members, userId, inviteUrl, onGenerateInvite, onLeave, onRemoveMember, onAddPlaceholder, onRemovePlaceholder }) {
  const currentMember = members.find(m => m.id === userId);
  const isAdmin = currentMember?.role === 'admin';
  const [copied, setCopied] = useState(false);
  const [placeholderName, setPlaceholderName] = useState('');
  const [addingPlaceholder, setAddingPlaceholder] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
  };

  const handleAddPlaceholder = async (e) => {
    e.preventDefault();
    if (!placeholderName.trim()) return;
    setAddingPlaceholder(true);
    try {
      await onAddPlaceholder(placeholderName.trim());
      setPlaceholderName('');
    } finally {
      setAddingPlaceholder(false);
    }
  };

  const realMembers = members.filter(m => !m.is_placeholder);
  const placeholderMembers = members.filter(m => m.is_placeholder);

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h3 style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: 12 }}>Invite Link</h3>
        {inviteUrl ? (
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              readOnly value={inviteUrl}
              style={{
                flex: 1, padding: '8px 12px', border: '1px solid var(--color-border)',
                borderRadius: 8, fontSize: '0.8125rem', background: 'var(--color-hover)'
              }}
            />
            <button onClick={handleCopy} style={{
              padding: '8px 16px', background: 'var(--color-primary)', color: 'white',
              border: 'none', borderRadius: 8, fontSize: '0.8125rem', fontWeight: 500, cursor: 'pointer'
            }}>{copied ? 'Copied!' : 'Copy'}</button>
          </div>
        ) : (
          <button onClick={onGenerateInvite} style={{
            padding: '8px 16px', background: 'var(--color-primary)', color: 'white',
            border: 'none', borderRadius: 8, fontSize: '0.875rem', fontWeight: 500, cursor: 'pointer'
          }}>Generate Invite Link</button>
        )}
      </div>

      {/* Add Member by Name */}
      <div style={{ marginBottom: 24 }}>
        <h3 style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: 8 }}>Add Member by Name</h3>
        <p style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', marginBottom: 10 }}>
          Add someone who hasn't signed up yet. They can claim their expenses when they join.
        </p>
        <form onSubmit={handleAddPlaceholder} style={{ display: 'flex', gap: 8 }}>
          <input
            type="text"
            value={placeholderName}
            onChange={e => setPlaceholderName(e.target.value)}
            placeholder="Enter name..."
            maxLength={100}
            style={{
              flex: 1, padding: '8px 12px', border: '1px solid var(--color-border)',
              borderRadius: 8, fontSize: '0.8125rem'
            }}
          />
          <button type="submit" disabled={!placeholderName.trim() || addingPlaceholder} style={{
            padding: '8px 16px', background: 'var(--color-primary)', color: 'white',
            border: 'none', borderRadius: 8, fontSize: '0.8125rem', fontWeight: 500,
            cursor: 'pointer', opacity: (!placeholderName.trim() || addingPlaceholder) ? 0.6 : 1,
          }}>{addingPlaceholder ? 'Adding...' : 'Add'}</button>
        </form>
      </div>

      <div style={{ marginBottom: 24 }}>
        <h3 style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: 12 }}>Members ({realMembers.length})</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {realMembers.map(m => (
            <div key={m.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0' }}>
              <div>
                <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>
                  {m.name} {m.id === userId && '(you)'}
                </span>
                {m.role === 'admin' && (
                  <span style={{
                    marginLeft: 8, fontSize: '0.6875rem', background: 'var(--color-primary-light)',
                    color: 'var(--color-primary-dark)', padding: '2px 8px', borderRadius: 99
                  }}>Admin</span>
                )}
              </div>
              {isAdmin && m.id !== userId && (
                <button onClick={() => onRemoveMember(m.id)} style={{
                  padding: '4px 12px', background: 'none', border: '1px solid var(--color-danger)',
                  color: 'var(--color-danger)', borderRadius: 6, fontSize: '0.75rem', cursor: 'pointer'
                }}>Remove</button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Placeholder Members */}
      {placeholderMembers.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <h3 style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: 12 }}>
            Pending Members ({placeholderMembers.length})
          </h3>
          <p style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', marginBottom: 8 }}>
            These members haven't joined yet. They can claim their identity when they sign up.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {placeholderMembers.map(m => (
              <div key={m.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>{m.name}</span>
                  <span style={{
                    fontSize: '0.6875rem', background: 'var(--color-warning-light, #fff3cd)',
                    color: 'var(--color-warning-dark, #856404)', padding: '2px 8px', borderRadius: 99
                  }}>Pending</span>
                </div>
                <button onClick={() => onRemovePlaceholder(m.placeholder_id)} style={{
                  padding: '4px 12px', background: 'none', border: '1px solid var(--color-danger)',
                  color: 'var(--color-danger)', borderRadius: 6, fontSize: '0.75rem', cursor: 'pointer'
                }}>Remove</button>
              </div>
            ))}
          </div>
        </div>
      )}

      <button onClick={onLeave} style={{
        width: '100%', padding: '10px', background: 'none', border: '1px solid var(--color-danger)',
        color: 'var(--color-danger)', borderRadius: 8, fontSize: '0.875rem', fontWeight: 500, cursor: 'pointer'
      }}>Leave Group</button>
    </div>
  );
}

function ExpensesByTrip({ expenses, trips, onEdit, onDelete }) {
  // Group expenses by trip
  const tripMap = {};
  for (const t of trips) {
    tripMap[t.id] = t.name;
  }

  const grouped = {};
  for (const expense of expenses) {
    const key = expense.trip_id || '__none__';
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(expense);
  }

  // Order: trips first (by name), then ungrouped at the end
  const tripKeys = Object.keys(grouped).filter(k => k !== '__none__').sort((a, b) => {
    const nameA = tripMap[a] || '';
    const nameB = tripMap[b] || '';
    return nameA.localeCompare(nameB);
  });
  const orderedKeys = [...tripKeys];
  if (grouped.__none__) orderedKeys.push('__none__');

  // If no trips at all, just show flat list
  if (orderedKeys.length === 1 && orderedKeys[0] === '__none__') {
    return grouped.__none__.map(expense => (
      <ExpenseRow key={expense.id} expense={expense} onEdit={onEdit} onDelete={onDelete} />
    ));
  }

  return orderedKeys.map(key => {
    const exps = grouped[key];
    const tripName = key === '__none__' ? 'General (no trip)' : tripMap[key] || 'Trip';
    const tripTotal = exps.reduce((sum, e) => sum + e.amount, 0);

    return (
      <div key={key} className={styles.tripGroup}>
        <div className={styles.tripGroupHeader}>
          <div className={styles.tripGroupTitle}>
            {key !== '__none__' && (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0 }}>
                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14,2 14,8 20,8"/>
              </svg>
            )}
            <span>{tripName}</span>
          </div>
          <span className={styles.tripGroupTotal}>
            {exps.length} expense{exps.length !== 1 ? 's' : ''} &middot; {formatCurrency(tripTotal)}
          </span>
        </div>
        {exps.map(expense => (
          <ExpenseRow key={expense.id} expense={expense} onEdit={onEdit} onDelete={onDelete} />
        ))}
      </div>
    );
  });
}

function ExpenseRow({ expense, onEdit, onDelete }) {
  const cat = getCategoryByKey(expense.category);
  return (
    <div className={styles.expenseItem}>
      <span className={styles.expenseCat}>{cat.emoji}</span>
      <div className={styles.expenseInfo}>
        <span className={styles.expenseDesc}>{expense.description}</span>
        <span className={styles.expenseMeta}>
          {formatDate(expense.date)} &middot; Paid by {expense.payers.map(p => p.user_name).join(', ')}
        </span>
      </div>
      <div className={styles.expenseRight}>
        <span className={styles.expenseAmount}>{formatCurrency(expense.amount)}</span>
        <div className={styles.expenseActions}>
          <button className={styles.editBtn} onClick={() => onEdit(expense)} title="Edit">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          <button className={styles.deleteBtn} onClick={() => onDelete(expense.id)} title="Delete">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3,6 5,6 21,6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
          </button>
        </div>
      </div>
    </div>
  );
}
