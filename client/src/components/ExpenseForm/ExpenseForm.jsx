import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { CATEGORIES, SPLIT_TYPES } from '../../utils/constants';
import { centsToDollars, dollarsToCents } from '../../utils/formatters';
import SplitSelector from './SplitSelector';
import PayerSelector from './PayerSelector';
import styles from './ExpenseForm.module.css';

export default function ExpenseForm({ members, trips, expense, onSubmit, onCancel, loading, defaultTripId }) {
  const { user } = useAuth();

  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('other');
  const [splitType, setSplitType] = useState('equal');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [tripId, setTripId] = useState(defaultTripId || null);
  const [payers, setPayers] = useState([]);
  const [splits, setSplits] = useState([]);

  // Initialize from existing expense (edit mode)
  useEffect(() => {
    if (expense) {
      setDescription(expense.description);
      setAmount(centsToDollars(expense.amount));
      setCategory(expense.category);
      setSplitType(expense.split_type);
      setDate(expense.date);
      setTripId(expense.trip_id);
      setPayers(expense.payers.map(p => ({ user_id: p.user_id, amount: centsToDollars(p.amount) })));
      setSplits(expense.splits.map(s => ({
        user_id: s.user_id,
        share_value: s.share_value,
        included: true,
      })));
    } else {
      // Defaults for new expense — no members pre-selected for split
      setPayers([{ user_id: user.id, amount: '' }]);
      setSplits(members.map(m => ({ user_id: m.id, share_value: null, included: false })));
    }
  }, [expense, members, user]);

  const amountCents = dollarsToCents(amount);

  const includedSplitCount = splits.filter(s => s.included !== false).length;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!description.trim() || !amountCents || amountCents <= 0) return;
    if (includedSplitCount === 0) return;

    // Build payers array (convert to cents)
    const payerData = payers
      .filter(p => p.amount && parseFloat(p.amount) > 0)
      .map(p => ({
        user_id: p.user_id,
        amount: dollarsToCents(p.amount),
      }));

    // If single payer with no explicit amount, set to full amount
    if (payerData.length === 1 && !payerData[0].amount) {
      payerData[0].amount = amountCents;
    }
    if (payerData.length === 0) {
      payerData.push({ user_id: user.id, amount: amountCents });
    }

    // Build splits array
    const splitData = splits
      .filter(s => s.included !== false)
      .map(s => ({
        user_id: s.user_id,
        share_value: s.share_value,
      }));

    onSubmit({
      description: description.trim(),
      amount: amountCents,
      category,
      split_type: splitType,
      date,
      trip_id: tripId || null,
      payers: payerData,
      splits: splitData,
    });
  };

  const memberMap = {};
  members.forEach(m => { memberMap[m.id] = m; });

  return (
    <form onSubmit={handleSubmit} className={styles.form}>
      <div className={styles.row}>
        <div className={styles.field}>
          <label className={styles.label}>Description</label>
          <input
            className={styles.input}
            type="text"
            placeholder="What was this expense for?"
            value={description}
            onChange={e => setDescription(e.target.value)}
            required
            autoFocus
            maxLength={200}
          />
        </div>
        <div className={styles.fieldSmall}>
          <label className={styles.label}>Amount ($)</label>
          <input
            className={styles.input}
            type="number"
            step="0.01"
            min="0.01"
            placeholder="0.00"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            required
          />
        </div>
      </div>

      <div className={styles.row}>
        <div className={styles.field}>
          <label className={styles.label}>Category</label>
          <select
            className={styles.select}
            value={category}
            onChange={e => setCategory(e.target.value)}
          >
            {CATEGORIES.map(c => (
              <option key={c.key} value={c.key}>{c.emoji} {c.label}</option>
            ))}
          </select>
        </div>
        <div className={styles.field}>
          <label className={styles.label}>Date</label>
          <input
            className={styles.input}
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
          />
        </div>
      </div>

      {trips && trips.length > 0 && (
        <div className={styles.field}>
          <label className={styles.label}>Trip (optional)</label>
          <select
            className={styles.select}
            value={tripId || ''}
            onChange={e => setTripId(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">No trip</option>
            {trips.map(t => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>
      )}

      <div className={styles.field}>
        <label className={styles.label}>Paid by</label>
        <PayerSelector
          members={members}
          payers={payers}
          onChange={setPayers}
          totalAmount={amount}
          currentUserId={user.id}
        />
      </div>

      <div className={styles.field}>
        <label className={styles.label}>Split</label>
        <SplitSelector
          members={members}
          splits={splits}
          onChange={setSplits}
          splitType={splitType}
          onSplitTypeChange={setSplitType}
          totalAmount={amountCents}
        />
      </div>

      <div className={styles.actions}>
        <button type="button" className={styles.cancelBtn} onClick={onCancel}>
          Cancel
        </button>
        <button
          type="submit"
          className={styles.submitBtn}
          disabled={loading || !description.trim() || !amountCents || includedSplitCount === 0}
        >
          {loading ? 'Saving...' : expense ? 'Update Expense' : 'Add Expense'}
        </button>
      </div>
    </form>
  );
}
