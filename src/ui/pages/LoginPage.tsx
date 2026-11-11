import { useState, type FormEvent } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useApp } from '../../app/AppContext';
import { describeAuthError } from '../../app/authError';

export function LoginPage() {
  const { user, signIn } = useApp();
  const location = useLocation();
  const expired = (location.state as { expired?: boolean } | null)?.expired;
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/" replace />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signIn(email.trim());
      setSent(email.trim());
    } catch (e) {
      setError(describeAuthError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="page narrow">
      <h1>Carnet de route</h1>
      {expired && <p role="status" className="notice">Ta session a expiré, demande un nouveau lien.</p>}
      {sent ? (
        <p role="status" className="notice">Lien envoyé à {sent}. Ouvre-le sur cet appareil.</p>
      ) : (
        <form className="card form" onSubmit={submit}>
          <p>Reçois un lien de connexion par e-mail, sans mot de passe.</p>
          <label>
            Adresse e-mail
            <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          {error && <p role="alert" className="field-error">{error}</p>}
          <button className="btn btn-primary" disabled={busy}>Recevoir le lien</button>
        </form>
      )}
    </main>
  );
}
