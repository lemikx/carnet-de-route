import type { IdeasResponse, ItineraryResponse } from './types';

const visaYes = {
  required: true as const, type: 'e-visa', processingDaysMin: 3, processingDaysMax: 10,
  officialUrl: 'https://www.example.org/visa', notes: 'À demander en ligne.',
};

export const IDEAS_FIXTURE: IdeasResponse = {
  v: 1,
  kind: 'ideas',
  ideas: [
    {
      id: 'kyoto', destination: 'Kyoto', country: 'JP', summary: 'Temples, jardins et cuisine fine.', durationDays: 3,
      highlights: ['Fushimi Inari', 'Arashiyama'], budgetPerPersonEur: 1800, whyItMatches: 'Culture et gastronomie.',
      visa: { required: false, type: '', processingDaysMin: null, processingDaysMax: null, officialUrl: null, notes: 'Pas de visa pour 90 jours.' },
    },
    {
      id: 'hanoi', destination: 'Hanoï', country: 'VN', summary: 'Vie locale et street food.', durationDays: 3,
      highlights: ['Vieux quartier'], budgetPerPersonEur: 1200, whyItMatches: 'Vie locale.', visa: visaYes,
    },
    {
      id: 'lagos', destination: 'Lagos', country: 'NG', summary: 'Énergie urbaine.', durationDays: 3,
      highlights: ['Marchés'], budgetPerPersonEur: 1400, whyItMatches: 'Hors des sentiers battus.',
      visa: { ...visaYes, processingDaysMin: 30, processingDaysMax: 3000 },
    },
  ],
};

const stop = (title: string, name: string, startTime: string | null, durationMin: number | null, kind: 'activity' | 'lodging' | 'point' = 'activity') => ({
  title, kind, place: { name, city: 'Kyoto', country: 'Japon' }, startTime, durationMin, note: '',
});

export const ITINERARY_FIXTURE: ItineraryResponse = {
  v: 1,
  kind: 'itinerary',
  trip: { name: 'Kyoto express', countries: ['Japon'], currency: 'JPY', visa: { ...visaYes } },
  days: [
    { day: 1, title: 'Arrivée', note: '', stops: [stop('Fushimi Inari', 'Fushimi Inari Taisha', '10:00', 120), stop('Hôtel Gion', 'Hotel Gion', null, null, 'lodging')] },
    { day: 2, title: 'Arashiyama', note: '', stops: [stop('Bambouseraie', 'Arashiyama Bamboo Grove', '09:00', 90), stop('Temple Tenryu-ji', 'Tenryu-ji', '11:00', 60)] },
    { day: 3, title: 'Départ', note: '', stops: [stop('Kinkaku-ji', 'Kinkaku-ji', '09:30', 75)] },
  ],
  checklist: [
    { category: 'documents', label: 'Passeport valide 6 mois', daysBeforeDeparture: 60 },
    { category: 'health', label: 'Assurance voyage', daysBeforeDeparture: 14 },
  ],
  budget: [
    { category: 'lodging', label: 'Hôtel', amount: 12000, currency: 'JPY', mode: 'per_day' },
    { category: 'food', label: 'Repas', amount: 30, currency: 'EUR', mode: 'per_person_per_day' },
  ],
};

/** Simule la réponse de Claude : le JSON seul, dans une balise, ou entouré de texte. */
export function asReply(obj: unknown, wrap: 'fence' | 'text' | 'raw' = 'fence'): string {
  const json = JSON.stringify(obj, null, 2);
  if (wrap === 'raw') return json;
  if (wrap === 'text') return `Voici ton itinéraire ! {😀}\n${json}\nBon voyage {vraiment}.`;
  return `Voici ma proposition :\n\n\`\`\`json\n${json}\n\`\`\`\n\nBon voyage !`;
}
