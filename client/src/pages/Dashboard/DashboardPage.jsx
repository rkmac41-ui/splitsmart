import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import * as balancesApi from '../../api/balances';
import { useAuth } from '../../contexts/AuthContext';
import Avatar from '../../components/Avatar/Avatar';
import ActivityFeed from '../../components/ActivityFeed/ActivityFeed';
import { formatCurrency } from '../../utils/formatters';
import styles from './DashboardPage.module.css';

export default function DashboardPage() {
  const { user } = useAuth();
  const [dashboard, setDashboard] = useState(null);
  const [activity, setActivity] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [dashData, actData] = await Promise.all([
          balancesApi.getDashboard(),
          balancesApi.getActivity(20),
        ]);
        setDashboard(dashData);
        setActivity(actData.activities);
      } catch (err) {
        // ignore
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  if (loading) {
    return (
      <div className={styles.loading}>
        <div className={styles.spinner} />
      </div>
    );
  }

  const netBalance = dashboard?.netBalance || 0;

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Dashboard</h1>
      <p className={styles.greeting}>Welcome back, {user?.name}</p>

      <div className={styles.cards}>
        <div className={`${styles.card} ${styles.netCard}`}>
          <span className={styles.cardLabel}>Net Balance</span>
          <span className={`${styles.cardValue} ${netBalance > 0 ? styles.positive : netBalance < 0 ? styles.negative : ''}`}>
            {netBalance >= 0 ? '+' : ''}{formatCurrency(netBalance)}
          </span>
        </div>
        <div className={`${styles.card} ${styles.oweCard}`}>
          <span className={styles.cardLabel}>You owe</span>
          <span className={`${styles.cardValue} ${styles.negative}`}>
            {formatCurrency(dashboard?.totalOwe || 0)}
          </span>
        </div>
        <div className={`${styles.card} ${styles.owedCard}`}>
          <span className={styles.cardLabel}>You are owed</span>
          <span className={`${styles.cardValue} ${styles.positive}`}>
            {formatCurrency(dashboard?.totalOwed || 0)}
          </span>
        </div>
      </div>

      <div className={styles.sections}>
        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>Balances by Person</h2>
          {(!dashboard?.byPerson || dashboard.byPerson.length === 0) ? (
            <div className={styles.empty}>
              <span className={styles.emptyIcon}>&#x2713;</span>
              <p>You're all settled up!</p>
            </div>
          ) : (
            <div className={styles.personList}>
              {dashboard.byPerson.sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount)).map(p => (
                <div key={p.user_id} className={styles.personItem}>
                  <Avatar name={p.name} size="medium" />
                  <div className={styles.personInfo}>
                    <span className={styles.personName}>{p.name}</span>
                    <span className={`${styles.personAmount} ${p.amount > 0 ? styles.positive : styles.negative}`}>
                      {p.amount > 0 ? `owes you ${formatCurrency(p.amount)}` : `you owe ${formatCurrency(Math.abs(p.amount))}`}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {dashboard?.groupSummaries && dashboard.groupSummaries.length > 0 && (
          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>By Group</h2>
            <div className={styles.groupList}>
              {dashboard.groupSummaries.map(g => (
                <Link key={g.group_id} to={`/groups/${g.group_id}`} className={styles.groupItem}>
                  <span className={styles.groupName}>{g.group_name}</span>
                  <span className={`${styles.groupBalance} ${g.balance > 0 ? styles.positive : styles.negative}`}>
                    {g.balance > 0 ? '+' : ''}{formatCurrency(g.balance)}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        )}

        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>Recent Activity</h2>
          <ActivityFeed activities={activity} showGroup />
        </div>
      </div>
    </div>
  );
}
