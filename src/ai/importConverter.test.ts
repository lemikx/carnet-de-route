import { describe, expect, it } from 'vitest';
import { ITINERARY_FIXTURE } from './fixtures';
import { convertForeignItinerary, parseImportedFile } from './importConverter';
import { parseItinerary } from './responseParser';

type Any = any; // eslint-disable-line @typescript-eslint/no-explicit-any

const english = {
  trip: 'Lisbon',
  startDate: '2027-05-10',
  endDate: '2027-05-11',
  days: [
    { date: '2027-05-10', activities: [{ time: '9:30', name: 'Belém Tower', location: { name: 'Torre de Belém', lat: 38.6916, lng: -9.2160 }, duration: '2h' }] },
    { date: '2027-05-11', activities: [{ time: '14:00', name: 'Alfama walk', duration: '1.5 h' }] },
  ],
};

const french = {
  voyage: 'Séville',
  jours: [
    { date: '10/05/2027', etapes: ['Visite de la cathédrale', { titre: 'Tapas', heure: '14h', duree: '1h30', lieu: 'Séville' }] },
  ],
};

describe('convertForeignItinerary', () => {
  it('JSON anglais « style ChatGPT »', () => {
    const r = convertForeignItinerary(english)!;
    expect(r).not.toBeNull();
    expect([r.startDate, r.endDate, r.destination]).toEqual(['2027-05-10', '2027-05-11', 'Lisbon']);
    const it = r.itinerary as Any;
    expect(it.v).toBe(1);
    expect(it.kind).toBe('itinerary');
    expect(it.trip.name).toBe('Lisbon');
    const s = it.days[0].stops[0];
    expect(s.startTime).toBe('09:30');
    expect(s.durationMin).toBe(120);
    expect(s.title).toBe('Belém Tower');
    expect(s.place).toMatchObject({ name: 'Torre de Belém', lat: 38.6916, lon: -9.216 });
    expect(it.days[1].stops[0].durationMin).toBe(90);
    const parsed = parseItinerary(JSON.stringify(r.itinerary), { tripDays: 2 });
    expect(parsed.ok).toBe(true);
  });

  it('JSON français : dates JJ/MM/AAAA, durée, chaîne seule', () => {
    const r = convertForeignItinerary(french)!;
    expect(r.startDate).toBe('2027-05-10');
    expect(r.endDate).toBe('2027-05-10');
    expect(r.destination).toBe('Séville');
    const stops = (r.itinerary as Any).days[0].stops;
    expect(stops[0].title).toBe('Visite de la cathédrale');
    expect(stops[0].startTime).toBeNull();
    expect(stops[1]).toMatchObject({ title: 'Tapas', startTime: '14:00', durationMin: 90 });
    expect(stops[1].place.name).toBe('Séville');
    expect(parseItinerary(JSON.stringify(r.itinerary), { tripDays: 1 }).ok).toBe(true);
  });

  it('formats d’heure et de durée', () => {
    const mk = (extra: object) => (convertForeignItinerary({ days: [{ steps: [{ title: 'x', ...extra }] }] })!.itinerary as Any).days[0].stops[0];
    expect(mk({ heure: '9h30' }).startTime).toBe('09:30');
    expect(mk({ heure: '9h' }).startTime).toBe('09:00');
    expect(mk({ start: '23:05' }).startTime).toBe('23:05');
    expect(mk({ time: '25:00' }).startTime).toBeNull();
    expect(mk({ duration: 45 }).durationMin).toBe(45);
    expect(mk({ duree: '90 min' }).durationMin).toBe(90);
    expect(mk({ minutes: '1h30' }).durationMin).toBe(90);
    expect(mk({ duration: 'long' }).durationMin).toBeNull();
  });

  it('clés insensibles à la casse et aux accents', () => {
    const r = convertForeignItinerary({ Itinéraire: [{ Étapes: [{ Activité: 'Musée', Durée: '2h', Ville: 'Lyon', Pays: 'France' }] }] })!;
    const s = (r.itinerary as Any).days[0].stops[0];
    expect(s).toMatchObject({ title: 'Musée', durationMin: 120 });
    expect(s.place).toMatchObject({ city: 'Lyon', country: 'France' });
  });

  it('racine tableau', () => {
    const r = convertForeignItinerary([{ title: 'Jour A', activities: ['Marché'] }])!;
    expect((r.itinerary as Any).days[0]).toMatchObject({ day: 1, title: 'Jour A' });
  });

  it('hôtel détecté en lodging', () => {
    const r = convertForeignItinerary({ days: [{ stops: ['Nuit à l’hôtel Gion', 'Check-in Airbnb', { title: 'Dîner', type: 'Hébergement' }, 'Visite'] }] })!;
    const kinds = (r.itinerary as Any).days[0].stops.map((s: Any) => s.kind);
    expect(kinds).toEqual(['lodging', 'lodging', 'lodging', 'activity']);
  });

  it('dates déduites des jours, devise, pays', () => {
    const r = convertForeignItinerary({
      name: 'Tour', currency: 'usd', pays: ['Italie', 'France'],
      days: [{ date: '2027-06-01', stops: ['a'] }, { date: '2027-06-03', stops: ['b'] }],
    })!;
    expect([r.startDate, r.endDate]).toEqual(['2027-06-01', '2027-06-03']);
    const t = (r.itinerary as Any).trip;
    expect(t.currency).toBe('USD');
    expect(t.countries).toEqual(['Italie', 'France']);
    expect((convertForeignItinerary({ devise: 'euros', days: [{ stops: ['a'] }] })!.itinerary as Any).trip.currency).toBe('EUR');
  });

  it('destination : champ dédié sinon nom du voyage', () => {
    expect(convertForeignItinerary({ name: 'N', destination: 'Rome', days: [{ stops: ['a'] }] })!.destination).toBe('Rome');
    expect(convertForeignItinerary({ titre: 'Mon périple', days: [{ stops: ['a'] }] })!.destination).toBe('Mon périple');
    expect(convertForeignItinerary({ days: [{ stops: ['a'] }] })!.destination).toBeNull();
  });

  it('plafonds : 30 jours, 12 étapes par jour', () => {
    const days = Array.from({ length: 40 }, (_, i) => ({ stops: Array.from({ length: 15 }, (_, j) => `e${i}-${j}`) }));
    const it = convertForeignItinerary({ days })!.itinerary as Any;
    expect(it.days).toHaveLength(30);
    expect(it.days[0].stops).toHaveLength(12);
    expect(it.days[29].day).toBe(30);
    expect(parseItinerary(JSON.stringify(it), { tripDays: 30 }).ok).toBe(true);
  });

  it('rien de reconnaissable : null', () => {
    expect(convertForeignItinerary({ foo: 1 })).toBeNull();
    expect(convertForeignItinerary('texte')).toBeNull();
    expect(convertForeignItinerary(null)).toBeNull();
    expect(convertForeignItinerary({ days: [] })).toBeNull();
    expect(convertForeignItinerary({ days: [{ date: '2027-01-01' }] })).toBeNull();
  });

  it('__proto__ sans effet, champs inconnus ignorés', () => {
    const raw = JSON.parse('{"__proto__":{"polluted":true},"secret":"x","days":[{"__proto__":{"p2":1},"bizarre":1,"stops":[{"__proto__":{"p3":1},"title":"a","extra":"z"}]}]}');
    const r = convertForeignItinerary(raw)!;
    const it = r.itinerary as Any;
    expect(({} as Any).polluted).toBeUndefined();
    expect(Object.keys(it).sort()).toEqual(['budget', 'checklist', 'days', 'kind', 'trip', 'v']);
    expect(Object.keys(it.days[0]).sort()).toEqual(['day', 'note', 'stops', 'title']);
    expect(Object.keys(it.days[0].stops[0]).sort()).toEqual(['durationMin', 'kind', 'note', 'place', 'startTime', 'title']);
    expect(JSON.stringify(it)).not.toMatch(/polluted|secret|bizarre|extra|p2|p3/);
  });
});

describe('parseImportedFile', () => {
  it('format v1 reconnu tel quel', () => {
    const r = parseImportedFile(JSON.stringify(ITINERARY_FIXTURE));
    expect(r.kind).toBe('v1');
    if (r.kind === 'v1') {
      expect(r.name).toBe('Kyoto express');
      expect([r.dayCount, r.stopCount]).toEqual([3, 5]);
    }
  });

  it('v1 entouré de texte / balises', () => {
    expect(parseImportedFile(`Voici :\n\`\`\`json\n${JSON.stringify(ITINERARY_FIXTURE)}\n\`\`\`\n`).kind).toBe('v1');
  });

  it('JSON étranger converti', () => {
    const r = parseImportedFile(JSON.stringify(english));
    expect(r.kind).toBe('converted');
    if (r.kind === 'converted') {
      expect([r.dayCount, r.stopCount, r.startDate, r.endDate, r.destination]).toEqual([2, 2, '2027-05-10', '2027-05-11', 'Lisbon']);
      expect(parseItinerary(r.text, { tripDays: 2 }).ok).toBe(true);
    }
  });

  it('JSON étranger dans une balise markdown', () => {
    expect(parseImportedFile(`# Plan\n\n\`\`\`json\n${JSON.stringify(french)}\n\`\`\`\n`).kind).toBe('converted');
  });

  it('texte libre : unknown', () => {
    const r = parseImportedFile('Jour 1 : Visite du Louvre\nJour 2 : Versailles');
    expect(r.kind).toBe('unknown');
  });

  it('JSON sans jours : unknown', () => {
    expect(parseImportedFile('{"hello":"world"}').kind).toBe('unknown');
  });

  it('texte trop long : unknown avec raison', () => {
    const r = parseImportedFile('a'.repeat(200_001));
    expect(r.kind).toBe('unknown');
    if (r.kind === 'unknown') expect(r.reason).toMatch(/trop long/);
  });

  it('idées v1 : unknown', () => {
    expect(parseImportedFile('{"v":1,"kind":"ideas","ideas":[]}').kind).toBe('unknown');
  });
});
