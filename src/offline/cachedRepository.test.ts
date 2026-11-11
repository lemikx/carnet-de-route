import { createMemoryRepository } from '../data/memoryRepository';
import { NotFoundError, OfflineError } from '../data/TripRepository';
import { createCachedRepository, type KeyValueStore } from './cachedRepository';

function mapStore(): KeyValueStore {
  const m = new Map<string, unknown>();
  return { get: async (k) => m.get(k), set: async (k, v) => void m.set(k, v) };
}
const trip = { name: 'Japon', countries: ['JP'], startDate: '2026-12-01', endDate: '2026-12-02', localCurrency: 'JPY', homeTimezone: 'Europe/Paris', updatedAt: '' };

describe('createCachedRepository', () => {
  it('relit hors ligne ce qui a été consulté en ligne', async () => {
    let online = true;
    const inner = createMemoryRepository();
    const repo = createCachedRepository(inner, () => online, mapStore());
    const t = await repo.createTrip(trip);
    const before = await repo.getBundle(t.id);
    const list = await repo.listTrips();
    online = false;
    expect(await repo.getBundle(t.id)).toEqual(before);
    expect(await repo.listTrips()).toEqual(list);
  });

  it('relit hors ligne un roadbook partagé déjà ouvert', async () => {
    let online = true;
    const inner = createMemoryRepository();
    const repo = createCachedRepository(inner, () => online, mapStore());
    const t = await repo.createTrip(trip);
    const link = await repo.createShareLink(t.id, true);
    const shared = await repo.getSharedRoadbook(link.token);
    online = false;
    expect(await repo.getSharedRoadbook(link.token)).toEqual(shared);
  });

  it('utilise le cache si le réseau échoue alors que l’appareil se croit en ligne', async () => {
    const inner = createMemoryRepository();
    const store = mapStore();
    const repo = createCachedRepository(inner, () => true, store);
    const t = await repo.createTrip(trip);
    const before = await repo.getBundle(t.id);
    inner.getBundle = async () => { throw new TypeError('Failed to fetch'); };
    expect(await repo.getBundle(t.id)).toEqual(before);
  });

  it('ne masque pas un voyage supprimé par le cache', async () => {
    const inner = createMemoryRepository();
    const repo = createCachedRepository(inner, () => true, mapStore());
    const t = await repo.createTrip(trip);
    await repo.getBundle(t.id);
    await repo.deleteTrip(t.id);
    await expect(repo.getBundle(t.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('échoue hors ligne si rien n’est en cache', async () => {
    const repo = createCachedRepository(createMemoryRepository(), () => false, mapStore());
    await expect(repo.getBundle('x')).rejects.toBeInstanceOf(OfflineError);
  });

  it('refuse toute modification hors ligne sans appeler le dépôt', async () => {
    const inner = createMemoryRepository();
    const spy = vi.spyOn(inner, 'saveStop');
    const repo = createCachedRepository(inner, () => false, mapStore());
    await expect(repo.saveStop({} as never)).rejects.toBeInstanceOf(OfflineError);
    await expect(repo.createTrip(trip)).rejects.toBeInstanceOf(OfflineError);
    expect(spy).not.toHaveBeenCalled();
  });
});
