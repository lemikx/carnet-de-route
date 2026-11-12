import { describe, expect, it } from 'vitest';
import { asReply, IDEAS_FIXTURE, ITINERARY_FIXTURE } from './fixtures';
import { parseIdeas, parseItinerary } from './responseParser';

const opts = { tripDays: 3 };

describe('parseItinerary', () => {
  it('lit le JSON seul, en balise ou entouré de texte', () => {
    const a = parseItinerary(asReply(ITINERARY_FIXTURE, 'raw'), opts);
    const b = parseItinerary(asReply(ITINERARY_FIXTURE, 'fence'), opts);
    const c = parseItinerary(asReply(ITINERARY_FIXTURE, 'text'), opts);
    expect(a.ok && b.ok && c.ok).toBe(true);
    if (a.ok && b.ok && c.ok) { expect(b.value).toEqual(a.value); expect(c.value).toEqual(a.value); }
  });
  it('deux blocs : le premier', () => {
    const text = `${asReply(ITINERARY_FIXTURE)}\n${asReply({ ...ITINERARY_FIXTURE, trip: { ...ITINERARY_FIXTURE.trip, name: 'Autre' } })}`;
    const r = parseItinerary(text, opts);
    expect(r.ok && r.value.trip.name).toBe('Kyoto express');
  });
  it('accolades dans une chaîne', () => {
    const o = JSON.parse(JSON.stringify(ITINERARY_FIXTURE));
    o.days[0].note = 'voir } ici { là';
    const r = parseItinerary(asReply(o, 'text'), opts);
    expect(r.ok && r.value.days[0].note).toBe('voir } ici { là');
  });
  it('JSON coupé → truncated', () => {
    const full = asReply(ITINERARY_FIXTURE, 'raw');
    for (const text of [full.slice(0, full.length / 2), `\`\`\`json\n${full.slice(0, full.length / 2)}`]) {
      const r = parseItinerary(text, opts);
      expect(!r.ok && r.truncated).toBe(true);
    }
  });
  it('texte sans JSON', () => {
    const r = parseItinerary('Désolé, je ne peux pas.', opts);
    expect(!r.ok && r.truncated).toBe(false);
    expect(!r.ok && r.errors[0]).toContain('bloc JSON');
  });
  it('mauvaise version ou mauvais type', () => {
    const v2 = parseItinerary(JSON.stringify({ ...ITINERARY_FIXTURE, v: 2 }), opts);
    expect(!v2.ok && v2.errors[0]).toContain('autre version');
    const wrong = parseItinerary(asReply(IDEAS_FIXTURE), opts);
    expect(!wrong.ok && wrong.errors[0]).toContain('des idées, pas un itinéraire');
  });
  it('trop long : refusé sans analyse', () => {
    const r = parseItinerary('x'.repeat(200001), opts);
    expect(!r.ok && r.errors[0]).toContain('trop longue');
  });
  it('100 000 jours : erreur de plafond rapide', () => {
    const t0 = Date.now();
    const text = `{"v":1,"kind":"itinerary","days":[${Array(30000).fill('{"day":1}').join(',')}]}`;
    const r = parseItinerary(text, opts);
    expect(r.ok).toBe(false);
    expect(Date.now() - t0).toBeLessThan(1000);
  });
  it('contenu piégé inoffensif', () => {
    const o = JSON.parse(JSON.stringify(ITINERARY_FIXTURE));
    o.days[0].stops[0].title = '<script>alert(1)</script>\u0000ok';
    o.trip.visa.officialUrl = 'javascript:alert(1)';
    const r = parseItinerary(asReply(o), opts);
    expect(r.ok && r.value.days[0].stops[0].title).toBe('<script>alert(1)</script>ok');
    expect(r.ok && r.value.trip.visa.officialUrl).toBeNull();
  });
});

describe('parseIdeas', () => {
  it('lit les 3 idées', () => {
    const r = parseIdeas(asReply(IDEAS_FIXTURE, 'text'));
    expect(r.ok && r.value.ideas.length).toBe(3);
  });
  it('un itinéraire collé comme idées', () => {
    const r = parseIdeas(asReply(ITINERARY_FIXTURE));
    expect(!r.ok && r.errors[0]).toContain('un itinéraire, pas des idées');
  });
});
