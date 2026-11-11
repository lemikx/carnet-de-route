import { get as idbGet, set as idbSet } from 'idb-keyval';
import { NotFoundError, OfflineError, type TripRepository } from '../data/TripRepository';

export interface KeyValueStore {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
}

export const idbStore: KeyValueStore = { get: (k) => idbGet(k), set: (k, v) => idbSet(k, v) };

const READS = { listTrips: () => 'trips', getBundle: (id: string) => `bundle:${id}`, getSharedRoadbook: (t: string) => `shared:${t}` } as const;
const OPTIONAL_READS: Record<string, unknown> = { getShareLink: null, getCalendarLink: null, getDisplayName: '' };

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
            let value: unknown;
            try {
              value = await fn.apply(target, args);
            } catch (e) {
              // Réseau défaillant alors que l'appareil se croit en ligne : on se rabat sur la copie locale.
              if (e instanceof NotFoundError) throw e;
              const cached = await store.get(key).catch(() => undefined);
              if (cached === undefined) throw e;
              return cached;
            }
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
      if (prop in OPTIONAL_READS) {
        return async (...args: unknown[]) => (isOnline() ? fn.apply(target, args) : OPTIONAL_READS[prop]);
      }
      return async (...args: unknown[]) => {
        if (!isOnline()) throw new OfflineError();
        return fn.apply(target, args);
      };
    },
  });
}
