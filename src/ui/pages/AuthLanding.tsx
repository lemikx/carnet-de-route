import { Link, Navigate } from 'react-router-dom';
import { useApp } from '../../app/AppContext';

/** Erreur renvoyée par Supabase dans l'adresse du lien de connexion (#error=…&error_description=…). */
export function authErrorFromUrl(href: string): string | null {
  const parts = [href.split('#')[1] ?? '', href.split('?')[1]?.split('#')[0] ?? ''];
  for (const raw of parts) {
    const p = new URLSearchParams(raw.replace(/^\//, ''));
    const code = p.get('error_code') ?? p.get('error');
    if (!code) continue;
    if (code === 'otp_expired') return 'Ce lien de connexion a expiré ou a déjà servi.';
    return `Connexion impossible : ${p.get('error_description') ?? code}.`;
  }
  return null;
}

/**
 * Page d'arrivée pour toute adresse inconnue, en particulier le retour du lien de connexion
 * (« #access_token=… » ou « #error=… »), que le routeur prendrait sinon pour une page introuvable.
 */
export function AuthLanding() {
  const { authReady } = useApp();
  const error = authErrorFromUrl(window.location.href);
  if (error) {
    return (
      <main className="page">
        <h1>Connexion</h1>
        <p role="alert" className="save-error">{error}</p>
        <p><Link className="btn btn-primary" to="/connexion">Recevoir un nouveau lien</Link></p>
      </main>
    );
  }
  if (!authReady) return <main className="page"><p className="muted">Connexion en cours…</p></main>;
  return <Navigate to="/" replace />;
}
