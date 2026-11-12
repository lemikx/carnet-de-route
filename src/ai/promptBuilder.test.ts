import { describe, expect, it } from 'vitest';
import { buildContinuePrompt, buildIdeasPrompt, buildItineraryPrompt, openInClaudeUrl } from './promptBuilder';
import { IDEAS_FIXTURE } from './fixtures';
import type { Brief } from './types';

const brief = (o: Partial<Brief> = {}): Brief => ({
  destination: null, startDate: '2026-12-20', endDate: '2026-12-24', departureCity: 'Lyon', adults: 2, children: 0,
  travelers: [{ name: 'Mikael', nationality: 'FR' }, { name: '', nationality: 'BE' }],
  budgetPerPersonEur: 1500, travelerTypes: ['cultural'], tripTypes: ['city_stay'], wishes: ['food'], lodging: ['hotel'],
  pace: 'calm', constraints: 'Pas de "vol de nuit"\nSans escale', ...o,
});

describe('promptBuilder', () => {
  it('demande d’idées complète', () => {
    const p = buildIdeasPrompt(brief(), '2026-11-12');
    for (const s of ['recherche web', '"v": 1', '"kind": "ideas"', 'exactement 3', 'FR', 'BE', '2026-12-20', '2026-12-24', 'Culturel', 'Gastronomie', 'Hôtel', 'Lyon']) {
      expect(p).toContain(s);
    }
    expect(p).not.toContain('cultural');
  });
  it('demande d’itinéraire', () => {
    const idea = IDEAS_FIXTURE.ideas[0];
    const p = buildItineraryPrompt(brief(), idea, '2026-11-12');
    for (const s of ['Kyoto', 'JP', '"kind": "itinerary"', 'daysBeforeDeparture', 'place', 'mode', 'recherche web']) expect(p).toContain(s);
    expect(() => buildItineraryPrompt(brief(), null, '2026-11-12')).toThrow();
    expect(buildItineraryPrompt(brief({ destination: 'Lisbonne' }), null, '2026-11-12')).toContain('Lisbonne');
  });
  it('champs absents omis', () => {
    const p = buildIdeasPrompt(brief({ budgetPerPersonEur: null, constraints: '', pace: null, departureCity: null }), '2026-11-12');
    expect(p).not.toMatch(/null|undefined/);
    expect(p).not.toContain('Budget par personne');
    expect(p).not.toContain('Contraintes');
  });
  it('contraintes insérées telles quelles', () => {
    expect(buildIdeasPrompt(brief(), '2026-11-12')).toContain('Pas de "vol de nuit"\nSans escale');
  });
  it('lien Ouvrir dans Claude', () => {
    const p = buildIdeasPrompt(brief({ constraints: '' }), '2026-11-12');
    const url = openInClaudeUrl(p, 100000);
    expect(url?.startsWith('https://claude.ai/new?q=')).toBe(true);
    expect(decodeURIComponent(url!.split('?q=')[1])).toBe(p);
    expect(openInClaudeUrl('x'.repeat(6001))).toBeNull();
  });
  it('demande de suite', () => {
    expect(buildContinuePrompt()).toContain('continue exactement où tu t’es arrêté');
  });
});
