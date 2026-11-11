import { get as idbGet, set as idbSet } from 'idb-keyval';
import { OfflineError, type TripRepository } from '../data/TripRepository';

export interface KeyValueStore {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
}

export const idbStore: KeyValueStore = { get: (k) => idbGet(k), set: (k, v) => idbSet(k, v) };

const READS = { listTrips: () => 'trips', getBundle: (id: string) => `bundle:${id}`, getSharedRoadbook: (t: string) => `shared:${t}` } as const;
const OPTIONAL_READS = new Set(['getShareLink', 'getCalendarLink']);

/** Enveloppe un dépôt : lectures mises en cache, écritures refusées hors ligne. */
export function createCachedRepository(inner: TripRepository, isOnline: () => boolean, store: KeyValueStore = idbStore): TripRepository {
  return new Proxy(inner, {
    get(target, prop: string) {
      const fn = (target as unknown as Record<string, (...a: unknown[]) => Promise<unknown>>)[prop];
      if (typeof fn !== 'function') return fn;
      if (prop in READS) {
        const keyOf = READS[prop as keyof typeof READS] as (a?: string) => string;
        return async (...args: unknown[]) => {
          const key = keyOf(args[0] as string);
          if (isOnline()) {
            const value = await fn.apply(target, args);
            try {
              await store.set(key, value);
            } catch {
              /* cache indisponible : on continue */
            }
            return value;
          }
          const cached = await store.get(key).catch(() => undefined);
          if (cached === undefined) throw new OfflineError('Hors ligne et pas encore consulté sur cet appareil');
          return cached;
        };
      }
      if (OPTIONAL_READS.has(prop)) {
        return async (...args: unknown[]) => (isOnline() ? fn.apply(target, args) : null);
      }
      return async (...args: unknown[]) => {
        if (!isOnline()) throw new OfflineError();
        return fn.apply(target, args);
      };
    },
  });
}
