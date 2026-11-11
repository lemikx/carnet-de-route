import { useEffect, useState } from 'react';
import { formatDistance, formatDuration } from '../../domain/format';
import { AUTO_MODES, type Leg, type Stop, type TravelMode } from '../../domain/types';
import { appleMapsDirectionsUrl } from '../map/appleMaps';
import { MODE_LABELS } from './labels';

export function LegRow({
  leg, from, to, disabled, onMode, onDuration,
}: {
  leg: Leg;
  from: Stop;
  to: Stop;
  disabled: boolean;
  onMode(mode: TravelMode): void;
  onDuration(min: number | null): void;
}) {
  const [value, setValue] = useState(leg.durationMin?.toString() ?? '');
  useEffect(() => setValue(leg.durationMin?.toString() ?? ''), [leg.durationMin]);
  const computed = AUTO_MODES.includes(leg.mode) && leg.source === 'auto' && leg.durationMin !== null && !leg.error;
  const fromAddr = from.address || from.title;
  const toAddr = to.address || to.title;

  function commit() {
    const n = value.trim() === '' ? null : Math.max(0, Math.round(Number(value)));
    if (n !== null && Number.isNaN(n)) return;
    if (n !== leg.durationMin) onDuration(n);
  }

  return (
    <div className="leg" data-testid="leg">
      <select aria-label="Mode de transport" value={leg.mode} disabled={disabled || leg.source === 'reservation'}
        onChange={(e) => onMode(e.target.value as TravelMode)}>
        {Object.entries(MODE_LABELS).map(([k, v]) => (
          <option key={k} value={k}>{v}</option>
        ))}
      </select>
      {computed ? (
        <span>{formatDuration(leg.durationMin!)}{leg.distanceKm !== null && ` · ${formatDistance(leg.distanceKm)}`}</span>
      ) : leg.source === 'reservation' ? (
        <span>{leg.durationMin !== null ? formatDuration(leg.durationMin) : '—'} <span className="badge">réservation</span></span>
      ) : (
        <label className="checkbox">
          <span className="sr-only">Durée du trajet (min)</span>
          <input aria-label="Durée du trajet (min)" type="number" min={0} inputMode="numeric" placeholder="min" value={value} disabled={disabled}
            onChange={(e) => setValue(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && commit()} />
          <span>min</span>
        </label>
      )}
      {leg.source === 'manual' && AUTO_MODES.includes(leg.mode) && <span className="badge">saisi</span>}
      <a href={appleMapsDirectionsUrl(fromAddr, toAddr, leg.mode)} target="_blank" rel="noreferrer">Itinéraire</a>
      {computed && !disabled && (
        <button type="button" className="btn-link" onClick={() => onDuration(leg.durationMin)}>Corriger</button>
      )}
      {leg.error && <span className="leg-error">{leg.error}</span>}
    </div>
  );
}
