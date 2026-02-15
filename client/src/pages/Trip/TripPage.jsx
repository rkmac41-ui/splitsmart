import { useState, useEffect, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useToast } from '../../contexts/ToastContext';
import * as tripsApi from '../../api/trips';
import * as expensesApi from '../../api/expenses';
import * as groupsApi from '../../api/groups';
import Modal from '../../components/Modal/Modal';
import ExpenseForm from '../../components/ExpenseForm/ExpenseForm';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { getCategoryByKey } from '../../utils/constants';
import styles from './TripPage.module.css';

export default function TripPage() {
  const { groupId, tripId } = useParams();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [trip, setTrip] = useState(null);
  const [expenses, setExpenses] = useState([]);
  const [members, setMembers] = useState([]);
  const [trips, setTrips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddExpense, setShowAddExpense] = useState(false);
  const [expenseLoading, setExpenseLoading] = useState(false);

  const fetchAll = useCallback(async () => {
    try {
      const [tData, eData, mData, trData] = await Promise.all([
        tripsApi.getTrip(groupId, tripId),
        expensesApi.getExpenses(groupId, tripId),
        groupsApi.getGroupMembers(groupId),
        tripsApi.getTrips(groupId),
      ]);
      setTrip(tData.trip);
      setExpenses(eData.expenses);
      setMembers(mData.members);
      setTrips(trData.trips);
    } catch (err) {
      showToast('Failed to load trip', 'error');
    } finally {
      setLoading(false);
    }
  }, [groupId, tripId, showToast]);

  useEffect(() => {
    setLoading(true);
    fetchAll();
  }, [fetchAll]);

  const handleAddExpense = async (data) => {
    setExpenseLoading(true);
    try {
      await expensesApi.createExpense(groupId, { ...data, trip_id: Number(tripId) });
      showToast('Expense added', 'success');
      setShowAddExpense(false);
      fetchAll();
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to add expense', 'error');
    } finally {
      setExpenseLoading(false);
    }
  };

  const handleDeleteTrip = async () => {
    if (!confirm('Delete this trip? Expenses will remain in the group.')) return;
    try {
      await tripsApi.deleteTrip(groupId, tripId);
      showToast('Trip deleted', 'success');
      navigate(`/groups/${groupId}`);
    } catch (err) {
      showToast('Failed to delete trip', 'error');
    }
  };

  if (loading) {
    return <div className={styles.loading}><div className={styles.spinner} /></div>;
  }

  if (!trip) {
    return <div className={styles.notFound}>Trip not found</div>;
  }

  return (
    <div className={styles.page}>
      <Link to={`/groups/${groupId}`} className={styles.backLink}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M19 12H5M12 19l-7-7 7-7" />
        </svg>
        Back to group
      </Link>

      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>{trip.name}</h1>
          <span className={styles.meta}>
            {trip.expense_count} expenses &middot; {formatCurrency(trip.total_amount)} total
          </span>
        </div>
        <div className={styles.actions}>
          <button className={styles.deleteBtn} onClick={handleDeleteTrip}>Delete Trip</button>
          <button className={styles.addBtn} onClick={() => setShowAddExpense(true)}>+ Add Expense</button>
        </div>
      </div>

      <div className={styles.expenseList}>
        {expenses.length === 0 ? (
          <div className={styles.empty}>
            <p>No expenses in this trip yet</p>
            <button className={styles.addBtn} onClick={() => setShowAddExpense(true)}>
              Add first expense
            </button>
          </div>
        ) : (
          expenses.map(expense => {
            const cat = getCategoryByKey(expense.category);
            return (
              <div key={expense.id} className={styles.expenseItem}>
                <span className={styles.expenseCat}>{cat.emoji}</span>
                <div className={styles.expenseInfo}>
                  <span className={styles.expenseDesc}>{expense.description}</span>
                  <span className={styles.expenseMeta}>
                    {formatDate(expense.date)} &middot; Paid by {expense.payers.map(p => p.user_name).join(', ')}
                  </span>
                </div>
                <span className={styles.expenseAmount}>{formatCurrency(expense.amount)}</span>
              </div>
            );
          })
        )}
      </div>

      <Modal isOpen={showAddExpense} onClose={() => setShowAddExpense(false)} title="Add Expense to Trip" size="large">
        <ExpenseForm
          members={members}
          trips={trips}
          onSubmit={handleAddExpense}
          onCancel={() => setShowAddExpense(false)}
          loading={expenseLoading}
        />
      </Modal>
    </div>
  );
}
