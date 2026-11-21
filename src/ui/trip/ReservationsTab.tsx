import { useCallback, useState } from 'react';
import { useApp } from '../../app/AppContext';
import { sortReservations } from '../../domain/reservations';
import type { Reservation, TripBundle } from '../../domain/types';
import { useOnline } from '../../offline/useOnline';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { SaveError } from '../common/SaveError';
import { useSave } from '../common/useSave';
import { ReservationCard } from './ReservationCard';
import { ReservationForm } from './ReservationForm';
import type { TripTabProps } from './types';

export function ReservationsTab({ bundle, setBundle }: TripTabProps) {
  const { service, routing } = useApp();
  const online = useOnline();
  const [editing, setEditing] = useState<Reservation | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Reservation | null>(null);
  const action = useSave(useCallback(async (make: () => Promise<TripBundle>) => {
    setBundle(await make());
    return true;
  }, [setBundle]));
  // La fermeture du formulaire fait partie de l'action : « Réessayer » la refait aussi.
  const saveAndClose = (make: () => Promise<TripBundle>) =>
    action.run(async () => {
      const b = await make();
      setEditing(null);
      return b;
    });
  const disabled = !online || action.saving;
  const tz = bundle.stops.at(-1)?.timezone ?? bundle.trip.homeTimezone;
  const located = bundle.stops.filter((s) => s.lat !== null && s.lon !== null).at(-1);
  const focus = located ? { lat: located.lat!, lon: located.lon! } : undefined;
  const inTrip = (r: Reservation) => r.startAt.date >= bundle.trip.startDate && r.startAt.date <= bundle.trip.endDate;

  return (
    <div>
      <SaveError error={action.error} onRetry={action.retry} />
      {editing === 'new' ? (
        <ReservationForm routing={routing} tripId={bundle.trip.id} defaultTimezone={tz} focus={focus} disabled={disabled}
          onSave={(r) => void saveAndClose(() => service.saveReservation(r))} onCancel={() => setEditing(null)} />
      ) : (
        <button className="btn btn-primary" onClick={() => setEditing('new')} disabled={disabled} style={{ marginBottom: 12 }}>
          Ajouter une réservation
        </button>
      )}
      {bundle.reservations.length === 0 && editing !== 'new' && <p className="empty">Aucune réservation pour l’instant</p>}
      <ul className="list">
        {sortReservations(bundle.reservations).map((r) =>
          editing !== 'new' && editing?.id === r.id ? (
            <li key={r.id}>
              <ReservationForm routing={routing} tripId={bundle.trip.id} initial={r} defaultTimezone={tz} focus={focus} disabled={disabled}
                onSave={(x) => void saveAndClose(() => service.saveReservation(x))} onCancel={() => setEditing(null)} />
            </li>
          ) : (
            <ReservationCard key={r.id} r={r} inTrip={inTrip(r)} disabled={disabled} onEdit={() => setEditing(r)} onDelete={() => setDeleting(r)} />
          ),
        )}
      </ul>
      {deleting && (
        <ConfirmDialog title={`Supprimer « ${deleting.title} » ?`} confirmLabel="Supprimer" danger
          onConfirm={() => { const id = deleting.id; setDeleting(null); void action.run(() => service.deleteReservation(id)); }}
          onCancel={() => setDeleting(null)}>
          <p>Les étapes créées par cette réservation seront aussi retirées de l’itinéraire.</p>
        </ConfirmDialog>
      )}
    </div>
  );
}
