import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useApp } from '../../app/AppContext';
import { formatDate, formatDayLabel } from '../../domain/format';
import { orderedStops } from '../../domain/legs';
import type { Day, Trip } from '../../domain/types';
import { NeedsConfirmationError } from '../../services/tripService';
import { useOnline } from '../../offline/useOnline';
import { DraftsList } from '../ai/DraftsList';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { SaveError } from '../common/SaveError';
import { useAsync } from '../common/useAsync';
import { useSave } from '../common/useSave';
import { TripForm, type TripFormValues } from './TripForm';

/** Couvertures des voyages : photo de la première étape qui en a une. Chargées une fois par voyage, sans jamais bloquer l'affichage. */
function useCovers(trips: Trip[]): Record<string, string | null> {
  const { repo } = useApp();
  const [covers, setCovers] = useState<Record<string, string | null>>({});
  const asked = useRef(new Set<string>());
  useEffect(() => {
    let alive = true;
    for (const t of trips) {
      if (asked.current.has(t.id)) continue;
      asked.current.add(t.id);
      void repo.getBundle(t.id).then((b) => {
        const url = orderedStops(b.days, b.stops).find((s) => s.photoUrl)?.photoUrl ?? null;
        if (alive) setCovers((c) => ({ ...c, [t.id]: url }));
      }).catch(() => { /* la couverture est facultative */ });
    }
    return () => { alive = false; };
  }, [trips, repo]);
  return covers;
}

const splitCountries = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean);

export function TripsPage() {
  const { repo, service } = useApp();
  const online = useOnline();
  const navigate = useNavigate();
  const trips = useAsync(() => repo.listTrips(), [repo]);
  const drafts = useAsync(() => repo.listDrafts().catch(() => []), [repo]);
  const removeDraft = useSave(
    useCallback(async (id: string) => {
      await repo.deleteDraft(id);
      await drafts.reload();
    }, [repo, drafts]),
  );
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Trip | null>(null);
  const [deleting, setDeleting] = useState<Trip | null>(null);
  const [pendingDates, setPendingDates] = useState<{ trip: Trip; v: TripFormValues; days: Day[] } | null>(null);

  const create = useSave(
    useCallback(async (v: TripFormValues) => {
      await service.createTrip({
        name: v.name, startDate: v.startDate, endDate: v.endDate, countries: splitCountries(v.countries),
        localCurrency: v.localCurrency.toUpperCase(), homeTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone, updatedAt: '',
      });
      setCreating(false);
      await trips.reload();
    }, [service, trips]),
  );

  const edit = useSave(
    useCallback(async (trip: Trip, v: TripFormValues, confirm = false) => {
      try {
        if (v.startDate !== trip.startDate || v.endDate !== trip.endDate) {
          await service.changeDates(trip.id, v.startDate, v.endDate, { confirm });
        }
      } catch (e) {
        if (e instanceof NeedsConfirmationError) {
          setPendingDates({ trip, v, days: e.days });
          return;
        }
        throw e;
      }
      const fresh = (await repo.getBundle(trip.id)).trip;
      await repo.updateTrip({ ...fresh, name: v.name, countries: splitCountries(v.countries), localCurrency: v.localCurrency.toUpperCase() });
      setPendingDates(null);
      setEditing(null);
      await trips.reload();
    }, [repo, service, trips]),
  );

  const remove = useSave(
    useCallback(async (trip: Trip) => {
      await repo.deleteTrip(trip.id);
      setDeleting(null);
      await trips.reload();
    }, [repo, trips]),
  );

  const duplicate = useSave(
    useCallback(async (trip: Trip) => {
      await service.duplicateTrip(trip.id, `${trip.name} (copie)`);
      await trips.reload();
    }, [service, trips]),
  );

  const list = trips.data ?? [];
  const covers = useCovers(list);
  return (
    <main className="page">
      <div className="page-head">
        <h1>Mes voyages</h1>
        {!creating && (
          <div className="trip-actions">
            <button className="btn btn-primary" onClick={() => setCreating(true)} disabled={!online}>
              Nouveau voyage
            </button>
            <button className="btn" onClick={() => navigate('/ia/nouveau')} disabled={!online}>
              Créer avec l’IA
            </button>
          </div>
        )}
      </div>

      {creating && (
        <>
          <TripForm linkDates submitLabel="Créer le voyage" disabled={create.saving} onSubmit={(v) => create.run(v)} onCancel={() => setCreating(false)} />
          <SaveError error={create.error} onRetry={create.retry} />
        </>
      )}

      <DraftsList drafts={drafts.data ?? []} onDelete={(id) => void removeDraft.run(id)} />
      <SaveError error={removeDraft.error} onRetry={removeDraft.retry} />

      {trips.loading && !trips.data && <p className="muted">Chargement…</p>}
      {Boolean(trips.error) && <p role="alert" className="save-error">Impossible de charger tes voyages.</p>}
      {!trips.loading && list.length === 0 && !creating && <p className="empty">Aucun voyage pour l’instant</p>}

      <ul className="trip-list">
        {list.map((t) =>
          editing?.id === t.id ? (
            <li key={t.id}>
              <TripForm
                submitLabel="Enregistrer"
                disabled={edit.saving}
                initial={{ name: t.name, startDate: t.startDate, endDate: t.endDate, countries: t.countries.join(', '), localCurrency: t.localCurrency }}
                onSubmit={(v) => edit.run(t, v)}
                onCancel={() => setEditing(null)}
              />
              <SaveError error={edit.error} onRetry={edit.retry} />
            </li>
          ) : (
            <li key={t.id} className="card trip-card">
              <Link to={`/voyage/${t.id}/itineraire`} className="trip-link">
                {covers[t.id] ? (
                  <img className="trip-cover" src={covers[t.id]!} alt="" loading="lazy" />
                ) : (
                  <span className="trip-cover trip-cover-empty" aria-hidden="true">{t.name.trim().charAt(0).toUpperCase()}</span>
                )}
                <span className="trip-info">
                  <strong>{t.name}</strong>
                  <span className="muted">{formatDate(t.startDate)} → {formatDate(t.endDate)}</span>
                  {t.countries.length > 0 && <span className="muted">{t.countries.join(', ')}</span>}
                </span>
              </Link>
              <div className="trip-actions">
                <button className="btn btn-small" onClick={() => setEditing(t)} disabled={!online}>Modifier</button>
                <button className="btn btn-small" onClick={() => duplicate.run(t)} disabled={!online}>Dupliquer</button>
                <button className="btn btn-small btn-danger-text" onClick={() => setDeleting(t)} disabled={!online}>Supprimer</button>
              </div>
            </li>
          ),
        )}
      </ul>
      <SaveError error={duplicate.error} onRetry={duplicate.retry} />

      {deleting && (
        <ConfirmDialog title={`Supprimer « ${deleting.name} » ?`} confirmLabel="Supprimer" danger onConfirm={() => remove.run(deleting)} onCancel={() => setDeleting(null)}>
          <p>Tout le voyage sera supprimé : itinéraire, réservations, checklist et liens de partage. C’est définitif.</p>
          <SaveError error={remove.error} onRetry={remove.retry} />
        </ConfirmDialog>
      )}

      {pendingDates && (
        <ConfirmDialog
          title="Supprimer des jours qui contiennent des étapes ?"
          confirmLabel="Supprimer ces jours"
          danger
          onConfirm={() => edit.run(pendingDates.trip, pendingDates.v, true)}
          onCancel={() => setPendingDates(null)}
        >
          <p>Avec les nouvelles dates, ces jours disparaissent avec leurs étapes :</p>
          <ul>
            {pendingDates.days.map((d) => (
              <li key={d.id}>{formatDayLabel(d.date)}</li>
            ))}
          </ul>
        </ConfirmDialog>
      )}
    </main>
  );
}
