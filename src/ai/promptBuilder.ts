import { DateTime } from 'luxon';
import { LODGINGS, PACES, TRAVELER_TYPES, TRIP_TYPES, WISHES, labelsOf } from './options';
import type { Brief, Idea } from './types';

const IDEAS_FORMAT = `{
  "v": 1,
  "kind": "ideas",
  "ideas": [
    {
      "id": "court-identifiant",
      "destination": "Ville ou région",
      "country": "FR (code pays ISO à 2 lettres)",
      "summary": "Résumé en 1 à 2 phrases",
      "durationDays": 5,
      "highlights": ["Point fort 1", "Point fort 2"],
      "budgetPerPersonEur": 1500,
      "whyItMatches": "Pourquoi cela correspond au profil",
      "visa": {
        "required": true,
        "type": "e-visa",
        "processingDaysMin": 3,
        "processingDaysMax": 10,
        "officialUrl": "https://site-officiel",
        "notes": "Précisions"
      },
      "bestPeriod": { "text": "Meilleure période pour visiter ce pays, en 1 à 3 phrases (météo, affluence)", "goodMonths": [11, 12, 1, 2], "avoidMonths": [3, 4] }
    }
  ]
}
("required" vaut true, false ou "unknown" ; "goodMonths" et "avoidMonths" sont des numéros de mois de 1 à 12 ; si un délai est inconnu, omets simplement ce champ.)`;

const ITINERARY_FORMAT = `{
  "v": 1,
  "kind": "itinerary",
  "trip": {
    "name": "Nom du voyage",
    "countries": ["Pays"],
    "currency": "JPY (devise locale, code ISO à 3 lettres)",
    "visa": { "required": true, "type": "", "processingDaysMin": 3, "processingDaysMax": 10, "officialUrl": "https://site-officiel", "notes": "" },
    "bestPeriod": { "text": "Meilleure période pour visiter ce pays, en 1 à 3 phrases", "goodMonths": [11, 12, 1, 2], "avoidMonths": [3, 4] }
  },
  "days": [
    {
      "day": 1,
      "title": "Titre du jour",
      "note": "",
      "stops": [
        {
          "title": "Nom de l'étape",
          "kind": "activity | lodging | point",
          "place": { "name": "Nom exact du lieu", "city": "Ville", "country": "Pays" },
          "startTime": "09:30",
          "durationMin": 90,
          "note": ""
        }
      ]
    }
  ],
  "checklist": [
    { "category": "documents | health | luggage | before_departure", "label": "À faire", "daysBeforeDeparture": 30 }
  ],
  "budget": [
    { "category": "flight | lodging | local_transport | food | activity | shopping | contingency | other", "label": "Libellé", "amount": 100, "currency": "EUR", "mode": "fixed | per_person | per_day | per_person_per_day" }
  ]
}`;

function nights(b: Brief): number {
  const a = DateTime.fromISO(b.startDate, { zone: 'utc' });
  const z = DateTime.fromISO(b.endDate, { zone: 'utc' });
  return a.isValid && z.isValid ? Math.round(z.diff(a, 'days').days) : 0;
}

function briefLines(b: Brief): string {
  const l: string[] = [];
  l.push(`- Dates : du ${b.startDate} au ${b.endDate} (${nights(b) + 1} jours, ${nights(b)} nuits)`);
  if (b.departureCity) l.push(`- Ville de départ : ${b.departureCity}`);
  l.push(`- Voyageurs : ${b.adults} adulte(s), ${b.children} enfant(s)`);
  if (b.travelers.length) {
    l.push(`- Nationalités (pour les visas) : ${b.travelers.map((t, i) => `${t.name || `Voyageur ${i + 1}`} : ${t.nationality}`).join(' ; ')}`);
  }
  if (b.budgetPerPersonEur !== null) l.push(`- Budget par personne : ${b.budgetPerPersonEur} € (tout compris)`);
  const add = (label: string, list: string[]) => { if (list.length) l.push(`- ${label} : ${list.join(', ')}`); };
  add('Profil de voyageur', labelsOf(TRAVELER_TYPES, b.travelerTypes));
  add('Type de voyage', labelsOf(TRIP_TYPES, b.tripTypes));
  add('Envies', labelsOf(WISHES, b.wishes));
  add('Hébergement', labelsOf(LODGINGS, b.lodging));
  if (b.pace) add('Rythme', labelsOf(PACES, [b.pace]));
  if (b.constraints.trim()) l.push(`- Contraintes : ${b.constraints}`);
  return l.join('\n');
}

const RULES = `Règles de réponse :
- Utilise la recherche web pour vérifier les visas (délais de traitement officiels) et les prix.
- Réponds uniquement avec un seul bloc \`\`\`json, sans texte avant ni après.
- Heures au format HH:mm, durées en minutes, montants en nombres, dates AAAA-MM-JJ.
- Chaque lieu doit avoir son nom exact, sa ville et son pays.
- Pour « bestPeriod » : numéros de mois de 1 à 12 (1 = janvier), appuie-toi sur la recherche web.`;

export function buildIdeasPrompt(brief: Brief, today: string): string {
  return `Tu es un conseiller de voyage expert. Nous sommes le ${today}.
Propose-moi exactement 3 idées de destinations pour ce voyage :
${briefLines(brief)}

${RULES}

Format de réponse (exactement 3 idées dans « ideas ») :
\`\`\`json
${IDEAS_FORMAT}
\`\`\``;
}

export function buildItineraryPrompt(brief: Brief, idea: Idea | null, today: string): string {
  const dest = idea ? `${idea.destination} (${idea.country})` : brief.destination?.trim();
  if (!dest) throw new Error('Destination manquante pour construire l’itinéraire.');
  return `Tu es un conseiller de voyage expert. Nous sommes le ${today}.
Construis l'itinéraire jour par jour d'un voyage à : ${dest}.
${briefLines(brief)}

Inclus aussi une checklist de préparation (avec « daysBeforeDeparture ») et un budget estimé par catégories. Mets l'hébergement en dernière étape de chaque jour.

${RULES}

Format de réponse (un jour par date, numérotés à partir de 1) :
\`\`\`json
${ITINERARY_FORMAT}
\`\`\``;
}

export function buildContinuePrompt(): string {
  return 'Ta réponse a été coupée. Reprends et continue exactement où tu t’es arrêté, puis redonne le bloc ```json complet et valide.';
}

export function openInClaudeUrl(prompt: string, maxChars = 6000): string | null {
  if (prompt.length > maxChars) return null;
  return `https://claude.ai/new?q=${encodeURIComponent(prompt)}`;
}
