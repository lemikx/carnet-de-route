import { buildRoadbook, stripSensitive } from './roadbook';
import { sampleBundle } from '../test/bundle';
import { makeTrip, makeDay } from '../test/factories';

describe('buildRoadbook', () => {
  it('produit une section par jour et des totaux cohérents', () => {
    const rb = buildRoadbook(sampleBundle(), { hideSensitive: false });
    expect(rb.days.map((d) => d.day.date)).toEqual(['2026-12-01', '2026-12-02', '2026-12-03']);
    expect(rb.totals).toEqual({ travelMinutes: 50, distanceKm: 20 });
    expect(rb.overview.reduce((s, o) => s + o.travelMinutes, 0)).toBe(50);
    expect(rb.overview[0].lodgingTitle).toBe('Hôtel Sakura');
  });

  it('associe l’hébergement du jour à sa réservation', () => {
    const rb = buildRoadbook(sampleBundle(), { hideSensitive: false });
    expect(rb.days[0].lodging?.id).toBe('B');
    expect(rb.days[0].lodgingReservation?.id).toBe('H1');
  });

  it('masque toutes les infos sensibles', () => {
    const json = JSON.stringify(buildRoadbook(sampleBundle(), { hideSensitive: true }));
    expect(json).not.toContain('SECRET');
    expect(json).not.toContain('4242');
  });

  it('garde les infos sensibles si non masquées', () => {
    const json = JSON.stringify(buildRoadbook(sampleBundle(), { hideSensitive: false }));
    for (const s of ['SECRET-conf', 'SECRET-url', 'SECRET-res-note', 'SECRET-stop-note', 'SECRET-day-note', 'SECRET-contact-note']) {
      expect(json).toContain(s);
    }
  });

  it('gère un voyage vide', () => {
    const trip = makeTrip({ id: 't9', startDate: '2026-12-01', endDate: '2026-12-02' });
    const rb = buildRoadbook(
      { trip, days: [makeDay({ date: '2026-12-02' }), makeDay({ date: '2026-12-01' })], stops: [], legs: [], reservations: [], checklist: [], contacts: [] },
      { hideSensitive: true },
    );
    expect(rb.days).toHaveLength(2);
    expect(rb.days.every((d) => d.stops.length === 0)).toBe(true);
    expect(rb.totals).toEqual({ travelMinutes: 0, distanceKm: 0 });
  });
});

describe('stripSensitive', () => {
  it('ne modifie pas le bundle d’origine', () => {
    const b = sampleBundle();
    stripSensitive(b);
    expect(b.reservations[0].confirmationNumber).toBe('SECRET-conf');
  });
});
