import { useState, type FormEvent } from 'react';
import type { Stop, StopKind } from '../../domain/types';
import type { RoutingService } from '../../routing/RoutingService';
import type { StopInput } from '../../services/tripService';
import { AddressInput } from './AddressInput';
import { KIND_LABELS } from './labels';

export function StopEditor({
  routing, initial, defaultTimezone, disabled, onSave, onCancel,
}: {
  routing: RoutingService;
  initial?: Stop;
  defaultTimezone: string;
  disabled?: boolean;
  onSave(s: StopInput): void;
  onCancel(): void;
}) {
  const [v, setV] = useState<StopInput>(() => ({
    kind: initial?.kind ?? 'activity',
    title: initial?.title ?? '',
    address: initial?.address ?? '',
    lat: initial?.lat ?? null,
    lon: initial?.lon ?? null,
    timezone: initial?.timezone ?? defaultTimezone,
    startTime: initial?.startTime ?? null,
    durationMin: initial?.durationMin ?? null,
    note: initial?.note ?? '',
    phone: initial?.phone ?? '',
    url: initial?.url ?? '',
    reservationId: initial?.reservationId ?? null,
  }));
  const [error, setError] = useState<string | null>(null);
  const located = v.lat !== null && v.lon !== null;

  function submit(e: FormEvent) {
    e.preventDefault();
    const title = v.title.trim() || v.address.split(',')[0].trim();
    if (!title) return setError('Donne un nom à l’étape.');
    onSave({ ...v, title });
  }

  return (
    <form className="card form" onSubmit={submit}>
      <label>
        Nom de l’étape
        <input value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} placeholder="Ex. Pavillon d’or" />
      </label>
      <AddressInput
        routing={routing}
        value={v.address}
        onChange={(address) => setV((s) => ({ ...s, address, lat: null, lon: null }))}
        onPick={(r) => setV((s) => ({ ...s, address: r.label, lat: r.lat, lon: r.lon, timezone: r.timezone }))}
      />
      {located && <p className="muted">📍 Position trouvée</p>}
      <div className="row">
        <label>
          Type
          <select value={v.kind} onChange={(e) => setV({ ...v, kind: e.target.value as StopKind })}>
            {Object.entries(KIND_LABELS).map(([k, l]) => (
              <option key={k} value={k}>{l}</option>
            ))}
          </select>
        </label>
        <label>
          Heure (facultatif)
          <input type="time" value={v.startTime ?? ''} onChange={(e) => setV({ ...v, startTime: e.target.value || null })} />
        </label>
        <label>
          Durée sur place (min)
          <input type="number" min={0} inputMode="numeric" value={v.durationMin ?? ''}
            onChange={(e) => setV({ ...v, durationMin: e.target.value === '' ? null : Math.max(0, Number(e.target.value)) })} />
        </label>
      </div>
      <div className="row">
        <label>
          Téléphone
          <input type="tel" value={v.phone} onChange={(e) => setV({ ...v, phone: e.target.value })} />
        </label>
        <label>
          Lien
          <input type="url" value={v.url} onChange={(e) => setV({ ...v, url: e.target.value })} placeholder="https://" />
        </label>
      </div>
      <label>
        Note
        <textarea rows={2} value={v.note} onChange={(e) => setV({ ...v, note: e.target.value })} />
      </label>
      {error && <p role="alert" className="field-error">{error}</p>}
      <div className="form-actions">
        <button type="button" className="btn" onClick={onCancel}>Annuler</button>
        <button type="submit" className="btn btn-primary" disabled={disabled}>
          {located ? (initial ? 'Enregistrer' : 'Ajouter l’étape') : initial ? 'Enregistrer sans carte' : 'Ajouter sans carte'}
        </button>
      </div>
    </form>
  );
}
