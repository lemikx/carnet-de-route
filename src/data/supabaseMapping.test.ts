import { fromRow, toRow, rowsToBundle } from './supabaseMapping';

describe('conversion Supabase', () => {
  it('convertit une ligne en objet de l’appli', () => {
    expect(fromRow({ id: '1', user_id: 'u', trip_id: 't', start_time: '09:00', duration_min: 30, created_at: 'x', updated_at: 'y' })).toEqual({
      id: '1', tripId: 't', startTime: '09:00', durationMin: 30, updatedAt: 'y',
    });
  });
  it('ne modifie pas les valeurs JSON imbriquées', () => {
    const at = { date: '2026-12-01', time: '10:00', timezone: 'Europe/Paris' };
    expect(fromRow({ start_at: at }).startAt).toEqual(at);
  });
  it('convertit un objet de l’appli en ligne, sans updatedAt', () => {
    expect(toRow({ id: '1', tripId: 't', confirmationNumber: 'A', updatedAt: 'z' })).toEqual({ id: '1', trip_id: 't', confirmation_number: 'A' });
  });
  it('reconstruit un bundle depuis le JSON de la base', () => {
    const b = rowsToBundle({
      trip: { id: 't', name: 'Japon', countries: [], start_date: '2026-12-01', end_date: '2026-12-02', local_currency: '', home_timezone: 'Europe/Paris', updated_at: 'u' },
      days: [{ id: 'd', trip_id: 't', date: '2026-12-01', title: '', note: '' }],
      stops: [], legs: [{ id: 'l', from_stop_id: 'a', to_stop_id: 'b', distance_km: 1.5 }], reservations: [], checklist: [], contacts: [],
    });
    expect(b.trip).toMatchObject({ id: 't', startDate: '2026-12-01', updatedAt: 'u' });
    expect(b.days[0].tripId).toBe('t');
    expect(b.legs[0]).toMatchObject({ fromStopId: 'a', distanceKm: 1.5 });
  });
});
