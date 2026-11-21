import { formatDate, formatDuration } from '../../domain/format';
import { minutesBetween } from '../../domain/time';
import type { Reservation } from '../../domain/types';
import { CopyButton } from '../common/CopyButton';
import { safeHref } from '../common/safeHref';
import { RESERVATION_LABELS } from './labels';

const ICON: Record<Reservation['type'], string> = { flight: '✈️', lodging: '🏨', car_rental: '🚗', train: '🚆', activity: '🎟️', other: '📌' };

function when(r: Reservation) {
  const start = `${formatDate(r.startAt.date)} ${r.startAt.time}`;
  if (!r.endAt) return start;
  return `${start} → ${r.endAt.date === r.startAt.date ? '' : formatDate(r.endAt.date) + ' '}${r.endAt.time}`;
}

interface Props {
  r: Reservation;
  inTrip: boolean;
  disabled: boolean;
  onEdit(): void;
  onDelete(): void;
}

function PlaneIcon() {
  return (
    <svg className="bp-plane" viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M10.5 13.5 3 11l1-2 8 1 4-5c.8-1 2.4-1.2 3-.6s.4 2.2-.6 3l-5 4 1 8-2 1-2.5-7.5-3.4 3.4v-2.9Z" />
    </svg>
  );
}

function Extras({ r }: { r: Reservation }) {
  const href = safeHref(r.url);
  const hasLinks = r.price !== null || r.phone || href;
  if (!hasLinks && !r.note) return null;
  return (
    <>
      {hasLinks && (
        <p className="muted">
          {r.price !== null && <span>{r.price.toLocaleString('fr-FR')} {r.currency} · </span>}
          {r.phone && <a href={`tel:${r.phone}`}>{r.phone}</a>} {href && <a href={href} target="_blank" rel="noreferrer">Voir la réservation</a>}
        </p>
      )}
      {r.note && <p>{r.note}</p>}
    </>
  );
}

/** Champs du billet : seulement ceux qui existent dans la réservation, rien d'inventé. */
export function boardingFields(r: Reservation): { label: string; value: string; copy?: boolean }[] {
  const out: { label: string; value: string; copy?: boolean }[] = [];
  if (r.title) out.push({ label: 'Vol', value: r.title });
  if (r.confirmationNumber) out.push({ label: 'N° de confirmation', value: r.confirmationNumber, copy: true });
  if (r.terminal) out.push({ label: 'Terminal', value: r.terminal });
  if (r.gate) out.push({ label: 'Porte', value: r.gate });
  if (r.seat) out.push({ label: 'Siège', value: r.seat });
  return out;
}

function Actions({ onEdit, onDelete, disabled }: Pick<Props, 'onEdit' | 'onDelete' | 'disabled'>) {
  return (
    <div className="trip-actions" style={{ justifyContent: 'flex-end' }}>
      <button className="btn btn-small" onClick={onEdit} disabled={disabled}>Modifier</button>
      <button className="btn btn-small btn-danger-text" onClick={onDelete} disabled={disabled}>Supprimer</button>
    </div>
  );
}

function Alert({ inTrip }: { inTrip: boolean }) {
  return inTrip ? null : <p className="alert">Hors des dates du voyage : pas ajoutée à l’itinéraire.</p>;
}

function Place({ code, name }: { code?: string | null; name: string }) {
  if (!code) return <span className="bp-place">{name}</span>;
  return (
    <>
      <span className="bp-place bp-code">{code}</span>
      <span className="bp-city muted">{name}</span>
    </>
  );
}

function BoardingPass(p: Props) {
  const { r } = p;
  const duration = r.endAt ? minutesBetween(r.startAt, r.endAt) : 0;
  const fields = boardingFields(r);
  return (
    <li className="card ticket" data-testid="reservation">
      <div className="ticket-band">
        <span className="ticket-label">Billet</span>
        <span className="ticket-kind">{RESERVATION_LABELS[r.type]}</span>
      </div>
      <div className="ticket-body">
        <div className="bp-route">
          <div className="bp-end">
            <Place code={r.departureCode} name={r.fromPlace?.title ?? r.title} />
            <span className="bp-when muted">{formatDate(r.startAt.date)} · {r.startAt.time}</span>
          </div>
          <div className="bp-mid">
            <PlaneIcon />
            {duration > 0 && <span className="bp-duration muted">{formatDuration(duration)}</span>}
          </div>
          {r.endAt && (
            <div className="bp-end bp-end-right">
              <Place code={r.arrivalCode} name={r.toPlace?.title ?? r.title} />
              <span className="bp-when muted">{formatDate(r.endAt.date)} · {r.endAt.time}</span>
            </div>
          )}
        </div>
        {fields.length > 0 && (
          <dl className="bp-fields">
            {fields.map((f) => (
              <div key={f.label}>
                <dt>{f.label}</dt>
                <dd><strong>{f.value}</strong>{f.copy && <> <CopyButton value={f.value} label="Copier le n°" /></>}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
      <div className="ticket-stub">
        <Alert inTrip={p.inTrip} />
        <Extras r={r} />
        <Actions onEdit={p.onEdit} onDelete={p.onDelete} disabled={p.disabled} />
      </div>
    </li>
  );
}

function SimpleCard(p: Props) {
  const { r } = p;
  return (
    <li className="card ticket ticket-simple" data-testid="reservation">
      <div className="ticket-body">
        <div className="day-head">
          <strong><span aria-hidden="true">{ICON[r.type]}</span> {r.title}</strong>
          <span className="badge">{RESERVATION_LABELS[r.type]}</span>
        </div>
        <p className="muted">{when(r)}</p>
        {(r.fromPlace || r.toPlace) && (
          <p className="muted">{[r.fromPlace?.title, r.toPlace?.title].filter(Boolean).join(' → ')}</p>
        )}
        {r.confirmationNumber && (
          <p>N° <strong>{r.confirmationNumber}</strong> <CopyButton value={r.confirmationNumber} label="Copier le n°" /></p>
        )}
      </div>
      <div className="ticket-stub">
        <Alert inTrip={p.inTrip} />
        <Extras r={r} />
        <Actions onEdit={p.onEdit} onDelete={p.onDelete} disabled={p.disabled} />
      </div>
    </li>
  );
}

export function ReservationCard(p: Props) {
  return p.r.type === 'flight' ? <BoardingPass {...p} /> : <SimpleCard {...p} />;
}
