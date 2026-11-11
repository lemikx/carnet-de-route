import { budgetFromJson, expenseToRpc, fromRow, toRow, rowsToBundle } from './supabaseMapping';

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

describe('conversion du budget', () => {
  it('reconstruit un budget depuis le JSON de la base', () => {
    const b = budgetFromJson({
      travelers: [{ id: 'v1', trip_id: 't', name: 'Alice', position: 0, user_id: 'u' }],
      lines: [{ id: 'l1', trip_id: 't', category: 'food', label: 'Repas', amount: 40, currency: 'EUR', mode: 'per_person_per_day', position: 0, rate_to_eur: 1, rate_manual: false, rate_date: '2026-11-11' }],
      expenses: [{ id: 'e1', trip_id: 't', date: '2026-12-01', category: 'food', label: 'Dîner', amount: 60, currency: 'EUR', rate_to_eur: 1, rate_manual: false, paid_by: 'v1', line_id: null, reservation_id: null, participant_ids: ['v1'] }],
    });
    expect(b.travelers[0]).toEqual({ id: 'v1', tripId: 't', name: 'Alice', position: 0 });
    expect(b.lines[0]).toMatchObject({ rateToEur: 1, rateManual: false, mode: 'per_person_per_day' });
    expect(b.expenses[0]).toMatchObject({ paidBy: 'v1', participantIds: ['v1'], lineId: null });
  });
  it('prépare une dépense pour la fonction save_expense', () => {
    const { expense, participants } = expenseToRpc({
      tripId: 't', date: '2026-12-01', category: 'food', label: 'Dîner', amount: 60, currency: 'EUR', rateToEur: 1, rateManual: false,
      paidBy: 'v1', participantIds: ['v1', 'v2'], lineId: null, reservationId: null,
    });
    expect(participants).toEqual(['v1', 'v2']);
    expect(expense).toMatchObject({ trip_id: 't', paid_by: 'v1', rate_to_eur: 1, line_id: null });
    expect('participant_ids' in expense).toBe(false);
  });
});
