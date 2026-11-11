import { useState, type FormEvent } from 'react';
import { toInstant } from '../../domain/time';
import type { PlaceRef, Reservation, ReservationType } from '../../domain/types';
import type { New } from '../../data/TripRepository';
import type { LatLon, RoutingService } from '../../routing/RoutingService';
import { AddressInput } from './AddressInput';
import { RESERVATION_LABELS } from './labels';

type Draft = New<Reservation> & { id?: string };

const TRANSPORT: ReservationType[] = ['flight', 'train'];

export function ReservationForm({
  routing, tripId, initial, defaultTimezone, disabled, focus, onSave, onCancel,
}: {
  routing: RoutingService;
  tripId: string;
  initial?: Reservation;
  defaultTimezone: string;
  disabled?: boolean;
  focus?: LatLon;
  onSave(r: Draft): void;
  onCancel(): void;
}) {
  const [type, setType] = useState<ReservationType>(initial?.type ?? 'activity');
  const [title, setTitle] = useState(initial?.title ?? '');
  const [startDate, setStartDate] = useState(initial?.startAt.date ?? '');
  const [startTime, setStartTime] = useState(initial?.startAt.time ?? '');
  const [endDate, setEndDate] = useState(initial?.endAt?.date ?? '');
  const [endTime, setEndTime] = useState(initial?.endAt?.time ?? '');
  const [fromPlace, setFromPlace] = useState<PlaceRef | null>(initial?.fromPlace ?? null);
  const [toPlace, setToPlace] = useState<PlaceRef | null>(initial?.toPlace ?? null);
  const [confirmationNumber, setConfirmation] = useState(initial?.confirmationNumber ?? '');
  const [price, setPrice] = useState(initial?.price?.toString() ?? '');
  const [currency, setCurrency] = useState(initial?.currency ?? 'EUR');
  const [url, setUrl] = useState(initial?.url ?? '');
  const [phone, setPhone] = useState(initial?.phone ?? '');
  const [note, setNote] = useState(initial?.note ?? '');
  const [error, setError] = useState<string | null>(null);

  const isTransport = TRANSPORT.includes(type);
  const isLodging = type === 'lodging';

  const place = (setter: (p: PlaceRef | null) => void, current: PlaceRef | null) => ({
    onChange: (text: string) => setter(text ? { title: current?.title ?? text, address: text, lat: null, lon: null, timezone: current?.timezone ?? defaultTimezone } : null),
    onPick: (r: { label: string; lat: number; lon: number; timezone: string }) =>
      setter({ title: r.label.split(',')[0].split(' — ')[0], address: r.label, lat: r.lat, lon: r.lon, timezone: r.timezone }),
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim() || !startDate || !startTime) return setError('Indique un titre, une date et une heure.');
    const startTz = (isLodging ? toPlace : fromPlace)?.timezone ?? defaultTimezone;
    const endTz = (isTransport ? toPlace?.timezone : undefined) ?? startTz;
    const startAt = { date: startDate, time: startTime, timezone: startTz };
    const endAt = endDate ? { date: endDate, time: endTime || '12:00', timezone: endTz } : null;
    if (isTransport && !endAt) return setError('Indique la date et l’heure d’arrivée.');
    if (endAt && toInstant(endAt) <= toInstant(startAt)) return setError('L’arrivée doit être après le départ');
    setError(null);
    onSave({
      ...(initial ? { id: initial.id } : {}),
      tripId, type, title: title.trim(), startAt, endAt,
      fromPlace: isLodging ? null : fromPlace, toPlace: isLodging || isTransport ? toPlace : null,
      confirmationNumber: confirmationNumber.trim(), price: price === '' ? null : Number(price), currency: currency.toUpperCase(),
      url: url.trim(), phone: phone.trim(), note,
    });
  }

  return (
    <form className="card form" onSubmit={submit}>
      <div className="row">
        <label>
          Type
          <select value={type} onChange={(e) => setType(e.target.value as ReservationType)}>
            {Object.entries(RESERVATION_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label>
          Titre
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={isTransport ? 'Ex. AF276' : 'Ex. Hôtel Sakura'} />
        </label>
      </div>
      {isLodging ? (
        <AddressInput routing={routing} focus={focus} label="Adresse de l’hébergement" value={toPlace?.address ?? ''} {...place(setToPlace, toPlace)} />
      ) : (
        <AddressInput routing={routing} focus={focus} label={isTransport ? 'Lieu de départ' : 'Lieu'} value={fromPlace?.address ?? ''} {...place(setFromPlace, fromPlace)} />
      )}
      {isTransport && <AddressInput routing={routing} focus={focus} label="Lieu d’arrivée" value={toPlace?.address ?? ''} {...place(setToPlace, toPlace)} />}
      <div className="row">
        <label>
          {isLodging ? 'Date de check-in' : 'Date de départ'}
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </label>
        <label>
          {isLodging ? 'Heure de check-in' : 'Heure de départ'}
          <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
        </label>
      </div>
      <div className="row">
        <label>
          {isLodging ? 'Date de check-out' : isTransport ? 'Date d’arrivée' : 'Date de fin (facultatif)'}
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </label>
        <label>
          {isLodging ? 'Heure de check-out' : isTransport ? 'Heure d’arrivée' : 'Heure de fin'}
          <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
        </label>
      </div>
      <div className="row">
        <label>
          N° de confirmation
          <input value={confirmationNumber} onChange={(e) => setConfirmation(e.target.value)} />
        </label>
        <label>
          Prix
          <input type="number" min={0} step="0.01" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
        </label>
        <label>
          Devise
          <input value={currency} maxLength={3} onChange={(e) => setCurrency(e.target.value)} />
        </label>
      </div>
      <div className="row">
        <label>
          Lien de la réservation
          <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" />
        </label>
        <label>
          Téléphone
          <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </label>
      </div>
      <label>
        Note
        <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
      {error && <p role="alert" className="field-error">{error}</p>}
      <div className="form-actions">
        <button type="button" className="btn" onClick={onCancel}>Annuler</button>
        <button type="submit" className="btn btn-primary" disabled={disabled}>Enregistrer</button>
      </div>
    </form>
  );
}
