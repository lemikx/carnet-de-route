import { DEFAULT_CHECKLIST } from '../domain/checklist';
import { datesBetween, diffDays } from '../domain/days';
import { canAutoCompute, orderedStops, planLegs } from '../domain/legs';
import { reservationToStops } from '../domain/reservations';
import { coordKey, toInstant } from '../domain/time';
import {
  AUTO_MODES, type Day, type Leg, type Reservation, type Stop, type TravelMode, type Trip, type TripBundle,
} from '../domain/types';
import type { New, TripRepository } from '../data/TripRepository';
import { RoutingError, type AutoMode, type RoutingService } from '../routing/RoutingService';

export class NeedsConfirmationError extends Error {
  constructor(public days: Day[]) {
    super('Des jours à supprimer contiennent des lieux');
    this.name = 'NeedsConfirmationError';
  }
}

export type StopInput = Omit<Stop, 'id' | 'dayId' | 'position'>;

export interface TripService {
  createTrip(t: New<Trip>): Promise<TripBundle>;
  duplicateTrip(id: string, newName: string): Promise<TripBundle>;
  changeDates(tripId: string, start: string, end: string, opts?: { confirm?: boolean }): Promise<TripBundle>;
  addStop(dayId: string, s: StopInput): Promise<TripBundle>;
  updateStop(s: Stop): Promise<TripBundle>;
  removeStop(id: string): Promise<TripBundle>;
  moveStop(stopId: string, toDayId: string, toIndex: number): Promise<TripBundle>;
  setLegManual(legId: string, mode: TravelMode, durationMin: number | null): Promise<TripBundle>;
  setLegMode(legId: string, mode: TravelMode): Promise<TripBundle>;
  saveReservation(r: Reservation | New<Reservation>): Promise<TripBundle>;
  deleteReservation(id: string): Promise<TripBundle>;
  syncLegs(tripId: string): Promise<TripBundle>;
}

export const ROUTING_MESSAGES: Record<string, string> = {
  NO_ROUTE: 'Aucun trajet routier possible (mer ?). Choisis ferry ou avion, ou saisis la durée.',
  QUOTA: 'Calcul indisponible pour aujourd’hui. Saisis la durée à la main.',
  NETWORK: 'Calcul impossible : vérifie ta connexion.',
  UNAUTHORIZED: 'Calcul impossible : reconnecte-toi.',
  NOT_FOUND: 'Adresse introuvable. Saisis la durée à la main.',
};

const emptyLeg = (fromStopId: string, toStopId: string, mode: TravelMode): New<Leg> => ({
  fromStopId, toStopId, mode, durationMin: null, distanceKm: null, geometry: null,
  source: AUTO_MODES.includes(mode) ? 'auto' : 'manual', error: null, computedAt: null, fromKey: null, toKey: null,
});

export function createTripService(repo: TripRepository, routing: RoutingService): TripService {
  async function tripIdOfDay(dayId: string): Promise<{ tripId: string; bundle: TripBundle }> {
    for (const t of await repo.listTrips()) {
      const bundle = await repo.getBundle(t.id);
      if (bundle.days.some((d) => d.id === dayId)) return { tripId: t.id, bundle };
    }
    throw new Error('Jour introuvable');
  }
  async function findBy(pred: (b: TripBundle) => boolean): Promise<TripBundle> {
    for (const t of await repo.listTrips()) {
      const bundle = await repo.getBundle(t.id);
      if (pred(bundle)) return bundle;
    }
    throw new Error('Élément introuvable');
  }

  async function compute(leg: Leg, from: Stop, to: Stop): Promise<void> {
    const base = { ...leg, fromKey: coordKey(from.lat, from.lon), toKey: coordKey(to.lat, to.lon), computedAt: new Date().toISOString() };
    try {
      const r = await routing.route({ lat: from.lat!, lon: from.lon! }, { lat: to.lat!, lon: to.lon! }, leg.mode as AutoMode);
      await repo.saveLeg({ ...base, durationMin: r.durationMin, distanceKm: r.distanceKm, geometry: r.geometry, error: null });
    } catch (e) {
      const code = e instanceof RoutingError ? e.code : 'NETWORK';
      await repo.saveLeg({ ...base, durationMin: null, distanceKm: null, geometry: null, error: ROUTING_MESSAGES[code] ?? ROUTING_MESSAGES.NETWORK });
    }
  }

  async function syncLegs(tripId: string): Promise<TripBundle> {
    const bundle = await repo.getBundle(tripId);
    const stops = orderedStops(bundle.days, bundle.stops);
    const byId = new Map(stops.map((s) => [s.id, s]));

    // Trajets imposés par les réservations (vol, train) : départ → arrivée.
    const reserved = new Map<string, { mode: TravelMode; durationMin: number }>();
    for (const r of bundle.reservations) {
      const leg = reservationToStops(r).leg;
      const linked = stops.filter((s) => s.reservationId === r.id);
      if (leg && linked.length === 2) reserved.set(`${linked[0].id}>${linked[1].id}`, leg);
    }

    const plan = planLegs(stops, bundle.legs);
    await repo.deleteLegs(plan.remove.map((l) => l.id));

    for (const c of plan.create) {
      const res = reserved.get(`${c.fromStopId}>${c.toStopId}`);
      if (res) {
        await repo.saveLeg({ ...emptyLeg(c.fromStopId, c.toStopId, res.mode), source: 'reservation', durationMin: res.durationMin });
        continue;
      }
      const leg = await repo.saveLeg(emptyLeg(c.fromStopId, c.toStopId, c.mode));
      const from = byId.get(c.fromStopId)!;
      const to = byId.get(c.toStopId)!;
      if (canAutoCompute(leg, from, to)) await compute(leg, from, to);
    }

    const removed = new Set(plan.remove.map((l) => l.id));
    for (const leg of bundle.legs) {
      if (removed.has(leg.id)) continue;
      const res = reserved.get(`${leg.fromStopId}>${leg.toStopId}`);
      if (res && (leg.source !== 'reservation' || leg.durationMin !== res.durationMin || leg.mode !== res.mode)) {
        await repo.saveLeg({ ...leg, source: 'reservation', mode: res.mode, durationMin: res.durationMin, distanceKm: null, geometry: null, error: null });
      } else if (!res && leg.source === 'reservation') {
        await repo.saveLeg({ ...leg, source: 'manual' });
      }
    }

    const recomputeIds = new Set(plan.recompute.map((l) => l.id));
    for (const leg of plan.recompute) {
      if (reserved.has(`${leg.fromStopId}>${leg.toStopId}`) || !recomputeIds.has(leg.id)) continue;
      await compute(leg, byId.get(leg.fromStopId)!, byId.get(leg.toStopId)!);
    }
    return repo.getBundle(tripId);
  }

  /** Position d'une nouvelle étape : dans l'ordre des heures réelles (fuseaux compris), avant l'hébergement qui termine la journée. */
  function insertIndex(dayStops: Stop[], date: string, stop: Pick<Stop, 'kind' | 'startTime' | 'timezone'>): number {
    if (stop.kind === 'lodging') return dayStops.length;
    let end = dayStops.length;
    while (end > 0 && dayStops[end - 1].kind === 'lodging') end--;
    if (!stop.startTime) return end;
    const at = toInstant({ date, time: stop.startTime, timezone: stop.timezone });
    const i = dayStops
      .slice(0, end)
      .findIndex((s) => s.startTime !== null && toInstant({ date, time: s.startTime, timezone: s.timezone }) > at);
    return i === -1 ? end : i;
  }

  async function insertStop(bundle: TripBundle, dayId: string, input: StopInput, index: number) {
    const dayStops = bundle.stops.filter((s) => s.dayId === dayId).sort((a, b) => a.position - b.position);
    const created = await repo.saveStop({ ...input, dayId, position: dayStops.length });
    const ids = dayStops.map((s) => s.id);
    ids.splice(Math.min(index, ids.length), 0, created.id);
    await repo.reorderStops(dayId, ids);
  }

  return {
    async createTrip(t) {
      const trip = await repo.createTrip(t);
      await repo.createDays(trip.id, datesBetween(t.startDate, t.endDate));
      for (const [position, item] of DEFAULT_CHECKLIST.entries()) {
        await repo.saveChecklistItem({ tripId: trip.id, ...item, done: false, dueDate: null, position });
      }
      return repo.getBundle(trip.id);
    },

    async duplicateTrip(id, newName) {
      const src = await repo.getBundle(id);
      const { id: _old, ...tripData } = src.trip;
      void _old;
      const trip = await repo.createTrip({ ...tripData, name: newName });
      const dayMap = new Map<string, string>();
      for (const d of src.days) {
        const [created] = await repo.createDays(trip.id, [d.date]);
        await repo.updateDay({ ...created, title: d.title, note: d.note });
        dayMap.set(d.id, created.id);
      }
      const resMap = new Map<string, string>();
      for (const r of src.reservations) {
        const { id: rid, ...rest } = r;
        resMap.set(rid, (await repo.saveReservation({ ...rest, tripId: trip.id })).id);
      }
      const stopMap = new Map<string, string>();
      for (const s of src.stops) {
        const { id: sid, ...rest } = s;
        const created = await repo.saveStop({
          ...rest, dayId: dayMap.get(s.dayId)!, reservationId: s.reservationId ? (resMap.get(s.reservationId) ?? null) : null,
        });
        stopMap.set(sid, created.id);
      }
      for (const l of src.legs) {
        const { id: _lid, ...rest } = l;
        void _lid;
        await repo.saveLeg({ ...rest, fromStopId: stopMap.get(l.fromStopId)!, toStopId: stopMap.get(l.toStopId)! });
      }
      for (const c of src.checklist) {
        const { id: _cid, ...rest } = c;
        void _cid;
        await repo.saveChecklistItem({ ...rest, tripId: trip.id });
      }
      for (const c of src.contacts) {
        const { id: _kid, ...rest } = c;
        void _kid;
        await repo.saveContact({ ...rest, tripId: trip.id });
      }
      return repo.getBundle(trip.id);
    },

    async changeDates(tripId, start, end, opts = {}) {
      const bundle = await repo.getBundle(tripId);
      const diff = diffDays(bundle.days, start, end, bundle.stops);
      if (diff.nonEmptyToDelete.length > 0 && !opts.confirm) throw new NeedsConfirmationError(diff.nonEmptyToDelete);
      if (diff.toDelete.length) await repo.deleteDays(diff.toDelete.map((d) => d.id));
      if (diff.toCreate.length) await repo.createDays(tripId, diff.toCreate);
      await repo.updateTrip({ ...bundle.trip, startDate: start, endDate: end });
      return syncLegs(tripId);
    },

    async addStop(dayId, s) {
      const { tripId, bundle } = await tripIdOfDay(dayId);
      const dayStops = bundle.stops.filter((x) => x.dayId === dayId).sort((a, b) => a.position - b.position);
      const date = bundle.days.find((d) => d.id === dayId)!.date;
      await insertStop(bundle, dayId, s, insertIndex(dayStops, date, s));
      return syncLegs(tripId);
    },

    async updateStop(s) {
      const { tripId, bundle } = await tripIdOfDay(s.dayId);
      const before = bundle.stops.find((x) => x.id === s.id);
      const gainedPosition = before && (before.lat === null || before.lon === null) && s.lat !== null && s.lon !== null;
      await repo.saveStop(s);
      if (gainedPosition) {
        // Un trajet resté vide (ou à 0 min) autour de cette étape repasse en calcul automatique.
        for (const leg of bundle.legs) {
          const touches = leg.fromStopId === s.id || leg.toStopId === s.id;
          if (touches && leg.source === 'manual' && AUTO_MODES.includes(leg.mode) && !leg.durationMin) {
            await repo.saveLeg({ ...leg, source: 'auto', durationMin: null, distanceKm: null, geometry: null, error: null, fromKey: null, toKey: null });
          }
        }
      }
      return syncLegs(tripId);
    },

    async removeStop(id) {
      const bundle = await findBy((b) => b.stops.some((s) => s.id === id));
      const stop = bundle.stops.find((s) => s.id === id)!;
      await repo.deleteStop(id);
      const rest = bundle.stops.filter((s) => s.dayId === stop.dayId && s.id !== id).sort((a, b) => a.position - b.position);
      await repo.reorderStops(stop.dayId, rest.map((s) => s.id));
      return syncLegs(bundle.trip.id);
    },

    async moveStop(stopId, toDayId, toIndex) {
      const bundle = await findBy((b) => b.stops.some((s) => s.id === stopId));
      const stop = bundle.stops.find((s) => s.id === stopId)!;
      const ordered = (dayId: string) =>
        bundle.stops.filter((s) => s.dayId === dayId && s.id !== stopId).sort((a, b) => a.position - b.position).map((s) => s.id);
      if (stop.dayId !== toDayId) await repo.reorderStops(stop.dayId, ordered(stop.dayId));
      const target = ordered(toDayId);
      target.splice(Math.max(0, Math.min(toIndex, target.length)), 0, stopId);
      await repo.reorderStops(toDayId, target);
      return syncLegs(bundle.trip.id);
    },

    async setLegManual(legId, mode, durationMin) {
      const bundle = await findBy((b) => b.legs.some((l) => l.id === legId));
      const leg = bundle.legs.find((l) => l.id === legId)!;
      await repo.saveLeg({ ...leg, mode, durationMin, source: 'manual', error: null });
      return repo.getBundle(bundle.trip.id);
    },

    async setLegMode(legId, mode) {
      const bundle = await findBy((b) => b.legs.some((l) => l.id === legId));
      const leg = bundle.legs.find((l) => l.id === legId)!;
      await repo.saveLeg({
        ...leg, mode, source: AUTO_MODES.includes(mode) ? 'auto' : 'manual', durationMin: null, distanceKm: null,
        geometry: null, error: null, fromKey: null, toKey: null,
      });
      return syncLegs(bundle.trip.id);
    },

    async saveReservation(r) {
      const saved = await repo.saveReservation(r);
      let bundle = await repo.getBundle(saved.tripId);
      const dayDate = new Map(bundle.days.map((d) => [d.id, d.date]));
      // Étapes déjà liées, dans l'ordre (départ puis arrivée) : on les met à jour sur place
      // pour conserver leurs notes et les trajets saisis autour d'elles.
      const existing = bundle.stops
        .filter((s) => s.reservationId === saved.id)
        .sort((a, b) => (dayDate.get(a.dayId) ?? '').localeCompare(dayDate.get(b.dayId) ?? '') || a.position - b.position);
      const drafts = reservationToStops(saved).stops;

      for (const [i, draft] of drafts.entries()) {
        bundle = await repo.getBundle(saved.tripId);
        const day = bundle.days.find((d) => d.date === draft.date);
        const current = existing[i];
        const { date: _date, ...input } = draft;
        void _date;
        if (!day) {
          if (current) await repo.deleteStop(current.id);
          continue;
        }
        if (!current) {
          const dayStops = bundle.stops.filter((s) => s.dayId === day.id).sort((a, b) => a.position - b.position);
          await insertStop(bundle, day.id, input, insertIndex(dayStops, day.date, input));
          continue;
        }
        const updated: Stop = {
          ...current,
          kind: input.kind, title: input.title, address: input.address, lat: input.lat, lon: input.lon,
          timezone: input.timezone, startTime: input.startTime,
          phone: input.phone || current.phone, url: input.url || current.url,
        };
        if (current.dayId === day.id) {
          await repo.saveStop(updated);
        } else {
          const oldDay = bundle.stops.filter((s) => s.dayId === current.dayId && s.id !== current.id).sort((a, b) => a.position - b.position);
          await repo.reorderStops(current.dayId, oldDay.map((s) => s.id));
          const target = bundle.stops.filter((s) => s.dayId === day.id).sort((a, b) => a.position - b.position);
          await repo.saveStop({ ...updated, dayId: day.id, position: target.length });
          const ids = target.map((s) => s.id);
          ids.splice(insertIndex(target, day.date, updated), 0, current.id);
          await repo.reorderStops(day.id, ids);
        }
      }
      for (const extra of existing.slice(drafts.length)) await repo.deleteStop(extra.id);

      bundle = await repo.getBundle(saved.tripId);
      for (const day of bundle.days) {
        const ids = bundle.stops.filter((s) => s.dayId === day.id).sort((a, b) => a.position - b.position).map((s) => s.id);
        await repo.reorderStops(day.id, ids);
      }
      return syncLegs(saved.tripId);
    },

    async deleteReservation(id) {
      const bundle = await findBy((b) => b.reservations.some((r) => r.id === id));
      await repo.deleteReservation(id);
      const after = await repo.getBundle(bundle.trip.id);
      for (const day of after.days) {
        const ids = after.stops.filter((s) => s.dayId === day.id).sort((a, b) => a.position - b.position).map((s) => s.id);
        await repo.reorderStops(day.id, ids);
      }
      return syncLegs(bundle.trip.id);
    },

    syncLegs,
  };
}
