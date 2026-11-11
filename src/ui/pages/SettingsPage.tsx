import { useApp } from '../../app/AppContext';

export function SettingsPage() {
  const { settings, setSettings, user, signOut, mode } = useApp();
  const hours = settings.heavyThresholdMin / 60;
  return (
    <main className="page narrow">
      <h1>Réglages</h1>
      <div className="card form">
        <label>
          Alerte « journée chargée » au-delà de (heures de trajet)
          <input
            type="number" min={1} max={24} step={0.5} value={hours}
            onChange={(e) => {
              const h = Number(e.target.value);
              if (h > 0) setSettings({ ...settings, heavyThresholdMin: Math.round(h * 60) });
            }}
          />
        </label>
      </div>
      {mode === 'memory' && (
        <p className="notice">Mode démonstration : les données restent dans ce navigateur, sans synchronisation.</p>
      )}
      {mode === 'supabase' && user && (
        <div className="card">
          <p>Connecté : {user.email}</p>
          <button className="btn" onClick={() => signOut()}>Se déconnecter</button>
        </div>
      )}
    </main>
  );
}
