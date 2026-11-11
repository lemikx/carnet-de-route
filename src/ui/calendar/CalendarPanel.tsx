import { useCallback, useState } from 'react';
import { useApp } from '../../app/AppContext';
import { buildCalendar, type CalendarOptions } from '../../domain/calendar';
import type { TripBundle } from '../../domain/types';
import { useOnline } from '../../offline/useOnline';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { CopyButton } from '../common/CopyButton';
import { SaveError } from '../common/SaveError';
import { useAsync } from '../common/useAsync';
import { useSave } from '../common/useSave';
import * as download from './download';

export const CALENDAR_WARNING = 'Cette adresse contient tes numéros de réservation. Ne la partage pas : pour ta famille, utilise le partage du roadbook.';

export function CalendarPanel({ bundle }: { bundle: TripBundle }) {
  const { repo, mode, supabaseUrl } = useApp();
  const online = useOnline();
  const [open, setOpen] = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const tripId = bundle.trip.id;
  const link = useAsync(() => (open ? repo.getCalendarLink(tripId) : Promise.resolve(null)), [repo, tripId, open]);
  const [opts, setOpts] = useState<CalendarOptions>({ includeLegs: true, includeChecklist: true });
  const action = useSave(useCallback(async (make: () => Promise<unknown>) => {
    await make();
    await link.reload();
    return true;
  }, [link]));
  const current = link.data;
  const effective = current ? { includeLegs: current.includeLegs, includeChecklist: current.includeChecklist } : opts;
  const disabled = !online || action.saving;
  const canSubscribe = mode === 'supabase' && Boolean(supabaseUrl);
  const eventCount = (buildCalendar(bundle, effective).match(/BEGIN:VEVENT/g) ?? []).length;

  function setOption(k: keyof CalendarOptions, v: boolean) {
    const next = { ...effective, [k]: v };
    setOpts(next);
    if (current) void action.run(() => repo.updateCalendarOptions(tripId, next));
  }

  async function subscribe() {
    const created = await action.run(() => repo.createCalendarLink(tripId, effective));
    const l = await repo.getCalendarLink(tripId);
    if (created !== undefined && l && canSubscribe) window.location.href = download.calendarFeedUrl(supabaseUrl, l.token);
  }

  return (
    <>
      <button type="button" className="btn" onClick={() => setOpen(true)}>Calendrier</button>
      {open && (
        <div className="dialog-backdrop" onClick={() => setOpen(false)}>
          <div role="dialog" aria-modal="true" aria-labelledby="cal-title" className="dialog form" onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}>
            <h2 id="cal-title">Ajouter au calendrier</h2>
            <label className="checkbox">
              <input type="checkbox" checked={effective.includeLegs} disabled={disabled && Boolean(current)} onChange={(e) => setOption('includeLegs', e.target.checked)} />
              Inclure les trajets de plus de 30 min
            </label>
            <label className="checkbox">
              <input type="checkbox" checked={effective.includeChecklist} disabled={disabled && Boolean(current)} onChange={(e) => setOption('includeChecklist', e.target.checked)} />
              Inclure les échéances de la checklist
            </label>

            {eventCount === 0 && (
              <p className="alert" role="status">
                Rien à exporter pour l’instant : ajoute une heure à une étape, une réservation (vol, hôtel…) ou une échéance à la checklist.
              </p>
            )}
            <h3>Fichier à importer</h3>
            <button type="button" className="btn" disabled={eventCount === 0} onClick={() => download.downloadIcs(download.icsFilename(bundle.trip.name), buildCalendar(bundle, effective))}>
              Télécharger (.ics)
            </button>
            <p className="muted">Si tu modifies le voyage, réimporte le fichier ou utilise plutôt l’abonnement.</p>

            <h3>Abonnement (toujours à jour)</h3>
            {current ? (
              <>
                {canSubscribe && <input readOnly aria-label="Adresse d’abonnement" value={download.calendarHttpsUrl(supabaseUrl, current.token)} onFocus={(e) => e.target.select()} />}
                <p className="alert">{CALENDAR_WARNING}</p>
                <div className="trip-actions">
                  {canSubscribe && <CopyButton value={download.calendarHttpsUrl(supabaseUrl, current.token)} label="Copier l’adresse" />}
                  {canSubscribe && <a className="btn btn-small" href={download.calendarFeedUrl(supabaseUrl, current.token)}>Ouvrir dans Calendrier</a>}
                  <button type="button" className="btn btn-small" disabled={disabled} onClick={() => action.run(() => repo.createCalendarLink(tripId, effective))}>Nouvelle adresse</button>
                  <button type="button" className="btn btn-small btn-danger-text" disabled={disabled} onClick={() => setConfirmRevoke(true)}>Désactiver</button>
                </div>
                <p className="muted">Calendrier vérifie les changements environ toutes les heures.</p>
              </>
            ) : (
              <>
                <button type="button" className="btn btn-primary" disabled={disabled} onClick={subscribe}>S’abonner</button>
                {!canSubscribe && <p className="muted">Abonnement disponible une fois l’appli reliée à Supabase.</p>}
              </>
            )}
            <SaveError error={action.error} onRetry={action.retry} />
            <div className="dialog-actions">
              <button type="button" className="btn" onClick={() => setOpen(false)}>Fermer</button>
            </div>
          </div>
        </div>
      )}
      {confirmRevoke && (
        <ConfirmDialog title="Désactiver l’abonnement ?" confirmLabel="Désactiver" danger
          onConfirm={() => { setConfirmRevoke(false); void action.run(() => repo.revokeCalendarLink(tripId)); }}
          onCancel={() => setConfirmRevoke(false)}>
          <p>L’adresse ne renverra plus rien. Selon Calendrier, les événements déjà affichés peuvent rester : supprime l’abonnement dans Calendrier pour les retirer.</p>
        </ConfirmDialog>
      )}
    </>
  );
}
