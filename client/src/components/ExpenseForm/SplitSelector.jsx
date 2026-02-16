import { SPLIT_TYPES } from '../../utils/constants';
import { formatCurrency } from '../../utils/formatters';
import { useAuth } from '../../contexts/AuthContext';
import styles from './SplitSelector.module.css';

export default function SplitSelector({
  members, splits, onChange, splitType, onSplitTypeChange, totalAmount,
}) {
  const { user } = useAuth();

  const handleToggleMember = (userId) => {
    const updated = splits.map(s =>
      s.user_id === userId ? { ...s, included: !s.included } : s
    );
    onChange(updated);
  };

  const handleShareValueChange = (userId, value) => {
    const updated = splits.map(s =>
      s.user_id === userId ? { ...s, share_value: value ? Number(value) : null, included: true } : s
    );
    onChange(updated);
  };

  const includedCount = splits.filter(s => s.included !== false).length;

  const getSplitSummary = () => {
    if (!totalAmount || totalAmount <= 0) return '';
    switch (splitType) {
      case 'equal': {
        if (includedCount === 0) return '';
        const each = totalAmount / includedCount;
        return `${formatCurrency(Math.round(each))}/person`;
      }
      case 'exact': {
        const sum = splits
          .filter(s => s.included !== false && s.share_value)
          .reduce((s, p) => s + Math.round(p.share_value * 100), 0);
        const remaining = totalAmount - sum;
        return remaining === 0
          ? 'Fully allocated'
          : `${formatCurrency(Math.abs(remaining))} ${remaining > 0 ? 'remaining' : 'over'}`;
      }
      case 'percentage': {
        const sum = splits
          .filter(s => s.included !== false && s.share_value)
          .reduce((s, p) => s + p.share_value, 0);
        return `${sum}% of 100%`;
      }
      case 'shares': {
        const sum = splits
          .filter(s => s.included !== false && s.share_value)
          .reduce((s, p) => s + p.share_value, 0);
        return `${sum} total shares`;
      }
      default:
        return '';
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.tabs}>
        {SPLIT_TYPES.map(st => (
          <button
            key={st.key}
            type="button"
            className={`${styles.tab} ${splitType === st.key ? styles.activeTab : ''}`}
            onClick={() => onSplitTypeChange(st.key)}
          >
            {st.label}
          </button>
        ))}
      </div>

      <div className={styles.summary}>{getSplitSummary()}</div>

      <div className={styles.memberList}>
        {members.map(m => {
          const split = splits.find(s => s.user_id === m.id);
          const included = split?.included !== false;
          const memberName = m.id === user?.id ? `${m.name} (you)` : m.is_placeholder ? `${m.name} (pending)` : m.name;

          return (
            <div key={m.id} className={styles.memberRow}>
              {splitType === 'equal' ? (
                <label className={styles.checkLabel}>
                  <input
                    type="checkbox"
                    checked={included}
                    onChange={() => handleToggleMember(m.id)}
                  />
                  <span>{memberName}</span>
                </label>
              ) : (
                <span className={styles.memberName}>{memberName}</span>
              )}

              {splitType === 'equal' && included && totalAmount > 0 && (
                <span className={styles.splitAmount}>
                  {formatCurrency(Math.round(totalAmount / includedCount))}
                </span>
              )}

              {splitType === 'exact' && (
                <div className={styles.inputWrap}>
                  <span className={styles.prefix}>$</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    className={styles.valueInput}
                    value={split?.share_value || ''}
                    onChange={e => handleShareValueChange(m.id, e.target.value)}
                  />
                </div>
              )}

              {splitType === 'percentage' && (
                <div className={styles.inputWrap}>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    placeholder="0"
                    className={styles.valueInput}
                    value={split?.share_value || ''}
                    onChange={e => handleShareValueChange(m.id, e.target.value)}
                  />
                  <span className={styles.suffix}>%</span>
                </div>
              )}

              {splitType === 'shares' && (
                <div className={styles.inputWrap}>
                  <input
                    type="number"
                    step="1"
                    min="0"
                    placeholder="1"
                    className={styles.valueInput}
                    value={split?.share_value || ''}
                    onChange={e => handleShareValueChange(m.id, e.target.value)}
                  />
                  <span className={styles.suffix}>shares</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
