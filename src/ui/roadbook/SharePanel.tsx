import { useCallback, useState } from 'react';
import { useApp } from '../../app/AppContext';
import { useOnline } from '../../offline/useOnline';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { CopyButton } from '../common/CopyButton';
import { SaveError } from '../common/SaveError';
import { useAsync } from '../common/useAsync';
import { useSave } from '../common/useSave';

export function shareUrl(token: string): string {
  return `${location.origin}${location.pathname}#/r/${token}`;
}

export const SHARE_WARNING = 'Toute personne qui a ce lien peut voir ton itinéraire, tes hébergements et tes dates.';

export function SharePanel({ tripId }: { tripId: string }) {
  const { repo } = useApp();
  const online = useOnline();
  const link = useAsync(() => repo.getShareLink(tripId), [repo, tripId]);
  const [hide, setHide] = useState(true);
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const action = useSave(useCallback(async (p: Promise<unknown>) => {
    await p;
    await link.reload();
  }, [link]));
  const disabled = !online || action.saving;
  const current = link.data;
  const url = current ? shareUrl(current.token) : '';

  return (
    <section className="card form" aria-label="Partager le roadbook">
      <h2>Partager le roadbook</h2>
      {current ? (
        <>
          <label>
            Lien en lecture seule {current.hideSensitive ? '(infos sensibles masquées)' : '(tout est visible)'}
            <input readOnly value={url} onFocus={(e) => e.target.select()} />
          </label>
          <div className="trip-actions">
            <CopyButton value={url} />
            {typeof navigator !== 'undefined' && 'share' in navigator && (
              <button type="button" className="btn btn-small" onClick={() => navigator.share({ title: 'Roadbook', url }).catch(() => {})}>Partager</button>
            )}
            <button type="button" className="btn btn-small" disabled={disabled} onClick={() => action.run(repo.createShareLink(tripId, current.hideSensitive))}>Nouveau lien</button>
            <button type="button" className="btn btn-small btn-danger-text" disabled={disabled} onClick={() => setConfirmRevoke(true)}>Désactiver le lien</button>
          </div>
          <p className="muted">Ta famille voit toujours la version à jour, sans compte et sans pouvoir modifier. « Nouveau lien » coupe l’ancien.</p>
        </>
      ) : (
        <>
          <label className="checkbox">
            <input type="checkbox" checked={hide} onChange={(e) => setHide(e.target.checked)} />
            Masquer les infos sensibles
          </label>
          <p className="muted">Numéros de réservation, prix, liens de réservation et notes personnelles ne seront pas visibles.</p>
          <p className="alert">{SHARE_WARNING}</p>
          <div>
            <button type="button" className="btn btn-primary" disabled={disabled} onClick={() => action.run(repo.createShareLink(tripId, hide))}>Créer un lien</button>
          </div>
        </>
      )}
      <p className="muted">Pour une copie figée, exporte le PDF et envoie-le.</p>
      <SaveError error={action.error} onRetry={action.retry} />
      {confirmRevoke && (
        <ConfirmDialog title="Désactiver le lien de partage ?" confirmLabel="Désactiver" danger
          onConfirm={() => { setConfirmRevoke(false); void action.run(repo.revokeShareLink(tripId)); }}
          onCancel={() => setConfirmRevoke(false)}>
          <p>Les personnes qui ont le lien ne pourront plus voir le roadbook.</p>
        </ConfirmDialog>
      )}
    </section>
  );
}
