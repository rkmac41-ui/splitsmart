import { useState } from 'react';
import styles from './PayerSelector.module.css';

export default function PayerSelector({ members, payers, onChange, totalAmount, currentUserId }) {
  const [multiPayer, setMultiPayer] = useState(payers.length > 1);

  const handleSinglePayerChange = (userId) => {
    onChange([{ user_id: userId, amount: totalAmount || '' }]);
  };

  const toggleMultiPayer = () => {
    if (multiPayer) {
      // Switch back to single payer
      onChange([{ user_id: currentUserId, amount: totalAmount || '' }]);
      setMultiPayer(false);
    } else {
      // Switch to multi payer
      setMultiPayer(true);
    }
  };

  const handleMultiPayerAmount = (userId, amount) => {
    const updated = payers.map(p =>
      p.user_id === userId ? { ...p, amount } : p
    );
    if (!updated.find(p => p.user_id === userId)) {
      updated.push({ user_id: userId, amount });
    }
    onChange(updated);
  };

  const togglePayerIncluded = (userId) => {
    const existing = payers.find(p => p.user_id === userId);
    if (existing) {
      onChange(payers.filter(p => p.user_id !== userId));
    } else {
      onChange([...payers, { user_id: userId, amount: '' }]);
    }
  };

  if (!multiPayer) {
    return (
      <div className={styles.container}>
        <select
          className={styles.select}
          value={payers[0]?.user_id || currentUserId}
          onChange={e => handleSinglePayerChange(Number(e.target.value))}
        >
          {members.map(m => (
            <option key={m.id} value={m.id}>
              {m.id === currentUserId ? `${m.name} (you)` : m.is_placeholder ? `${m.name} (pending)` : m.name}
            </option>
          ))}
        </select>
        <button type="button" className={styles.toggleBtn} onClick={toggleMultiPayer}>
          Multiple payers
        </button>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.multiList}>
        {members.map(m => {
          const payer = payers.find(p => p.user_id === m.id);
          const included = Boolean(payer);

          return (
            <div key={m.id} className={styles.multiRow}>
              <label className={styles.checkLabel}>
                <input
                  type="checkbox"
                  checked={included}
                  onChange={() => togglePayerIncluded(m.id)}
                />
                <span>{m.id === currentUserId ? `${m.name} (you)` : m.is_placeholder ? `${m.name} (pending)` : m.name}</span>
              </label>
              {included && (
                <div className={styles.amountWrap}>
                  <span className={styles.dollar}>$</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    className={styles.amountInput}
                    value={payer.amount}
                    onChange={e => handleMultiPayerAmount(m.id, e.target.value)}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
      <button type="button" className={styles.toggleBtn} onClick={toggleMultiPayer}>
        Single payer
      </button>
    </div>
  );
}
