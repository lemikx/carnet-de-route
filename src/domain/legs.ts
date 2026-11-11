import { coordKey } from './time';
import { AUTO_MODES, type Day, type Leg, type Stop, type TravelMode } from './types';

export function orderedStops(days: Day[], stops: Stop[]): Stop[] {
  const dateOf = new Map(days.map((d) => [d.id, d.date]));
  return stops
    .filter((s) => dateOf.has(s.dayId))
    .sort((a, b) => dateOf.get(a.dayId)!.localeCompare(dateOf.get(b.dayId)!) || a.position - b.position);
}

export interface LegPlan {
  create: { fromStopId: string; toStopId: string; mode: TravelMode }[];
  remove: Leg[];
  recompute: Leg[];
}

export function canAutoCompute(leg: Leg, from: Stop, to: Stop): boolean {
  return (
    AUTO_MODES.includes(leg.mode) &&
    leg.source === 'auto' &&
    from.lat !== null && from.lon !== null && to.lat !== null && to.lon !== null
  );
}

export function planLegs(ordered: Stop[], legs: Leg[], defaultMode: TravelMode = 'car'): LegPlan {
  const plan: LegPlan = { create: [], remove: [], recompute: [] };
  const wanted = new Map<string, [Stop, Stop]>();
  for (let i = 0; i + 1 < ordered.length; i++) {
    wanted.set(`${ordered[i].id}>${ordered[i + 1].id}`, [ordered[i], ordered[i + 1]]);
  }
  const existing = new Map<string, Leg>();
  for (const leg of legs) {
    const key = `${leg.fromStopId}>${leg.toStopId}`;
    if (!wanted.has(key) || existing.has(key)) plan.remove.push(leg);
    else existing.set(key, leg);
  }
  for (const [key, [from, to]] of wanted) {
    const leg = existing.get(key);
    if (!leg) {
      plan.create.push({ fromStopId: from.id, toStopId: to.id, mode: defaultMode });
      continue;
    }
    if (!canAutoCompute(leg, from, to)) continue;
    const moved = leg.fromKey !== coordKey(from.lat, from.lon) || leg.toKey !== coordKey(to.lat, to.lon);
    if (moved || (leg.durationMin === null && leg.error === null)) {
      plan.recompute.push(leg);
    }
  }
  return plan;
}
