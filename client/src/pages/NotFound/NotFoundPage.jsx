import { Link } from 'react-router-dom';

export default function NotFoundPage() {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 32,
      textAlign: 'center',
    }}>
      <h1 style={{ fontSize: '4rem', fontWeight: 700, color: 'var(--color-text-tertiary)', marginBottom: 8 }}>
        404
      </h1>
      <p style={{ fontSize: '1.125rem', color: 'var(--color-text-secondary)', marginBottom: 24 }}>
        Page not found
      </p>
      <Link
        to="/"
        style={{
          padding: '10px 24px',
          background: 'var(--color-primary)',
          color: 'white',
          borderRadius: 8,
          fontWeight: 600,
          textDecoration: 'none',
        }}
      >
        Go to Dashboard
      </Link>
    </div>
  );
}
