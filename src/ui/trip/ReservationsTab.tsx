import { useCallback, useState } from 'react';
import { useApp } from '../../app/AppContext';
import { formatDate } from '../../domain/format';
import { sortReservations } from '../../domain/reservations';
import type { Reservation, TripBundle } from '../../domain/types';
import { useOnline } from '../../offline/useOnline';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { CopyButton } from '../common/CopyButton';
import { SaveError } from '../common/SaveError';
import { useSave } from '../common/useSave';
import { RESERVATION_LABELS } from './labels';
import { ReservationForm } from './ReservationForm';
import type { TripTabProps } from './types';

const ICON: Record<Reservation['type'], string> = { flight: '✈️', lodging: '🏨', car_rental: '🚗', train: '🚆', activity: '🎟️', other: '📌' };

function when(r: Reservation) {
  const start = `${formatDate(r.startAt.date)} ${r.startAt.time}`;
  if (!r.endAt) return start;
  return `${start} → ${r.endAt.date === r.startAt.date ? '' : formatDate(r.endAt.date) + ' '}${r.endAt.time}`;
}

export function ReservationsTab({ bundle, setBundle }: TripTabProps) {
  const { service, routing } = useApp();
  const online = useOnline();
  const [editing, setEditing] = useState<Reservation | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Reservation | null>(null);
  const action = useSave(useCallback(async (p: Promise<TripBundle>) => setBundle(await p), [setBundle]));
  const disabled = !online || action.saving;
  const tz = bundle.stops.at(-1)?.timezone ?? bundle.trip.homeTimezone;
  const inTrip = (r: Reservation) => r.startAt.date >= bundle.trip.startDate && r.startAt.date <= bundle.trip.endDate;

  return (
    <div>
      <SaveError error={action.error} onRetry={action.retry} />
      {editing === 'new' ? (
        <ReservationForm routing={routing} tripId={bundle.trip.id} defaultTimezone={tz} disabled={disabled}
          onSave={(r) => { setEditing(null); void action.run(service.saveReservation(r)); }} onCancel={() => setEditing(null)} />
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
              <ReservationForm routing={routing} tripId={bundle.trip.id} initial={r} defaultTimezone={tz} disabled={disabled}
                onSave={(x) => { setEditing(null); void action.run(service.saveReservation(x)); }} onCancel={() => setEditing(null)} />
            </li>
          ) : (
            <li key={r.id} className="card" data-testid="reservation">
              <div className="day-head">
                <strong>{ICON[r.type]} {r.title}</strong>
                <span className="badge">{RESERVATION_LABELS[r.type]}</span>
              </div>
              <p className="muted">{when(r)}</p>
              {(r.fromPlace || r.toPlace) && (
                <p className="muted">{[r.fromPlace?.title, r.toPlace?.title].filter(Boolean).join(' → ')}</p>
              )}
              {!inTrip(r) && <p className="alert">Hors des dates du voyage : pas ajoutée à l’itinéraire.</p>}
              {r.confirmationNumber && (
                <p>N° <strong>{r.confirmationNumber}</strong> <CopyButton value={r.confirmationNumber} label="Copier le n°" /></p>
              )}
              <p className="muted">
                {r.price !== null && <span>{r.price.toLocaleString('fr-FR')} {r.currency} · </span>}
                {r.phone && <a href={`tel:${r.phone}`}>{r.phone}</a>} {r.url && <a href={r.url} target="_blank" rel="noreferrer">Voir la réservation</a>}
              </p>
              {r.note && <p>{r.note}</p>}
              <div className="trip-actions" style={{ justifyContent: 'flex-end' }}>
                <button className="btn btn-small" onClick={() => setEditing(r)} disabled={disabled}>Modifier</button>
                <button className="btn btn-small btn-danger-text" onClick={() => setDeleting(r)} disabled={disabled}>Supprimer</button>
              </div>
            </li>
          ),
        )}
      </ul>
      {deleting && (
        <ConfirmDialog title={`Supprimer « ${deleting.title} » ?`} confirmLabel="Supprimer" danger
          onConfirm={() => { const id = deleting.id; setDeleting(null); void action.run(service.deleteReservation(id)); }}
          onCancel={() => setDeleting(null)}>
          <p>Les étapes créées par cette réservation seront aussi retirées de l’itinéraire.</p>
        </ConfirmDialog>
      )}
    </div>
  );
}
