import { describe, expect, it } from 'vitest';
import { cleanText, safeUrl, validateIdeas, validateItinerary } from './validate';

const mkVisa = () => ({ required: true, type: 'e-visa', processingDaysMin: 2, processingDaysMax: 10, officialUrl: 'https://a.fr', notes: '' });
const idea = (n: number) => ({
  id: `i${n}`, destination: `Ville ${n}`, country: 'JP', summary: 's', durationDays: 5, highlights: ['a'],
  budgetPerPersonEur: 1500, whyItMatches: 'w', visa: mkVisa(),
});
const ideas = (n = 3) => ({ v: 1, kind: 'ideas', ideas: Array.from({ length: n }, (_, i) => idea(i + 1)) });
const stop = (o: object = {}) => ({ title: 'Musée', kind: 'activity', place: { name: 'Louvre', city: 'Paris', country: 'FR' }, startTime: '09:30', durationMin: 90, note: '', ...o });
const itin = (o: Record<string, unknown> = {}) => ({
  v: 1, kind: 'itinerary',
  trip: { name: 'Paris', countries: ['FR'], currency: 'EUR', visa: { ...mkVisa(), required: false } },
  days: [{ day: 1, title: 'J1', note: '', stops: [stop(), stop({ startTime: null })] }, { day: 2, title: 'J2', note: '', stops: [stop()] }],
  checklist: [{ category: 'documents', label: 'Passeport', daysBeforeDeparture: 30 }],
  budget: [{ category: 'food', label: 'Repas', amount: 40, currency: 'EUR', mode: 'per_person_per_day' }],
  ...o,
});

describe('cleanText / safeUrl', () => {
  it('retire les caractères de contrôle et tronque', () => {
    expect(cleanText('a\u0000b\u001fc')).toBe('abc');
    expect(cleanText('x'.repeat(600)).length).toBe(500);
    expect(cleanText('x'.repeat(600)).endsWith('…')).toBe(true);
    expect(cleanText(42)).toBe('');
    expect(cleanText('a\nb')).toBe('a\nb');
  });
  it('garde seulement https', () => {
    expect(safeUrl('https://a.fr/x')).toBe('https://a.fr/x');
    for (const u of ['http://a.fr', 'javascript:alert(1)', 'data:text/html,x', '//a.fr', 42]) expect(safeUrl(u)).toBeNull();
  });
});

describe('validateIdeas', () => {
  it('accepte 3 idées', () => {
    const r = validateIdeas(ideas());
    expect('value' in r && r.value.ideas.length).toBe(3);
  });
  it('refuse 2 idées', () => {
    const r = validateIdeas(ideas(2));
    expect('errors' in r && r.errors.join(' ')).toContain('exactement 3 idées');
  });
  it('refuse un visa.required invalide en nommant l’idée', () => {
    const raw = ideas() as any;
    raw.ideas[1].visa.required = 'peut-être';
    const r = validateIdeas(raw);
    expect('errors' in r && r.errors.join(' ')).toContain('Ville 2');
  });
  it('refuse délai négatif ou énorme', () => {
    for (const bad of [-3, 2e9]) {
      const raw = ideas() as any;
      raw.ideas[0].visa.processingDaysMax = bad;
      expect('errors' in validateIdeas(raw)).toBe(true);
    }
  });
  it('lien dangereux → null + avertissement', () => {
    const raw = ideas() as any;
    raw.ideas[0].visa.officialUrl = 'javascript:x';
    const r = validateIdeas(raw);
    expect('value' in r && r.value.ideas[0].visa.officialUrl).toBeNull();
    expect('warnings' in r && r.warnings.length).toBeGreaterThan(0);
  });
});

describe('validateItinerary', () => {
  it('accepte un itinéraire valide', () => {
    const r = validateItinerary(itin(), { tripDays: 2 });
    expect('value' in r && r.value.days[0].stops.length).toBe(2);
    expect('warnings' in r && r.warnings).toEqual([]);
  });
  it('heure invalide', () => {
    const raw = itin({ days: [1, 2, 3].map((d) => ({ day: d, title: '', note: '', stops: d === 3 ? [stop(), stop({ startTime: '25:00' })] : [stop()] })) });
    const r = validateItinerary(raw, { tripDays: 3 });
    expect('errors' in r && r.errors).toContain('Jour 3, étape 2 : l’heure « 25:00 » est invalide.');
  });
  it('jours en double ou dans le désordre', () => {
    for (const nums of [[1, 1], [1, 3, 2]]) {
      const raw = itin({ days: nums.map((d) => ({ day: d, title: '', note: '', stops: [] })) });
      const r = validateItinerary(raw, { tripDays: nums.length });
      expect('errors' in r && r.errors.join(' ')).toContain('Les jours doivent être numérotés 1, 2, 3… sans trou');
    }
  });
  it('plafonds', () => {
    const many = (n: number) => Array.from({ length: n }, (_, i) => ({ day: i + 1, title: '', note: '', stops: [] }));
    expect('errors' in validateItinerary(itin({ days: many(31) }), { tripDays: 31 })).toBe(true);
    const days = [{ day: 1, title: '', note: '', stops: Array.from({ length: 13 }, () => stop()) }];
    expect('errors' in validateItinerary(itin({ days }), { tripDays: 1 })).toBe(true);
  });
  it('kind, montant et mode invalides', () => {
    const k = itin({ days: [{ day: 1, title: '', note: '', stops: [stop({ kind: 'hotel' })] }] });
    expect('errors' in validateItinerary(k, { tripDays: 1 })).toBe(true);
    for (const b of [{ amount: 5e9 }, { amount: -1 }, { mode: 'weekly' }]) {
      const raw = itin({ budget: [{ category: 'food', label: 'x', amount: 10, currency: 'EUR', mode: 'fixed', ...b }] });
      expect('errors' in validateItinerary(raw, { tripDays: 2 })).toBe(true);
    }
  });
  it('nombre de jours différent → avertissement seulement', () => {
    const r = validateItinerary(itin(), { tripDays: 5 });
    expect('value' in r).toBe(true);
    expect('warnings' in r && r.warnings.join(' ')).toContain('2 jours proposés pour 5 dates');
  });
  it('clés piégées ignorées', () => {
    const raw = JSON.parse('{"__proto__":{"polluted":1},"constructor":{"x":1}}');
    const merged = { ...itin(), ...raw };
    const r = validateItinerary(JSON.parse(JSON.stringify(merged)), { tripDays: 2 });
    expect(({} as any).polluted).toBeUndefined();
    expect('value' in r && Object.keys(r.value)).not.toContain('constructor');
  });
});
