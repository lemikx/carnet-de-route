import { createMemoryRepository } from './memoryRepository';
import { runRepositoryContract } from './repositoryContract';

runRepositoryContract('mémoire', async () => createMemoryRepository());

describe('persistance du dépôt mémoire', () => {
  it('relit les données depuis le stockage fourni', async () => {
    const store = new Map<string, string>();
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
    const a = createMemoryRepository({ storage });
    const t = await a.createTrip({ name: 'Islande', countries: ['IS'], startDate: '2027-06-01', endDate: '2027-06-02', localCurrency: 'ISK', homeTimezone: 'Europe/Paris', updatedAt: '' });
    const b = createMemoryRepository({ storage });
    expect((await b.getBundle(t.id)).trip.name).toBe('Islande');
  });
});
