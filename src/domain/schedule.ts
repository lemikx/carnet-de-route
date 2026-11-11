import { addMinutes, toInstant } from './time';
import type { Day, Leg, Stop, ZonedDateTime } from './types';

export interface StopTiming {
  stopId: string;
  plannedStart: ZonedDateTime | null;
  estimatedArrival: ZonedDateTime | null;
  conflictMinutes: number;
}

export interface DaySchedule {
  timings: StopTiming[];
  travelMinutes: number;
  distanceKm: number;
  heavy: boolean;
  unknownLegs: number;
}

export const DEFAULT_HEAVY_THRESHOLD_MIN = 300;

export function findLeg(legs: Leg[], from: Stop, to: Stop): Leg | undefined {
  return legs.find((l) => l.fromStopId === from.id && l.toStopId === to.id);
}

export function computeDaySchedule(
  day: Day,
  stops: Stop[],
  legs: Leg[],
  heavyThresholdMin = DEFAULT_HEAVY_THRESHOLD_MIN,
): DaySchedule {
  const timings: StopTiming[] = [];
  let travelMinutes = 0;
  let distanceKm = 0;
  let unknownLegs = 0;
  let prevRef: ZonedDateTime | null = null;

  stops.forEach((stop, i) => {
    const plannedStart: ZonedDateTime | null = stop.startTime
      ? { date: day.date, time: stop.startTime, timezone: stop.timezone }
      : null;
    let estimatedArrival: ZonedDateTime | null = null;

    if (i > 0) {
      const prev = stops[i - 1];
      const leg = findLeg(legs, prev, stop);
      if (leg) {
        if (leg.durationMin === null) unknownLegs++;
        else travelMinutes += leg.durationMin;
        if (leg.distanceKm !== null) distanceKm += leg.distanceKm;
      }
      if (prevRef && leg && leg.durationMin !== null) {
        estimatedArrival = addMinutes(prevRef, (prev.durationMin ?? 0) + leg.durationMin, stop.timezone);
      }
    }

    let conflictMinutes = 0;
    if (plannedStart && estimatedArrival) {
      const diff = Math.round((toInstant(estimatedArrival) - toInstant(plannedStart)) / 60000);
      conflictMinutes = Math.max(0, diff);
    }

    timings.push({ stopId: stop.id, plannedStart, estimatedArrival, conflictMinutes });
    prevRef = plannedStart ?? estimatedArrival;
  });

  return {
    timings,
    travelMinutes,
    distanceKm: Math.round(distanceKm * 10) / 10,
    heavy: travelMinutes > heavyThresholdMin,
    unknownLegs,
  };
}
