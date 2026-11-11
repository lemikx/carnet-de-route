import { useCallback, useMemo, useState } from 'react';
import {
  closestCenter, DndContext, KeyboardSensor, PointerSensor, TouchSensor, useDroppable, useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useApp } from '../../app/AppContext';
import { formatDayLabel, formatDuration } from '../../domain/format';
import { orderedStops } from '../../domain/legs';
import { computeDaySchedule, findLeg, type StopTiming } from '../../domain/schedule';
import type { Day, Leg, Stop, TripBundle } from '../../domain/types';
import { useOnline } from '../../offline/useOnline';
import type { StopInput } from '../../services/tripService';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { SaveError } from '../common/SaveError';
import { useSave } from '../common/useSave';
import { appleMapsUrl } from '../map/appleMaps';
import { MapView } from '../map/MapView';
import { KIND_LABELS } from './labels';
import { LegRow } from './LegRow';
import { StopEditor } from './StopEditor';
import type { TripTabProps } from './types';

type Editing = { dayId: string; stop?: Stop } | null;

function StopCard({
  stop, timing, disabled, index, count, onEdit, onDelete, onMove,
}: {
  stop: Stop;
  timing?: StopTiming;
  disabled: boolean;
  index: number;
  count: number;
  onEdit(): void;
  onDelete(): void;
  onMove(delta: number): void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: stop.id, disabled });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.6 : 1 };
  const eta = timing?.estimatedArrival;
  return (
    <li ref={setNodeRef} style={style} className="stop" data-testid="stop">
      <button type="button" className="drag-handle" aria-label={`Déplacer ${stop.title}`} {...attributes} {...listeners} disabled={disabled}>⋮⋮</button>
      <div className="stop-main">
        <div className="stop-title">{stop.title}</div>
        <div className="stop-meta">
          {stop.startTime && <span>🕘 {stop.startTime}</span>}
          {!stop.startTime && eta && <span>arrivée estimée ~{eta.time}</span>}
          {stop.durationMin !== null && stop.durationMin > 0 && <span>⏱ {formatDuration(stop.durationMin)}</span>}
          {stop.kind !== 'activity' && <span className="badge">{KIND_LABELS[stop.kind]}</span>}
          {stop.reservationId && <span className="badge">réservation</span>}
          {stop.lat === null && <span className="badge">sans carte</span>}
        </div>
        {stop.address && (
          <a href={appleMapsUrl(stop.address)} target="_blank" rel="noreferrer" className="stop-meta">{stop.address}</a>
        )}
        {timing && timing.conflictMinutes > 0 && eta && (
          <p className="alert" role="alert">Tu arrives à {eta.time}, {stop.title} commence à {stop.startTime}</p>
        )}
      </div>
      <div className="trip-actions">
        <button type="button" className="btn btn-small" aria-label={`Monter ${stop.title}`} disabled={disabled || index === 0} onClick={() => onMove(-1)}>↑</button>
        <button type="button" className="btn btn-small" aria-label={`Descendre ${stop.title}`} disabled={disabled || index === count - 1} onClick={() => onMove(1)}>↓</button>
        <button type="button" className="btn btn-small" onClick={onEdit} disabled={disabled}>Modifier</button>
        <button type="button" className="btn btn-small btn-danger-text" onClick={onDelete} disabled={disabled}>Supprimer</button>
      </div>
    </li>
  );
}

function DayDrop({ id, children }: { id: string; children: React.ReactNode }) {
  const { setNodeRef } = useDroppable({ id: `day:${id}` });
  return <ul ref={setNodeRef} className="stops">{children}</ul>;
}

export function ItineraryTab({ bundle, setBundle }: TripTabProps) {
  const { service, routing, repo, settings } = useApp();
  const online = useOnline();
  const [editing, setEditing] = useState<Editing>(null);
  const [deleting, setDeleting] = useState<Stop | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const apply = useCallback(async (p: Promise<TripBundle>) => setBundle(await p), [setBundle]);
  const action = useSave(apply);
  const busy = action.saving || !online;

  const days = useMemo(() => [...bundle.days].sort((a, b) => a.date.localeCompare(b.date)), [bundle.days]);
  const stopsOf = (dayId: string) => bundle.stops.filter((s) => s.dayId === dayId).sort((a, b) => a.position - b.position);
  const all = orderedStops(bundle.days, bundle.stops);
  const stopById = new Map(bundle.stops.map((s) => [s.id, s]));
  const defaultTz = all.at(-1)?.timezone ?? bundle.trip.homeTimezone;

  function save(dayId: string, input: StopInput, existing?: Stop) {
    setEditing(null);
    void action.run(existing ? service.updateStop({ ...existing, ...input }) : service.addStop(dayId, input));
  }

  function onDragEnd(e: DragEndEvent) {
    const activeId = String(e.active.id);
    const overId = e.over ? String(e.over.id) : null;
    if (!overId || overId === activeId) return;
    let toDay: string;
    let toIndex: number;
    if (overId.startsWith('day:')) {
      toDay = overId.slice(4);
      toIndex = stopsOf(toDay).filter((s) => s.id !== activeId).length;
    } else {
      const over = stopById.get(overId)!;
      toDay = over.dayId;
      toIndex = stopsOf(toDay).filter((s) => s.id !== activeId).findIndex((s) => s.id === overId);
      const active = stopById.get(activeId)!;
      if (active.dayId === toDay && active.position < over.position) toIndex += 1;
    }
    void action.run(service.moveStop(activeId, toDay, toIndex));
  }

  function move(day: Day, stop: Stop, delta: number) {
    const list = stopsOf(day.id);
    const i = list.findIndex((s) => s.id === stop.id);
    void action.run(service.moveStop(stop.id, day.id, i + delta));
  }

  async function renameDay(day: Day, title: string) {
    if (title === day.title) return;
    await action.run(repo.updateDay({ ...day, title }).then(() => repo.getBundle(bundle.trip.id)));
  }

  const legLines = (legs: Leg[]) => legs.map((l) => l.geometry ?? []).filter((g) => g.length > 1);

  return (
    <div>
      <MapView points={all.map((s) => ({ lat: s.lat, lon: s.lon, label: s.title }))} lines={legLines(bundle.legs)} height={280} />
      <SaveError error={action.error} onRetry={action.retry} />
      {action.saving && <p className="muted" role="status">Enregistrement et calcul des trajets…</p>}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        {days.map((day) => {
          const stops = stopsOf(day.id);
          const schedule = computeDaySchedule(day, stops, bundle.legs, settings.heavyThresholdMin);
          const timing = new Map(schedule.timings.map((t) => [t.stopId, t]));
          const outgoing = stops.length ? bundle.legs.find((l) => l.fromStopId === stops[stops.length - 1].id) : undefined;
          const dayLegs = bundle.legs.filter((l) => stops.some((s) => s.id === l.fromStopId));
          return (
            <section key={day.id} className="day" aria-label={formatDayLabel(day.date)}>
              <div className="day-head">
                <h2>{formatDayLabel(day.date)}</h2>
                <input className="day-title-input" aria-label="Titre du jour" placeholder="Titre (ex. Kyoto)" defaultValue={day.title}
                  disabled={busy} onBlur={(e) => renameDay(day, e.target.value.trim())} />
              </div>
              {stops.length > 1 && <MapView points={stops.map((s) => ({ lat: s.lat, lon: s.lon, label: s.title }))} lines={legLines(dayLegs)} height={200} />}
              {schedule.heavy && <p className="alert" role="alert">{formatDuration(schedule.travelMinutes)} de trajet ce jour-là</p>}
              <SortableContext items={stops.map((s) => s.id)} strategy={verticalListSortingStrategy}>
                <DayDrop id={day.id}>
                  {stops.length === 0 && <li className="muted">Aucune étape prévue</li>}
                  {stops.map((s, i) => {
                    const next = stops[i + 1];
                    const leg = next ? findLeg(bundle.legs, s, next) : undefined;
                    return (
                      <div key={s.id}>
                        {editing?.stop?.id === s.id ? (
                          <StopEditor routing={routing} initial={s} defaultTimezone={defaultTz} disabled={busy}
                            onSave={(input) => save(day.id, input, s)} onCancel={() => setEditing(null)} />
                        ) : (
                          <StopCard stop={s} timing={timing.get(s.id)} disabled={busy} index={i} count={stops.length}
                            onEdit={() => setEditing({ dayId: day.id, stop: s })} onDelete={() => setDeleting(s)} onMove={(d) => move(day, s, d)} />
                        )}
                        {leg && next && (
                          <LegRow leg={leg} from={s} to={next} disabled={busy}
                            onMode={(m) => action.run(service.setLegMode(leg.id, m))}
                            onDuration={(min) => action.run(service.setLegManual(leg.id, leg.mode, min))} />
                        )}
                      </div>
                    );
                  })}
                </DayDrop>
              </SortableContext>
              {outgoing && stopById.get(outgoing.toStopId) && (
                <LegRow leg={outgoing} from={stops[stops.length - 1]} to={stopById.get(outgoing.toStopId)!} disabled={busy}
                  onMode={(m) => action.run(service.setLegMode(outgoing.id, m))}
                  onDuration={(min) => action.run(service.setLegManual(outgoing.id, outgoing.mode, min))} />
              )}
              {editing && !editing.stop && editing.dayId === day.id ? (
                <StopEditor routing={routing} defaultTimezone={defaultTz} disabled={busy}
                  onSave={(input) => save(day.id, input)} onCancel={() => setEditing(null)} />
              ) : (
                <button type="button" className="btn btn-small" style={{ marginTop: 8 }} disabled={busy}
                  onClick={() => setEditing({ dayId: day.id })}>
                  Ajouter une étape
                </button>
              )}
            </section>
          );
        })}
      </DndContext>
      {deleting && (
        <ConfirmDialog title={`Supprimer « ${deleting.title} » ?`} confirmLabel="Supprimer" danger
          onConfirm={() => {
            const id = deleting.id;
            setDeleting(null);
            void action.run(service.removeStop(id));
          }}
          onCancel={() => setDeleting(null)}>
          {deleting.reservationId && <p>Cette étape vient d’une réservation : elle sera recréée si tu modifies la réservation.</p>}
        </ConfirmDialog>
      )}
    </div>
  );
}
