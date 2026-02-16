import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import Avatar from '../Avatar/Avatar';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { getCategoryByKey } from '../../utils/constants';
import styles from './BalanceList.module.css';

export default function BalanceList({ balances, memberBalances, onSettleUp, detailedMembers }) {
  const { user } = useAuth();

  if (!balances || balances.length === 0) {
    return (
      <div className={styles.settled}>
        <span className={styles.settledIcon}>{'\u2713'}</span>
        <p>All settled up!</p>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {/* Pairwise debts */}
      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>Who owes whom</h3>
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
                  {isYouOwe && onSettleUp && debt.to_user > 0 && debt.from_user > 0 && (
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
      </div>

      {/* Detailed per-member breakdown */}
      {detailedMembers && detailedMembers.length > 0 && (
        <div className={styles.section}>
          <h3 className={styles.sectionTitle}>Expense breakdown by member</h3>
          <div className={styles.memberBreakdownList}>
            {detailedMembers
              .filter(m => m.expenses.length > 0)
              .sort((a, b) => Math.abs(b.net_balance) - Math.abs(a.net_balance))
              .map(member => (
                <MemberBreakdown
                  key={member.user_id}
                  member={member}
                  isCurrentUser={member.user_id === user?.id}
                />
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

function MemberBreakdown({ member, isCurrentUser }) {
  const [expanded, setExpanded] = useState(false);

  const netPositive = member.net_balance > 0;
  const netNegative = member.net_balance < 0;
  const displayName = isCurrentUser ? `${member.name} (you)` : member.name;

  return (
    <div className={styles.memberCard}>
      <button
        className={styles.memberHeader}
        onClick={() => setExpanded(!expanded)}
        type="button"
      >
        <div className={styles.memberLeft}>
          <Avatar name={member.name} size="small" />
          <div className={styles.memberInfo}>
            <span className={styles.memberName}>{displayName}</span>
            <span className={styles.memberSummary}>
              Paid {formatCurrency(member.total_paid)} &middot; Owes {formatCurrency(member.total_share)}
            </span>
          </div>
        </div>
        <div className={styles.memberRight}>
          <span className={`${styles.memberNet} ${netPositive ? styles.positive : ''} ${netNegative ? styles.negative : ''}`}>
            {netPositive ? '+' : ''}{formatCurrency(member.net_balance)}
          </span>
          <svg
            width="14" height="14" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2"
            className={`${styles.chevron} ${expanded ? styles.chevronOpen : ''}`}
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </div>
      </button>

      {expanded && (
        <div className={styles.memberExpenses}>
          {member.expenses.map(exp => {
            const cat = getCategoryByKey(exp.category);
            const net = exp.net;
            return (
              <div key={exp.id} className={styles.breakdownRow}>
                <span className={styles.breakdownCat}>{cat.emoji}</span>
                <div className={styles.breakdownInfo}>
                  <span className={styles.breakdownDesc}>{exp.description}</span>
                  <span className={styles.breakdownMeta}>
                    {formatDate(exp.date)} &middot; Total: {formatCurrency(exp.total_amount)}
                  </span>
                </div>
                <div className={styles.breakdownAmounts}>
                  {exp.paid > 0 && (
                    <span className={styles.breakdownPaid}>
                      Paid {formatCurrency(exp.paid)}
                    </span>
                  )}
                  {exp.share > 0 && (
                    <span className={styles.breakdownShare}>
                      Share {formatCurrency(exp.share)}
                    </span>
                  )}
                  <span className={`${styles.breakdownNet} ${net > 0 ? styles.positive : ''} ${net < 0 ? styles.negative : ''}`}>
                    {net > 0 ? '+' : ''}{formatCurrency(net)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
