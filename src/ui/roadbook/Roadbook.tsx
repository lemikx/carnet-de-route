import type { ReactNode } from 'react';
import { formatDate, formatDayLabel, formatDistance, formatDuration } from '../../domain/format';
import type { Roadbook as RoadbookData, RoadbookDay } from '../../domain/roadbook';
import { findLeg } from '../../domain/schedule';
import type { Leg, Reservation } from '../../domain/types';
import { appleMapsUrl } from '../map/appleMaps';
import { safeHref } from '../common/safeHref';
import { MapView } from '../map/MapView';
import { CONTACT_LABELS, MODE_LABELS, RESERVATION_LABELS } from '../trip/labels';
import { CHECKLIST_CATEGORIES } from '../../domain/checklist';

const MODE_ICON: Record<Leg['mode'], string> = { car: '🚗', walk: '🚶', bike: '🚲', train: '🚆', bus: '🚌', plane: '✈️', ferry: '⛴️', other: '➡️' };

function Address({ text }: { text: string }) {
  if (!text) return null;
  return <a href={appleMapsUrl(text)} target="_blank" rel="noreferrer">{text}</a>;
}

function LegLine({ leg }: { leg: Leg }) {
  return (
    <div className="rb-leg">
      {MODE_ICON[leg.mode]} {MODE_LABELS[leg.mode]}
      {leg.durationMin !== null ? ` · ${formatDuration(leg.durationMin)}` : ' · durée inconnue'}
      {leg.distanceKm !== null && ` · ${formatDistance(leg.distanceKm)}`}
    </div>
  );
}

function when(r: Reservation) {
  const start = `${formatDate(r.startAt.date)} ${r.startAt.time}`;
  return r.endAt ? `${start} → ${formatDate(r.endAt.date)} ${r.endAt.time}` : start;
}

function Day({ d, onTilesLoaded }: { d: RoadbookDay; onTilesLoaded?(): void }) {
  const timing = new Map(d.schedule.timings.map((t) => [t.stopId, t]));
  const outgoing = d.stops.length ? d.legs.find((l) => l.fromStopId === d.stops[d.stops.length - 1].id) : undefined;
  return (
    <section className="rb-day" data-testid="roadbook-day">
      <h2>
        <span className="rb-date">{formatDayLabel(d.day.date)}</span>
        {d.day.title && <span> — {d.day.title}</span>}
      </h2>
      {d.day.note && <p>{d.day.note}</p>}
      {d.stops.length === 0 ? (
        <p className="muted">Aucune étape prévue</p>
      ) : (
        <>
          <MapView points={d.stops.map((s) => ({ lat: s.lat, lon: s.lon, label: s.title }))}
            lines={d.legs.filter((l) => d.stops.some((s) => s.id === l.toStopId)).map((l) => l.geometry ?? [])} height={220} onTilesLoaded={onTilesLoaded} />
          {d.schedule.heavy && <p className="alert">{formatDuration(d.schedule.travelMinutes)} de trajet ce jour-là</p>}
          <ol className="rb-program">
            {d.stops.map((s, i) => {
              const t = timing.get(s.id);
              const next = d.stops[i + 1];
              const leg = next ? findLeg(d.legs, s, next) : undefined;
              const time = s.startTime ?? (t?.estimatedArrival ? `~${t.estimatedArrival.time}` : '');
              return (
                <li key={s.id}>
                  <div className="rb-stop">
                    <span className="rb-time">{time}</span>
                    <div>
                      <strong>{s.title}</strong>
                      {s.durationMin ? <span className="muted"> · {formatDuration(s.durationMin)} sur place</span> : null}
                      <div className="muted"><Address text={s.address} /></div>
                      {s.phone && <div><a href={`tel:${s.phone}`}>{s.phone}</a></div>}
                      {s.url && <div>{safeHref(s.url) ? <a href={safeHref(s.url)!} target="_blank" rel="noreferrer">{s.url}</a> : s.url}</div>}
                      {s.note && <div>{s.note}</div>}
                      {t && t.conflictMinutes > 0 && t.estimatedArrival && (
                        <p className="alert">Arrivée estimée à {t.estimatedArrival.time}, après l’heure prévue ({s.startTime}).</p>
                      )}
                    </div>
                  </div>
                  {leg && <LegLine leg={leg} />}
                </li>
              );
            })}
          </ol>
          {outgoing && <LegLine leg={outgoing} />}
        </>
      )}
      {d.lodging && (
        <div className="rb-lodging">
          <h3>🏨 Nuit : {d.lodging.title}</h3>
          <div><Address text={d.lodging.address} /></div>
          {(d.lodging.phone || d.lodgingReservation?.phone) && (
            <div><a href={`tel:${d.lodging.phone || d.lodgingReservation?.phone}`}>{d.lodging.phone || d.lodgingReservation?.phone}</a></div>
          )}
          {d.lodgingReservation?.confirmationNumber && <div>Réservation n° <strong>{d.lodgingReservation.confirmationNumber}</strong></div>}
        </div>
      )}
    </section>
  );
}

export function Roadbook({ roadbook, banner, onTilesLoaded }: { roadbook: RoadbookData; banner?: ReactNode; onTilesLoaded?(): void }) {
  const { trip } = roadbook;
  const allStops = roadbook.days.flatMap((d) => d.stops);
  return (
    <article className="roadbook">
      {banner}
      <section className="rb-cover">
        <p className="rb-kicker">Roadbook</p>
        <h1>{trip.name}</h1>
        <p className="rb-dates">{formatDate(trip.startDate)} → {formatDate(trip.endDate)} · {roadbook.days.length} jours</p>
        {trip.countries.length > 0 && <p>{trip.countries.join(', ')}</p>}
        <p className="muted">
          {formatDuration(roadbook.totals.travelMinutes)} de trajets prévus
          {roadbook.totals.distanceKm > 0 && ` · ${formatDistance(roadbook.totals.distanceKm)}`}
        </p>
        <MapView points={allStops.map((s) => ({ lat: s.lat, lon: s.lon, label: s.title }))}
          lines={roadbook.days.flatMap((d) => d.legs.map((l) => l.geometry ?? []))} height={320} onTilesLoaded={onTilesLoaded} />
      </section>

      <section className="rb-overview">
        <h2>Vue d’ensemble</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Jour</th><th>Étape</th><th>Nuit</th><th>Trajets</th></tr>
            </thead>
            <tbody>
              {roadbook.overview.map((o) => (
                <tr key={o.date}>
                  <td>{formatDate(o.date)}</td>
                  <td>{o.title || '—'}</td>
                  <td>{o.lodgingTitle ?? '—'}</td>
                  <td>{o.travelMinutes ? formatDuration(o.travelMinutes) : '—'}{o.distanceKm ? ` · ${formatDistance(o.distanceKm)}` : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {roadbook.days.map((d) => <Day key={d.day.id} d={d} onTilesLoaded={onTilesLoaded} />)}

      <section className="rb-annex">
        <h2>Réservations</h2>
        {roadbook.reservations.length === 0 ? <p className="muted">Aucune réservation.</p> : (
          <ul className="rb-list">
            {roadbook.reservations.map((r) => (
              <li key={r.id}>
                <strong>{r.title}</strong> <span className="muted">({RESERVATION_LABELS[r.type]})</span>
                <div>{when(r)}</div>
                {(r.fromPlace || r.toPlace) && <div className="muted">{[r.fromPlace?.address, r.toPlace?.address].filter(Boolean).join(' → ')}</div>}
                {r.confirmationNumber && <div>N° <strong>{r.confirmationNumber}</strong></div>}
                {r.phone && <div><a href={`tel:${r.phone}`}>{r.phone}</a></div>}
                {safeHref(r.url) && <div><a href={safeHref(r.url)!} target="_blank" rel="noreferrer">Voir la réservation</a></div>}
                {r.note && <div>{r.note}</div>}
              </li>
            ))}
          </ul>
        )}

        <h2>Checklist</h2>
        {CHECKLIST_CATEGORIES.map((c) => {
          const items = roadbook.checklist.filter((i) => i.category === c.id);
          if (!items.length) return null;
          return (
            <div key={c.id}>
              <h3>{c.label}</h3>
              <ul className="rb-checklist">
                {items.map((i) => <li key={i.id}>{i.done ? '☑' : '☐'} {i.label}{i.dueDate ? ` (avant le ${formatDate(i.dueDate)})` : ''}</li>)}
              </ul>
            </div>
          );
        })}

        <h2>Contacts utiles</h2>
        {roadbook.contacts.length === 0 ? <p className="muted">Aucun contact.</p> : (
          <ul className="rb-list">
            {roadbook.contacts.map((c) => (
              <li key={c.id}>
                <strong>{c.name}</strong> <span className="muted">({CONTACT_LABELS[c.kind]})</span>
                {c.phone && <div><a href={`tel:${c.phone}`}>{c.phone}</a></div>}
                {c.address && <div><Address text={c.address} /></div>}
                {c.note && <div>{c.note}</div>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </article>
  );
}
