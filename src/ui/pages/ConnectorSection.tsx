import { useCallback, useEffect, useState } from 'react';
import type { TripRepository } from '../../data/TripRepository';
import { formatDate } from '../../domain/format';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { CopyButton } from '../common/CopyButton';
import { SaveError } from '../common/SaveError';
import { useSave } from '../common/useSave';

/** Réglages du connecteur Claude : adresse du serveur + jeton secret (affiché une seule fois), révocable. */
export function ConnectorSection({ repo, serverUrl, online }: { repo: TripRepository; serverUrl: string; online: boolean }) {
  const [link, setLink] = useState<{ createdAt: string } | null | undefined>(undefined);
  const [token, setToken] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  useEffect(() => {
    repo.getConnectorLink().then(setLink, () => setLink(null));
  }, [repo]);

  const create = useSave(useCallback(async () => {
    setToken(await repo.createConnectorLink());
    setLink(await repo.getConnectorLink());
  }, [repo]));
  const revoke = useSave(useCallback(async () => {
    await repo.revokeConnectorLink();
    setToken(null);
    setLink(null);
    setAsking(false);
  }, [repo]));

  const fullUrl = token ? `${serverUrl}?token=${token}` : '';
  return (
    <section className="card form">
      <h2>Connecteur Claude</h2>
      <p className="muted">
        Permet de dire à Claude (claude.ai ou Claude Code) « crée-moi un voyage à… ». Claude dépose l’itinéraire dans tes
        Brouillons IA ; tu le vérifies puis tu cliques sur « Créer le voyage ». Claude ne peut rien lire ni modifier d’autre.
      </p>
      {link === undefined && <p className="muted">Chargement…</p>}
      {link === null && !token && (
        <button type="button" className="btn btn-primary" disabled={!online || create.saving} onClick={() => void create.run()}>
          Créer l’adresse du connecteur
        </button>
      )}
      {link && !token && (
        <>
          <p>Connecteur actif depuis le {formatDate(link.createdAt.slice(0, 10))}.</p>
          <div className="form-actions">
            <button type="button" className="btn" disabled={!online || create.saving} onClick={() => void create.run()}>Créer une nouvelle adresse</button>
            <button type="button" className="btn btn-danger-text" disabled={!online} onClick={() => setAsking(true)}>Révoquer</button>
          </div>
        </>
      )}
      {token && (
        <>
          <label>Adresse à coller dans claude.ai<input readOnly value={fullUrl} /></label>
          <CopyButton value={fullUrl} label="Copier l’adresse" />
          <ol>
            <li>Ouvre <strong>claude.ai → Paramètres → Connecteurs</strong>.</li>
            <li>Clique sur <strong>Ajouter un connecteur personnalisé</strong>.</li>
            <li>Nom : <em>Carnet de route</em>. Adresse : colle l’adresse copiée. Ne remplis rien d’autre, puis <strong>Ajouter</strong>.</li>
          </ol>
          <p role="status" className="notice">Copie-la maintenant : elle ne sera plus affichée. Ne la partage avec personne.</p>
          <button type="button" className="btn btn-danger-text" disabled={!online} onClick={() => setAsking(true)}>Révoquer</button>
        </>
      )}
      <SaveError error={create.error ?? revoke.error} onRetry={create.error ? create.retry : revoke.retry} />
      {asking && (
        <ConfirmDialog title="Révoquer le connecteur ?" confirmLabel="Révoquer" danger onConfirm={() => void revoke.run()} onCancel={() => setAsking(false)}>
          <p>Claude ne pourra plus déposer de brouillon. Tes voyages et brouillons existants ne changent pas.</p>
        </ConfirmDialog>
      )}
    </section>
  );
}
