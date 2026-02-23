import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import Avatar from '../Avatar/Avatar';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { getCategoryByKey } from '../../utils/constants';
import styles from './BalanceList.module.css';

export default function BalanceList({ balances, memberBalances, onSettleUp, pairExpenses, memberExpenses, isSimplified }) {
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
      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>Who owes whom</h3>
        <div className={styles.list}>
          {balances.map((debt, i) => (
            <DebtRow
              key={i}
              debt={debt}
              userId={user?.id}
              onSettleUp={onSettleUp}
              pairExpenses={pairExpenses}
              memberExpenses={memberExpenses}
              isSimplified={isSimplified}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function DebtRow({ debt, userId, onSettleUp, pairExpenses, memberExpenses, isSimplified }) {
  const [expanded, setExpanded] = useState(false);

  const isYouOwe = debt.from_user === userId;
  const isOwedToYou = debt.to_user === userId;

  // Build the expense breakdown depending on mode
  let relatedExpenses = [];

  if (isSimplified) {
    // Simplified debts: pairs are synthetic, so show per-member expense breakdown
    // The debtor (from_user) owes money overall — show their expenses where they owe (net < 0)
    const debtorExpenses = (memberExpenses?.[debt.from_user] || [])
      .filter(e => e.net < 0)
      .map(e => ({
        id: e.id,
        description: e.description,
        total_amount: e.total_amount,
        date: e.date,
        category: e.category,
        amount_owed: Math.abs(e.net),
        direction: 'owed',
        detail: `Paid ${formatCurrency(e.paid)}, share ${formatCurrency(e.share)}`,
      }));
    // The creditor (to_user) is owed money — show their expenses where they overpaid (net > 0)
    const creditorExpenses = (memberExpenses?.[debt.to_user] || [])
      .filter(e => e.net > 0)
      .map(e => ({
        id: e.id,
        description: e.description,
        total_amount: e.total_amount,
        date: e.date,
        category: e.category,
        amount_owed: e.net,
        direction: 'offset',
        detail: `Paid ${formatCurrency(e.paid)}, share ${formatCurrency(e.share)}`,
      }));
    relatedExpenses = [...debtorExpenses, ...creditorExpenses]
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  } else {
    // Non-simplified: direct pair lookup (both directions)
    const fwdKey = `${debt.from_user}:${debt.to_user}`;
    const fwdExpenses = (pairExpenses?.[fwdKey] || []).map(e => ({ ...e, direction: 'owed' }));
    const revKey = `${debt.to_user}:${debt.from_user}`;
    const revExpenses = (pairExpenses?.[revKey] || []).map(e => ({ ...e, direction: 'offset' }));
    relatedExpenses = [...fwdExpenses, ...revExpenses]
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  }

  const hasExpenses = relatedExpenses.length > 0;

  return (
    <div className={styles.debtCard}>
      <button
        className={styles.debtHeader}
        onClick={() => hasExpenses && setExpanded(!expanded)}
        type="button"
        style={{ cursor: hasExpenses ? 'pointer' : 'default' }}
      >
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
              onClick={(e) => { e.stopPropagation(); onSettleUp(debt); }}
            >
              Settle up
            </button>
          )}
          {hasExpenses && (
            <svg
              width="14" height="14" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2"
              className={`${styles.chevron} ${expanded ? styles.chevronOpen : ''}`}
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
          )}
        </div>
      </button>

      {expanded && hasExpenses && (
        <div className={styles.debtExpenses}>
          {isSimplified && (
            <div className={styles.simplifiedNote}>
              Showing each person's net position per expense
            </div>
          )}
          {isSimplified ? (
            <>
              {relatedExpenses.filter(e => e.direction === 'owed').length > 0 && (
                <div className={styles.breakdownSection}>
                  <div className={styles.breakdownSectionTitle}>{debt.from_user_name} owes from:</div>
                  {relatedExpenses.filter(e => e.direction === 'owed').map((exp) => {
                    const cat = getCategoryByKey(exp.category);
                    return (
                      <div key={`owed-${exp.id}`} className={styles.breakdownRow}>
                        <span className={styles.breakdownCat}>{cat.emoji}</span>
                        <div className={styles.breakdownInfo}>
                          <span className={styles.breakdownDesc}>{exp.description}</span>
                          <span className={styles.breakdownMeta}>
                            {formatDate(exp.date)} &middot; {exp.detail}
                          </span>
                        </div>
                        <div className={styles.breakdownAmounts}>
                          <span className={`${styles.breakdownNet} ${styles.negative}`}>
                            -{formatCurrency(exp.amount_owed)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              {relatedExpenses.filter(e => e.direction === 'offset').length > 0 && (
                <div className={styles.breakdownSection}>
                  <div className={styles.breakdownSectionTitle}>{debt.to_user_name} is owed from:</div>
                  {relatedExpenses.filter(e => e.direction === 'offset').map((exp) => {
                    const cat = getCategoryByKey(exp.category);
                    return (
                      <div key={`offset-${exp.id}`} className={styles.breakdownRow}>
                        <span className={styles.breakdownCat}>{cat.emoji}</span>
                        <div className={styles.breakdownInfo}>
                          <span className={styles.breakdownDesc}>{exp.description}</span>
                          <span className={styles.breakdownMeta}>
                            {formatDate(exp.date)} &middot; {exp.detail}
                          </span>
                        </div>
                        <div className={styles.breakdownAmounts}>
                          <span className={`${styles.breakdownNet} ${styles.positive}`}>
                            +{formatCurrency(exp.amount_owed)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          ) : (
            relatedExpenses.map((exp) => {
              const cat = getCategoryByKey(exp.category);
              const isOffset = exp.direction === 'offset';
              return (
                <div key={`${exp.id}-${exp.direction}`} className={styles.breakdownRow}>
                  <span className={styles.breakdownCat}>{cat.emoji}</span>
                  <div className={styles.breakdownInfo}>
                    <span className={styles.breakdownDesc}>{exp.description}</span>
                    <span className={styles.breakdownMeta}>
                      {formatDate(exp.date)} &middot; Total: {formatCurrency(exp.total_amount)}
                    </span>
                  </div>
                  <div className={styles.breakdownAmounts}>
                    <span className={`${styles.breakdownNet} ${isOffset ? styles.positive : styles.negative}`}>
                      {isOffset ? '-' : '+'}{formatCurrency(exp.amount_owed)}
                    </span>
                  </div>
                </div>
              );
            })
          )}
          <div className={styles.breakdownTotal}>
            <span>Net total</span>
            <span className={styles.negative}>{formatCurrency(debt.amount)}</span>
          </div>
        </div>
      )}
    </div>
  );
}
