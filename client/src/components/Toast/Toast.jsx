import { useToast } from '../../contexts/ToastContext';
import styles from './Toast.module.css';

export default function ToastContainer() {
  const { toasts, removeToast } = useToast();

  if (toasts.length === 0) return null;

  return (
    <div className={styles.container}>
      {toasts.map(toast => (
        <div key={toast.id} className={`${styles.toast} ${styles[toast.type]}`}>
          <span className={styles.icon}>
            {toast.type === 'success' && '\u2713'}
            {toast.type === 'error' && '\u2717'}
            {toast.type === 'info' && '\u2139'}
            {toast.type === 'warning' && '\u26A0'}
          </span>
          <span className={styles.message}>{toast.message}</span>
          <button className={styles.close} onClick={() => removeToast(toast.id)}>
            \u2715
          </button>
        </div>
      ))}
    </div>
  );
}
