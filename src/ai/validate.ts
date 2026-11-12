import type { BudgetCategory, LineMode } from '../domain/budget/types';
import { BUDGET_CATEGORIES } from '../domain/budget/types';
import type { ChecklistCategory, StopKind } from '../domain/types';
import { LIMITS } from './limits';
import type {
  Idea, IdeasResponse, ItineraryBudgetLine, ItineraryChecklistItem, ItineraryDay, ItineraryResponse, ItineraryStop, VisaInfo,
} from './types';

type Obj = Record<string, unknown>;
type Out<T> = { value: T; warnings: string[] } | { errors: string[] };

const isObj = (x: unknown): x is Obj => typeof x === 'object' && x !== null && !Array.isArray(x);

export function cleanText(s: unknown, max: number = LIMITS.textChars): string {
  if (typeof s !== 'string') return '';
  // eslint-disable-next-line no-control-regex
  const t = s.replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, '');
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

export function safeUrl(u: unknown): string | null {
  if (typeof u !== 'string') return null;
  const t = u.trim();
  if (t.length > 2000 || !/^https:\/\/[^\s]+$/i.test(t)) return null;
  try {
    return new URL(t).protocol === 'https:' ? t : null;
  } catch {
    return null;
  }
}

function num(x: unknown, opts: { min?: number; int?: boolean } = {}): number | null {
  if (typeof x !== 'number' || !Number.isFinite(x)) return null;
  if (x < (opts.min ?? 0) || x > LIMITS.maxNumber) return null;
  if (opts.int && !Number.isInteger(x)) return null;
  return x;
}

const CHECKLIST_CATEGORIES: ChecklistCategory[] = ['documents', 'health', 'luggage', 'before_departure'];
const STOP_KINDS: StopKind[] = ['activity', 'lodging', 'point'];
const LINE_MODES: LineMode[] = ['fixed', 'per_person', 'per_day', 'per_person_per_day'];
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

const EMPTY_VISA: VisaInfo = { required: 'unknown', type: '', processingDaysMin: null, processingDaysMax: null, officialUrl: null, notes: '' };

function parseVisa(raw: unknown, where: string, errors: string[], warnings: string[]): VisaInfo {
  if (!isObj(raw)) return { ...EMPTY_VISA };
  const r = raw.required;
  if (r !== true && r !== false && r !== 'unknown') errors.push(`${where} : « required » du visa doit valoir true, false ou "unknown".`);
  const days = (key: 'processingDaysMin' | 'processingDaysMax') => {
    const v = raw[key];
    if (v === null || v === undefined) return null;
    const n = num(v, { int: true });
    if (n === null) errors.push(`${where} : « ${key} » du visa est invalide.`);
    return n;
  };
  const url = safeUrl(raw.officialUrl);
  if (raw.officialUrl && !url) warnings.push(`${where} : lien officiel du visa ignoré (https obligatoire).`);
  return {
    required: r === true || r === false ? r : 'unknown',
    type: cleanText(raw.type),
    processingDaysMin: days('processingDaysMin'),
    processingDaysMax: days('processingDaysMax'),
    officialUrl: url,
    notes: cleanText(raw.notes),
  };
}

export function validateIdeas(raw: unknown): Out<IdeasResponse> {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!isObj(raw) || !Array.isArray(raw.ideas)) return { errors: ['La réponse ne contient pas de liste « ideas ».'] };
  if (raw.ideas.length !== LIMITS.ideas) {
    return { errors: [`Il faut exactement ${LIMITS.ideas} idées (${raw.ideas.length} reçue(s)).`] };
  }
  const ideas: Idea[] = [];
  raw.ideas.forEach((it, i) => {
    if (!isObj(it)) { errors.push(`Idée ${i + 1} : format invalide.`); return; }
    const destination = cleanText(it.destination, 120);
    const where = `Idée « ${destination || i + 1} »`;
    if (!destination) errors.push(`Idée ${i + 1} : destination manquante.`);
    const dur = num(it.durationDays, { min: 1, int: true });
    if (dur === null) errors.push(`${where} : durée invalide.`);
    const budget = it.budgetPerPersonEur === null || it.budgetPerPersonEur === undefined ? null : num(it.budgetPerPersonEur);
    if (it.budgetPerPersonEur !== null && it.budgetPerPersonEur !== undefined && budget === null) errors.push(`${where} : budget invalide.`);
    ideas.push({
      id: cleanText(it.id, 60) || `idee-${i + 1}`,
      destination,
      country: cleanText(it.country, 60),
      summary: cleanText(it.summary),
      durationDays: dur ?? 0,
      highlights: Array.isArray(it.highlights) ? it.highlights.slice(0, 10).map((h) => cleanText(h, 200)).filter(Boolean) : [],
      budgetPerPersonEur: budget,
      whyItMatches: cleanText(it.whyItMatches),
      visa: parseVisa(it.visa, where, errors, warnings),
    });
  });
  if (errors.length) return { errors };
  return { value: { v: 1, kind: 'ideas', ideas }, warnings };
}

export function validateItinerary(raw: unknown, opts: { tripDays: number }): Out<ItineraryResponse> {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!isObj(raw) || !Array.isArray(raw.days)) return { errors: ['La réponse ne contient pas de liste « days ».'] };
  if (raw.days.length === 0) return { errors: ['L’itinéraire ne contient aucun jour.'] };
  if (raw.days.length > LIMITS.days) return { errors: [`Itinéraire trop long : ${raw.days.length} jours (maximum ${LIMITS.days}).`] };

  const days: ItineraryDay[] = [];
  let numbering = true;
  raw.days.forEach((d, i) => {
    if (!isObj(d)) { errors.push(`Jour ${i + 1} : format invalide.`); return; }
    if (d.day !== i + 1 && numbering) {
      numbering = false;
      errors.push('Les jours doivent être numérotés 1, 2, 3… sans trou ni doublon.');
    }
    const stopsRaw = Array.isArray(d.stops) ? d.stops : [];
    if (stopsRaw.length > LIMITS.stopsPerDay) {
      errors.push(`Jour ${i + 1} : ${stopsRaw.length} étapes (maximum ${LIMITS.stopsPerDay}).`);
      return;
    }
    const stops: ItineraryStop[] = [];
    stopsRaw.forEach((s, j) => {
      const where = `Jour ${i + 1}, étape ${j + 1}`;
      if (!isObj(s)) { errors.push(`${where} : format invalide.`); return; }
      if (!STOP_KINDS.includes(s.kind as StopKind)) errors.push(`${where} : type « ${cleanText(s.kind, 40)} » inconnu.`);
      let startTime: string | null = null;
      if (s.startTime !== null && s.startTime !== undefined) {
        if (typeof s.startTime === 'string' && TIME.test(s.startTime)) startTime = s.startTime;
        else errors.push(`${where} : l’heure « ${cleanText(s.startTime, 20)} » est invalide.`);
      }
      let durationMin: number | null = null;
      if (s.durationMin !== null && s.durationMin !== undefined) {
        durationMin = num(s.durationMin, { int: true });
        if (durationMin === null) errors.push(`${where} : durée invalide.`);
      }
      const p = isObj(s.place) ? s.place : {};
      const title = cleanText(s.title, 200);
      if (!title) errors.push(`${where} : titre manquant.`);
      stops.push({
        title,
        kind: STOP_KINDS.includes(s.kind as StopKind) ? (s.kind as StopKind) : 'activity',
        place: { name: cleanText(p.name, 200), city: cleanText(p.city, 120), country: cleanText(p.country, 120) },
        startTime,
        durationMin,
        note: cleanText(s.note),
      });
    });
    days.push({ day: i + 1, title: cleanText(d.title, 200), note: cleanText(d.note), stops });
  });

  const checklist: ItineraryChecklistItem[] = [];
  (Array.isArray(raw.checklist) ? raw.checklist : []).slice(0, 100).forEach((c, i) => {
    if (!isObj(c)) return;
    const label = cleanText(c.label, 200);
    if (!label) { warnings.push(`Élément de checklist ${i + 1} ignoré (libellé manquant).`); return; }
    const before = c.daysBeforeDeparture === null || c.daysBeforeDeparture === undefined ? null : num(c.daysBeforeDeparture, { int: true });
    checklist.push({
      category: CHECKLIST_CATEGORIES.includes(c.category as ChecklistCategory) ? (c.category as ChecklistCategory) : 'before_departure',
      label,
      daysBeforeDeparture: before,
    });
  });

  const budget: ItineraryBudgetLine[] = [];
  (Array.isArray(raw.budget) ? raw.budget : []).slice(0, 100).forEach((b, i) => {
    const where = `Budget, ligne ${i + 1}`;
    if (!isObj(b)) { errors.push(`${where} : format invalide.`); return; }
    const amount = num(b.amount);
    if (amount === null) errors.push(`${where} : montant invalide.`);
    if (!LINE_MODES.includes(b.mode as LineMode)) errors.push(`${where} : mode « ${cleanText(b.mode, 40)} » inconnu.`);
    const currency = typeof b.currency === 'string' ? b.currency.trim().toUpperCase() : '';
    if (!/^[A-Z]{3}$/.test(currency)) errors.push(`${where} : devise invalide.`);
    budget.push({
      category: BUDGET_CATEGORIES.includes(b.category as BudgetCategory) ? (b.category as BudgetCategory) : 'other',
      label: cleanText(b.label, 200),
      amount: amount ?? 0,
      currency,
      mode: LINE_MODES.includes(b.mode as LineMode) ? (b.mode as LineMode) : 'fixed',
    });
  });

  const t = isObj(raw.trip) ? raw.trip : {};
  const cur = typeof t.currency === 'string' ? t.currency.trim().toUpperCase() : '';
  const trip = {
    name: cleanText(t.name, 120),
    countries: Array.isArray(t.countries) ? t.countries.slice(0, 20).map((c) => cleanText(c, 60)).filter(Boolean) : [],
    currency: /^[A-Z]{3}$/.test(cur) ? cur : 'EUR',
    visa: parseVisa(t.visa, 'Voyage', errors, warnings),
  };

  if (errors.length) return { errors };
  if (days.length !== opts.tripDays) warnings.push(`${days.length} jours proposés pour ${opts.tripDays} dates.`);
  return { value: { v: 1, kind: 'itinerary', trip, days, checklist, budget }, warnings };
}
