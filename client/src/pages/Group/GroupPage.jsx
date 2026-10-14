import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
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
import Avatar from '../../components/Avatar/Avatar';
import { formatCurrency, formatDate, centsToDollars } from '../../utils/formatters';
import { getCategoryByKey, SPLIT_TYPES } from '../../utils/constants';
import styles from './GroupPage.module.css';

export default function GroupPage() {
  const { groupId } = useParams();
  const { user } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [group, setGroup] = useState(null);
  const [members, setMembers] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [payments, setPayments] = useState([]);
  const [trips, setTrips] = useState([]);
  const [balances, setBalances] = useState(null);
  const [detailedBalances, setDetailedBalances] = useState(null);
  const [activity, setActivity] = useState([]);
  const [loading, setLoading] = useState(true);

  const validTabs = ['trips', 'expenses', 'balances', 'activity'];
  const tabFromUrl = searchParams.get('tab');
  const [activeTab, setActiveTab] = useState(
    validTabs.includes(tabFromUrl) ? tabFromUrl : 'trips'
  );

  // Modals
  const [showAddExpense, setShowAddExpense] = useState(false);
  const [editingExpense, setEditingExpense] = useState(null);
  const [viewingExpense, setViewingExpense] = useState(null);
  const [viewingPayment, setViewingPayment] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showAddTrip, setShowAddTrip] = useState(false);
  const [showSettleUp, setShowSettleUp] = useState(null);
  const [expenseLoading, setExpenseLoading] = useState(false);

  // Settings state
  const [inviteLink, setInviteLink] = useState(null);
  const [newTripName, setNewTripName] = useState('');

  const fetchAll = useCallback(async () => {
    try {
      const [gData, mData, eData, tData, bData, aData, dData, pData] = await Promise.all([
        groupsApi.getGroup(groupId),
        groupsApi.getGroupMembers(groupId),
        expensesApi.getExpenses(groupId),
        tripsApi.getTrips(groupId),
        balancesApi.getGroupBalances(groupId),
        balancesApi.getGroupActivity(groupId, 30),
        balancesApi.getDetailedBalances(groupId),
        paymentsApi.getPayments(groupId),
      ]);
      setGroup(gData.group);
      setMembers(mData.members);
      setExpenses(eData.expenses);
      setTrips(tData.trips);
      setBalances(bData);
      setActivity(aData.activities);
      setDetailedBalances(dData);
      setPayments(pData.payments);
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

  // Deep links from notifications / activity items:
  //   ?tab=<tab>       switch to that tab
  //   ?expense=<id>    open that expense on the Expenses tab
  //   ?payment=<id>    open that payment on the Balances tab
  // Deleted expenses/payments are fetched separately and open with a Restore button.
  useEffect(() => {
    const tab = searchParams.get('tab');
    const expenseId = searchParams.get('expense');
    const paymentId = searchParams.get('payment');
    if (!tab && !expenseId && !paymentId) return;
    if ((expenseId || paymentId) && loading) return; // wait until data is loaded

    // Clean up the URL params
    searchParams.delete('tab');
    searchParams.delete('expense');
    searchParams.delete('payment');
    setSearchParams(searchParams, { replace: true });

    if (tab && validTabs.includes(tab)) setActiveTab(tab);

    if (expenseId) {
      setActiveTab('expenses');
      const expense = expenses.find(e => String(e.id) === expenseId);
      if (expense) {
        setViewingExpense(expense);
      } else {
        expensesApi.getExpense(groupId, expenseId, { includeDeleted: true })
          .then(d => setViewingExpense(d.expense))
          .catch(() => showToast('That expense no longer exists', 'error'));
      }
    }

    if (paymentId) {
      setActiveTab('balances');
      const payment = payments.find(p => String(p.id) === paymentId);
      if (payment) {
        setViewingPayment(payment);
      } else {
        paymentsApi.getPayment(groupId, paymentId, { includeDeleted: true })
          .then(d => setViewingPayment(d.payment))
          .catch(() => showToast('That payment no longer exists', 'error'));
      }
    }
  }, [searchParams, loading, expenses, payments]);

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
      setViewingExpense(null);
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
      showToast('Expense deleted', 'success', { label: 'Undo', onClick: () => handleRestoreExpense(expenseId) });
      setViewingExpense(null);
      fetchAll();
    } catch (err) {
      showToast('Failed to delete expense', 'error');
    }
  };

  const handleRestoreExpense = async (expenseId) => {
    try {
      await expensesApi.restoreExpense(groupId, expenseId);
      showToast('Expense restored', 'success');
      setViewingExpense(null);
      fetchAll();
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to restore expense', 'error');
    }
  };

  const handleUpdatePayment = async (paymentId, data) => {
    try {
      const { payment } = await paymentsApi.updatePayment(groupId, paymentId, data);
      showToast('Payment updated', 'success');
      setViewingPayment(payment);
      fetchAll();
      return true;
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to update payment', 'error');
      return false;
    }
  };

  const handleDeletePayment = async (paymentId) => {
    if (!confirm('Delete this payment?')) return;
    try {
      await paymentsApi.deletePayment(groupId, paymentId);
      showToast('Payment deleted', 'success', { label: 'Undo', onClick: () => handleRestorePayment(paymentId) });
      setViewingPayment(null);
      fetchAll();
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to delete payment', 'error');
    }
  };

  const handleRestorePayment = async (paymentId) => {
    try {
      await paymentsApi.restorePayment(groupId, paymentId);
      showToast('Payment restored', 'success');
      setViewingPayment(null);
      fetchAll();
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to restore payment', 'error');
    }
  };

  const handleSettleUp = async (amount) => {
    try {
      await paymentsApi.recordPayment(groupId, {
        payer_id: showSettleUp.from_user,
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

  const handleDeleteTrip = async (trip) => {
    if (!confirm(`Delete the trip "${trip.name}"?`)) return;
    try {
      await tripsApi.deleteTrip(groupId, trip.id);
      showToast('Trip deleted', 'success');
      fetchAll();
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to delete trip', 'error');
    }
  };

  const handleLeaveGroup = async () => {
    if (!confirm('Leave this group?')) return;
    try {
      await groupsApi.removeMember(groupId, user.id);
      showToast('Left group', 'success');
      navigate('/');
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to leave group', 'error');
    }
  };

  // A set of expenses is settled once every one of them was covered by a
  // full group settle-up (the server flags each expense with is_settled)
  const isExpensesSettled = (expenseList) =>
    Boolean(expenseList && expenseList.length > 0 && expenseList.every(e => e.is_settled));

  const inviteUrl = inviteLink ? `${window.location.origin}/invite/${inviteLink}` : '';

  if (loading) {
    return <div className={styles.loading}><div className={styles.spinner} /></div>;
  }

  if (!group) {
    return <div className={styles.notFound}>Group not found</div>;
  }

  // Split trips into active and settled for Trips tab
  const nonTripExpenses = expenses.filter(e => !e.trip_id);
  const activeTrips = [];
  const settledTrips = [];
  for (const trip of trips) {
    const tripExps = expenses.filter(e => e.trip_id === trip.id);
    if (tripExps.length > 0 && isExpensesSettled(tripExps)) {
      settledTrips.push(trip);
    } else {
      activeTrips.push(trip);
    }
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
        {['trips', 'expenses', 'balances', 'activity'].map(tab => (
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
              <ExpensesByMonth
                expenses={expenses}
                trips={trips}
                onView={setViewingExpense}
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
              pairExpenses={balances?.pairExpenses}
              memberExpenses={balances?.memberExpenses}
              isSimplified={Boolean(group.simplify_debts)}
            />
            <PaymentHistory payments={payments} userId={user.id} onView={setViewingPayment} />
          </div>
        )}

        {activeTab === 'trips' && (
          <div className={styles.tripsSection}>
            <button className={styles.addTripBtn} onClick={() => setShowAddTrip(true)}>
              + Create Trip
            </button>

            {/* Active Trips */}
            {activeTrips.length > 0 && (
              <div className={styles.tripList}>
                {activeTrips.map(trip => {
                  const tripExpenses = expenses.filter(e => e.trip_id === trip.id);
                  return (
                    <TripAccordion
                      key={trip.id}
                      trip={trip}
                      tripExpenses={tripExpenses}
                      onView={setViewingExpense}
                      groupId={groupId}
                      onAddExpense={() => setShowAddExpense(true)}
                      onDelete={() => handleDeleteTrip(trip)}
                      settled={false}
                    />
                  );
                })}
              </div>
            )}

            {/* Non-trip expenses grouped by month */}
            <NonTripAccordion
              expenses={nonTripExpenses}
              onView={setViewingExpense}
              allSettled={isExpensesSettled(nonTripExpenses)}
            />

            {/* Settled Trips */}
            {settledTrips.length > 0 && (
              <>
                <div className={styles.settledDivider}>
                  <span>Settled</span>
                </div>
                <div className={styles.tripList}>
                  {settledTrips.map(trip => {
                    const tripExpenses = expenses.filter(e => e.trip_id === trip.id);
                    return (
                      <TripAccordion
                        key={trip.id}
                        trip={trip}
                        tripExpenses={tripExpenses}
                        onView={setViewingExpense}
                        groupId={groupId}
                        onAddExpense={() => setShowAddExpense(true)}
                        settled={true}
                      />
                    );
                  })}
                </div>
              </>
            )}

            {activeTrips.length === 0 && settledTrips.length === 0 && nonTripExpenses.length === 0 && (
              <div className={styles.empty}><p>No trips yet</p></div>
            )}
          </div>
        )}

        {activeTab === 'activity' && (
          <ActivityFeed activities={activity} />
        )}
      </div>

      {/* Expense Detail Modal */}
      <Modal isOpen={Boolean(viewingExpense)} onClose={() => setViewingExpense(null)} title="Expense Details" size="medium">
        {viewingExpense && (
          <ExpenseDetail
            expense={viewingExpense}
            members={members}
            trips={trips}
            onEdit={() => {
              const exp = viewingExpense;
              setViewingExpense(null);
              setEditingExpense(exp);
            }}
            onDelete={() => handleDeleteExpense(viewingExpense.id)}
            onRestore={() => handleRestoreExpense(viewingExpense.id)}
          />
        )}
      </Modal>

      {/* Payment Detail Modal */}
      <Modal isOpen={Boolean(viewingPayment)} onClose={() => setViewingPayment(null)} title="Payment Details" size="small">
        {viewingPayment && (
          <PaymentDetail
            key={viewingPayment.id}
            payment={viewingPayment}
            members={members}
            onSave={(data) => handleUpdatePayment(viewingPayment.id, data)}
            onDelete={() => handleDeletePayment(viewingPayment.id)}
            onRestore={() => handleRestorePayment(viewingPayment.id)}
          />
        )}
      </Modal>

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
            userId={user.id}
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
              showToast(err.response?.data?.error || 'Failed to remove member', 'error');
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

/* ─── Expense Detail View ─── */
function ExpenseDetail({ expense, members, trips, onEdit, onDelete, onRestore }) {
  const cat = getCategoryByKey(expense.category);
  const trip = trips.find(t => t.id === expense.trip_id);
  const splitType = SPLIT_TYPES.find(s => s.key === expense.split_type) || { label: 'Equal' };

  return (
    <div className={styles.expenseDetail}>
      {Boolean(expense.is_deleted) && (
        <div className={styles.deletedBanner}>This expense was deleted. Restore it to count it again.</div>
      )}
      <div className={styles.detailHeader}>
        <span className={styles.detailCatIcon}>{cat.emoji}</span>
        <div>
          <h3 className={styles.detailTitle}>
            {expense.description}
            {expense.is_settled && <span className={styles.settledBadge}>Settled</span>}
          </h3>
          <span className={styles.detailCategory}>{cat.label}</span>
        </div>
        <span className={styles.detailAmount}>{formatCurrency(expense.amount)}</span>
      </div>

      <div className={styles.detailMeta}>
        <div className={styles.detailRow}>
          <span className={styles.detailLabel}>Date</span>
          <span>{formatDate(expense.date)}</span>
        </div>
        {trip && (
          <div className={styles.detailRow}>
            <span className={styles.detailLabel}>Trip</span>
            <span>{trip.name}</span>
          </div>
        )}
        <div className={styles.detailRow}>
          <span className={styles.detailLabel}>Split method</span>
          <span>{splitType.label}</span>
        </div>
      </div>

      {/* Paid by */}
      <div className={styles.detailSection}>
        <h4 className={styles.detailSectionTitle}>Paid by</h4>
        {(expense.payers || []).map(p => (
          <div key={p.user_id} className={styles.detailMemberRow}>
            <Avatar name={p.user_name} size="small" />
            <span className={styles.detailMemberName}>{p.user_name}</span>
            <span className={styles.detailMemberAmount}>{formatCurrency(p.amount)}</span>
          </div>
        ))}
      </div>

      {/* Split between */}
      <div className={styles.detailSection}>
        <h4 className={styles.detailSectionTitle}>Split between</h4>
        {(expense.splits || []).map(s => (
          <div key={s.user_id} className={styles.detailMemberRow}>
            <Avatar name={s.user_name} size="small" />
            <span className={styles.detailMemberName}>{s.user_name}</span>
            <span className={styles.detailMemberAmount}>{formatCurrency(s.amount)}</span>
          </div>
        ))}
      </div>

      {/* Actions */}
      {expense.is_deleted ? (
        <div className={styles.detailActions}>
          <button className={styles.detailEditBtn} onClick={onRestore}>Restore expense</button>
        </div>
      ) : (
        <div className={styles.detailActions}>
          <button className={styles.detailEditBtn} onClick={onEdit}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            Edit
          </button>
          <button className={styles.detailDeleteBtn} onClick={onDelete}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3,6 5,6 21,6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
            Delete
          </button>
        </div>
      )}
    </div>
  );
}

/* ─── Payment history (Balances tab) ─── */
function PaymentHistory({ payments, userId, onView }) {
  if (!payments || payments.length === 0) return null;
  const nameOf = (id, name) => (id === userId ? 'You' : name);

  return (
    <div className={styles.paymentHistory}>
      <h3 className={styles.paymentHistoryTitle}>Payment history</h3>
      {payments.map(p => (
        <div
          key={p.id}
          className={styles.expenseItem}
          onClick={() => onView(p)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onView(p); }}
        >
          <span className={styles.expenseCat}>{'\uD83D\uDCB0'}</span>
          <div className={styles.expenseInfo}>
            <span className={styles.expenseDesc}>
              {nameOf(p.payer_id, p.payer_name)} paid {nameOf(p.payee_id, p.payee_name)}
            </span>
            <span className={styles.expenseMeta}>
              {formatDate(p.created_at)}{p.note ? ` \u00B7 ${p.note}` : ''}
            </span>
          </div>
          <div className={styles.expenseRight}>
            <span className={styles.expenseAmount}>{formatCurrency(p.amount)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ─── Payment detail: view, edit, delete or restore ─── */
function PaymentDetail({ payment, members, onSave, onDelete, onRestore }) {
  const [editing, setEditing] = useState(false);
  const [payerId, setPayerId] = useState(payment.payer_id);
  const [payeeId, setPayeeId] = useState(payment.payee_id);
  const [amount, setAmount] = useState(centsToDollars(payment.amount));
  const [note, setNote] = useState(payment.note || '');
  const [saving, setSaving] = useState(false);

  const handleSave = async (e) => {
    e.preventDefault();
    const cents = Math.round(parseFloat(amount) * 100);
    if (!(cents > 0)) return;
    setSaving(true);
    const ok = await onSave({ payer_id: Number(payerId), payee_id: Number(payeeId), amount: cents, note });
    setSaving(false);
    if (ok) setEditing(false);
  };

  if (editing) {
    return (
      <form onSubmit={handleSave}>
        <div style={{ marginBottom: 12 }}>
          <label className={styles.formLabel}>Who paid</label>
          <select className={styles.formInput} value={payerId} onChange={e => setPayerId(e.target.value)}>
            {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </div>
        <div style={{ marginBottom: 12 }}>
          <label className={styles.formLabel}>Paid to</label>
          <select className={styles.formInput} value={payeeId} onChange={e => setPayeeId(e.target.value)}>
            {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </div>
        <div style={{ marginBottom: 12 }}>
          <label className={styles.formLabel}>Amount ($)</label>
          <input className={styles.formInput} type="number" step="0.01" min="0.01"
            value={amount} onChange={e => setAmount(e.target.value)} />
        </div>
        <div style={{ marginBottom: 16 }}>
          <label className={styles.formLabel}>Note</label>
          <input className={styles.formInput} type="text" maxLength={200}
            value={note} onChange={e => setNote(e.target.value)} placeholder="Optional" />
        </div>
        <div className={styles.detailActions}>
          <button type="button" className={styles.detailDeleteBtn} onClick={() => setEditing(false)}>Cancel</button>
          <button type="submit" className={styles.detailEditBtn} disabled={saving || String(payerId) === String(payeeId)}>
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className={styles.expenseDetail}>
      {Boolean(payment.is_deleted) && (
        <div className={styles.deletedBanner}>This payment was deleted. Restore it to count it again.</div>
      )}
      <div className={styles.detailHeader}>
        <span className={styles.detailCatIcon}>{'\uD83D\uDCB0'}</span>
        <div>
          <h3 className={styles.detailTitle}>{payment.payer_name} paid {payment.payee_name}</h3>
          <span className={styles.detailCategory}>{formatDate(payment.created_at)}</span>
        </div>
        <span className={styles.detailAmount}>{formatCurrency(payment.amount)}</span>
      </div>
      <div className={styles.detailMeta}>
        {payment.note && (
          <div className={styles.detailRow}>
            <span className={styles.detailLabel}>Note</span>
            <span>{payment.note}</span>
          </div>
        )}
        {payment.recorded_by_name && (
          <div className={styles.detailRow}>
            <span className={styles.detailLabel}>Recorded by</span>
            <span>{payment.recorded_by_name}</span>
          </div>
        )}
      </div>
      <div className={styles.detailActions}>
        {payment.is_deleted ? (
          <button className={styles.detailEditBtn} onClick={onRestore}>Restore payment</button>
        ) : (
          <>
            <button className={styles.detailEditBtn} onClick={() => setEditing(true)}>Edit</button>
            <button className={styles.detailDeleteBtn} onClick={onDelete}>Delete</button>
          </>
        )}
      </div>
    </div>
  );
}

/* ─── Non-Trip Expenses Accordion (grouped by month) ─── */
function NonTripAccordion({ expenses, onView, allSettled }) {
  const [expanded, setExpanded] = useState(false);

  if (!expenses || expenses.length === 0) return null;

  // Group expenses by month
  const monthGroups = {};
  for (const exp of expenses) {
    const key = monthKeyOf(exp.date);
    if (!monthGroups[key]) monthGroups[key] = [];
    monthGroups[key].push(exp);
  }

  // Sort months descending
  const sortedMonths = Object.keys(monthGroups).sort((a, b) => b.localeCompare(a));

  const total = expenses.reduce((s, e) => s + e.amount, 0);

  return (
    <div className={`${styles.tripAccordion} ${allSettled ? styles.settledAccordion : ''}`}>
      <button
        className={styles.tripAccordionHeader}
        onClick={() => setExpanded(!expanded)}
        type="button"
      >
        <div className={styles.tripInfo}>
          <span className={styles.tripName}>
            Others - non trip expenses
            {allSettled && <span className={styles.settledBadge}>Settled</span>}
          </span>
          <span className={styles.tripMeta}>
            {expenses.length} expense{expenses.length !== 1 ? 's' : ''} &middot; {formatCurrency(total)}
          </span>
        </div>
        <svg
          width="16" height="16" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2"
          className={`${styles.tripChevron} ${expanded ? styles.tripChevronOpen : ''}`}
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {expanded && (
        <div className={styles.tripAccordionBody}>
          {sortedMonths.map(monthKey => {
            const monthExps = monthGroups[monthKey];
            const monthTotal = monthExps.reduce((s, e) => s + e.amount, 0);
            const monthLabel = monthLabelOf(monthKey);

            return (
              <div key={monthKey} className={styles.monthGroup}>
                <div className={styles.monthHeader}>
                  <span>{monthLabel}</span>
                  <span className={styles.monthTotal}>{formatCurrency(monthTotal)}</span>
                </div>
                {monthExps.map(expense => (
                  <ExpenseRow
                    key={expense.id}
                    expense={expense}
                    onView={onView}
                    settled={expense.is_settled}
                  />
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ─── Settle Up Form ─── */
function SettleUpForm({ debt, userId, onSubmit, onCancel }) {
  const [amount, setAmount] = useState(centsToDollars(debt.amount));

  const handleSubmit = (e) => {
    e.preventDefault();
    const cents = Math.round(parseFloat(amount) * 100);
    if (cents > 0) onSubmit(cents);
  };

  return (
    <form onSubmit={handleSubmit}>
      <p style={{ marginBottom: 16, fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
        {debt.from_user === userId ? (
          <>You pay <strong>{debt.to_user_name}</strong></>
        ) : debt.to_user === userId ? (
          <><strong>{debt.from_user_name}</strong> pays you</>
        ) : (
          <><strong>{debt.from_user_name}</strong> pays <strong>{debt.to_user_name}</strong></>
        )}
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

function TripAccordion({ trip, tripExpenses, onView, groupId, onAddExpense, onDelete, settled }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={`${styles.tripAccordion} ${settled ? styles.settledAccordion : ''}`}>
      <button
        className={styles.tripAccordionHeader}
        onClick={() => setExpanded(!expanded)}
        type="button"
      >
        <div className={styles.tripInfo}>
          <span className={styles.tripName}>
            {trip.name}
            {settled && <span className={styles.settledBadge}>Settled</span>}
          </span>
          <span className={styles.tripMeta}>
            {tripExpenses.length} expense{tripExpenses.length !== 1 ? 's' : ''} &middot; {formatCurrency(trip.total_amount)}
          </span>
        </div>
        <svg
          width="16" height="16" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2"
          className={`${styles.tripChevron} ${expanded ? styles.tripChevronOpen : ''}`}
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {expanded && (
        <div className={styles.tripAccordionBody}>
          {tripExpenses.length === 0 ? (
            <div className={styles.tripEmptyExpenses}>
              <p>No expenses in this trip</p>
              <div className={styles.tripEmptyActions}>
                <button className={styles.addFirstBtn} onClick={onAddExpense}>
                  Add expense
                </button>
                {/* Only empty trips can be deleted (the server enforces this too) */}
                {onDelete && (
                  <button className={styles.deleteTripBtn} onClick={onDelete}>
                    Delete trip
                  </button>
                )}
              </div>
            </div>
          ) : (
            tripExpenses.map(expense => (
              <ExpenseRow key={expense.id} expense={expense} onView={onView} settled={expense.is_settled} />
            ))
          )}
        </div>
      )}
    </div>
  );
}

function monthKeyOf(dateStr) {
  const d = dateStr ? new Date(String(dateStr).split('T')[0]) : null;
  return d && !isNaN(d) ? `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}` : 'Unknown';
}

function monthLabelOf(monthKey) {
  if (monthKey === 'Unknown') return monthKey;
  const [y, m] = monthKey.split('-');
  return new Date(Number(y), Number(m) - 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

/* ─── All expenses, latest to oldest, under month headers ─── */
function ExpensesByMonth({ expenses, trips, onView }) {
  const tripMap = {};
  for (const t of trips) tripMap[t.id] = t.name;

  // Expenses arrive sorted latest-first from the server; keep that order
  const months = [];
  const byMonth = {};
  for (const expense of expenses) {
    const key = monthKeyOf(expense.date);
    if (!byMonth[key]) {
      byMonth[key] = [];
      months.push(key);
    }
    byMonth[key].push(expense);
  }

  return months.map(key => (
    <div key={key} className={styles.monthGroup}>
      <div className={styles.monthHeader}>
        <span>{monthLabelOf(key)}</span>
        <span className={styles.monthTotal}>
          {formatCurrency(byMonth[key].reduce((s, e) => s + e.amount, 0))}
        </span>
      </div>
      {byMonth[key].map(expense => (
        <ExpenseRow
          key={expense.id}
          expense={expense}
          onView={onView}
          settled={expense.is_settled}
          tripName={tripMap[expense.trip_id]}
        />
      ))}
    </div>
  ));
}

function ExpenseRow({ expense, onView, settled, tripName }) {
  const cat = getCategoryByKey(expense.category);
  return (
    <div
      className={`${styles.expenseItem} ${settled ? styles.settledExpense : ''}`}
      onClick={() => onView(expense)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onView(expense); }}
    >
      <span className={styles.expenseCat}>{cat.emoji}</span>
      <div className={styles.expenseInfo}>
        <span className={styles.expenseDesc}>{expense.description}</span>
        <span className={styles.expenseMeta}>
          {formatDate(expense.date)} &middot; Paid by {expense.payers.map(p => p.user_name).join(', ')}
          {tripName && <> &middot; {tripName}</>}
        </span>
      </div>
      <div className={styles.expenseRight}>
        <span className={styles.expenseAmount}>{formatCurrency(expense.amount)}</span>
        {settled && <span className={styles.settledLabel}>settled</span>}
      </div>
    </div>
  );
}
