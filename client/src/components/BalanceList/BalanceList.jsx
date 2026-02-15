import { useAuth } from '../../contexts/AuthContext';
import Avatar from '../Avatar/Avatar';
import { formatCurrency } from '../../utils/formatters';
import styles from './BalanceList.module.css';

export default function BalanceList({ balances, onSettleUp }) {
  const { user } = useAuth();

  if (!balances || balances.length === 0) {
    return (
      <div className={styles.settled}>
        <span className={styles.settledIcon}>\u2713</span>
        <p>All settled up!</p>
      </div>
    );
  }

  return (
    <div className={styles.list}>
      {balances.map((debt, i) => {
        const isYouOwe = debt.from_user === user?.id;
        const isOwedToYou = debt.to_user === user?.id;

        return (
          <div key={i} className={styles.item}>
            <div className={styles.people}>
              <Avatar name={debt.from_user_name} size="small" />
              <div className={styles.arrow}>
                <span className={styles.fromName}>
                  {isYouOwe ? 'You' : debt.from_user_name}
                </span>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-tertiary)" strokeWidth="2">
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
                <span className={styles.toName}>
                  {isOwedToYou ? 'You' : debt.to_user_name}
                </span>
              </div>
              <Avatar name={debt.to_user_name} size="small" />
            </div>
            <div className={styles.right}>
              <span className={`${styles.amount} ${isYouOwe ? styles.negative : ''} ${isOwedToYou ? styles.positive : ''}`}>
                {formatCurrency(debt.amount)}
              </span>
              {isYouOwe && onSettleUp && (
                <button
                  className={styles.settleBtn}
                  onClick={() => onSettleUp(debt)}
                >
                  Settle up
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
