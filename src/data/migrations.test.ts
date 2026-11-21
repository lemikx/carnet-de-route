import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('migration 0009', () => {
  it('ajoute les champs du billet de vol sur reservations', () => {
    const file = resolve(__dirname, '../../supabase/migrations/0009_reservation_flight_fields.sql');
    expect(existsSync(file)).toBe(true);
    const sql = readFileSync(file, 'utf8');
    for (const c of ['departure_code', 'arrival_code', 'seat', 'gate', 'terminal']) {
      expect(sql).toMatch(new RegExp(`add column if not exists ${c} text`));
    }
  });
});
