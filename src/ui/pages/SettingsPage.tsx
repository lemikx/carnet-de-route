import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useApp } from '../../app/AppContext';
import { useOnline } from '../../offline/useOnline';
import { SaveError } from '../common/SaveError';
import { useSave } from '../common/useSave';

export function SettingsPage() {
  const { settings, setSettings, user, signOut, mode, repo } = useApp();
  const online = useOnline();
  const hours = settings.heavyThresholdMin / 60;
  const [name, setName] = useState('');
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    repo.getDisplayName().then(setName, () => {});
  }, [repo]);
  const save = useSave(useCallback(async (n: string) => {
    await repo.setDisplayName(n);
    setSaved(true);
  }, [repo]));
  function submit(e: FormEvent) {
    e.preventDefault();
    setSaved(false);
    void save.run(name);
  }
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
      <form className="card form" onSubmit={submit}>
        <label>
          Nom affiché sur les roadbooks partagés
          <input value={name} maxLength={60} placeholder="Ex. lemikxfamily" onChange={(e) => { setName(e.target.value); setSaved(false); }} />
        </label>
        <p className="muted">Visible par les personnes qui ouvrent ton lien de partage. Ton adresse e-mail n’est jamais affichée.</p>
        <div>
          <button className="btn btn-primary" disabled={!online || save.saving}>Enregistrer le nom</button>
        </div>
        {saved && <p role="status" className="muted">Nom enregistré.</p>}
        <SaveError error={save.error} onRetry={save.retry} />
      </form>
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
