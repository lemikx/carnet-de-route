import { LIMITS } from './limits';
import { extractJson } from './responseParser';

type Obj = Record<string, unknown>;

export interface ConvertedItinerary {
  itinerary: unknown;
  startDate: string | null;
  endDate: string | null;
  destination: string | null;
}

export type ImportedFile =
  | { kind: 'v1'; itinerary: unknown; text: string; name: string; dayCount: number; stopCount: number; startDate: null; endDate: null; destination: string | null }
  | { kind: 'converted'; itinerary: unknown; text: string; name: string; dayCount: number; stopCount: number; startDate: string | null; endDate: string | null; destination: string | null }
  | { kind: 'unknown'; reason: string };

const isObj = (x: unknown): x is Obj => typeof x === 'object' && x !== null && !Array.isArray(x);

/** « Itinéraire » → « itineraire », « start_time » → « starttime ». */
const plain = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const norm = (s: string) => plain(s).replace(/[^a-z0-9]/g, '');

/** Première valeur présente parmi `names` (par ordre de priorité) ; lit seulement des clés propres, jamais le prototype. */
function pick(o: Obj, names: string[]): unknown {
  const entries = Object.entries(o).map(([k, v]) => [norm(k), v] as const);
  for (const n of names) {
    const hit = entries.find(([k, v]) => k === n && v !== undefined && v !== null && v !== '');
    if (hit) return hit[1];
  }
  return undefined;
}

const str = (x: unknown): string => (typeof x === 'string' ? x.trim() : typeof x === 'number' && Number.isFinite(x) ? String(x) : '');

/** Texte d'une valeur : chaîne, ou liste de chaînes jointes. */
function text(x: unknown): string {
  if (Array.isArray(x)) return x.slice(0, 20).map(str).filter(Boolean).join(' ; ');
  return str(x);
}

function parseDate(x: unknown): string | null {
  if (typeof x !== 'string') return null;
  const t = x.trim();
  let y: number; let m: number; let d: number;
  const iso = /^(\d{4})-(\d{2})-(\d{2})(?:$|[T\s])/.exec(t);
  const fr = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(t);
  if (iso) [y, m, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  else if (fr) [d, m, y] = [Number(fr[1]), Number(fr[2]), Number(fr[3])];
  else return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function parseTime(x: unknown): string | null {
  if (typeof x !== 'string') return null;
  const t = x.trim().toLowerCase();
  const m = /^(\d{1,2})\s*(?::|h)\s*(\d{2})?\s*(am|pm)?(?![\d])/.exec(t) ?? /^(\d{1,2})\s*(am|pm)$/.exec(t);
  if (!m) return null;
  let h = Number(m[1]);
  const mins = m.length === 4 ? Number(m[2] ?? 0) : 0;
  const ap = m.length === 4 ? m[3] : m[2];
  if (ap === 'pm' && h < 12) h += 12;
  if (ap === 'am' && h === 12) h = 0;
  if (h > 23 || mins > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

function parseDuration(x: unknown): number | null {
  let minutes: number | null = null;
  if (typeof x === 'number') minutes = x;
  else if (typeof x === 'string') {
    const t = x.trim().toLowerCase().replace(',', '.');
    let m: RegExpExecArray | null;
    if ((m = /^(\d+(?:\.\d+)?)$/.exec(t))) minutes = Number(m[1]);
    else if ((m = /^(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hour|hours|heure|heures)\s*(?:(\d+)\s*(?:m|min|mins|minutes?)?)?$/.exec(t))) minutes = Number(m[1]) * 60 + Number(m[2] ?? 0);
    else if ((m = /^(\d+(?:\.\d+)?)\s*(?:m|min|mins|minute|minutes)$/.exec(t))) minutes = Number(m[1]);
  }
  if (minutes === null || !Number.isFinite(minutes)) return null;
  const r = Math.round(minutes);
  return r >= 1 && r <= LIMITS.maxDurationMin ? r : null;
}

function coord(x: unknown, max: number): number | null {
  const n = typeof x === 'number' ? x : typeof x === 'string' && x.trim() !== '' ? Number(x.trim().replace(',', '.')) : NaN;
  return Number.isFinite(n) && Math.abs(n) <= max ? n : null;
}

const LODGING = /\b(hotel|nuit|hebergement|logement|airbnb|lodging|accommodation)/;

const DAY_KEYS = ['days', 'jours', 'itinerary', 'itineraire', 'planning', 'schedule', 'programme', 'plan'];
const STOP_KEYS = ['stops', 'etapes', 'steps', 'activities', 'activites', 'items', 'events', 'visites', 'visits', 'places', 'programme'];

function convertStop(raw: unknown, fallback: { city: string; country: string }): Obj | null {
  if (typeof raw === 'string') {
    const title = raw.trim();
    if (!title) return null;
    return stopOut(title, title, fallback.city, fallback.country, null, null, null, null, '', title);
  }
  if (!isObj(raw)) return null;
  const rawPlace = pick(raw, ['place', 'lieu', 'location', 'adresse', 'address']);
  const placeObj = isObj(rawPlace) ? rawPlace : {};
  const placeName = typeof rawPlace === 'string' ? rawPlace.trim() : str(pick(placeObj, ['name', 'nom', 'title', 'titre', 'label', 'address', 'adresse']));
  const title = str(pick(raw, ['title', 'titre', 'name', 'nom', 'activity', 'activite', 'label'])) || placeName;
  if (!title) return null;
  const city = str(pick(raw, ['city', 'ville'])) || str(pick(placeObj, ['city', 'ville'])) || fallback.city;
  const country = str(pick(raw, ['country', 'pays'])) || str(pick(placeObj, ['country', 'pays'])) || fallback.country;
  const latRaw = pick(raw, ['lat', 'latitude']) ?? pick(placeObj, ['lat', 'latitude']);
  const lonRaw = pick(raw, ['lon', 'lng', 'long', 'longitude']) ?? pick(placeObj, ['lon', 'lng', 'long', 'longitude']);
  const lat = coord(latRaw, 90);
  const lon = coord(lonRaw, 180);
  const type = str(pick(raw, ['type', 'kind', 'category', 'categorie']));
  return stopOut(
    title, placeName || title, city, country, lat, lon,
    parseTime(pick(raw, ['time', 'heure', 'start', 'starttime', 'debut', 'hour'])),
    parseDuration(pick(raw, ['durationmin', 'duration', 'duree', 'minutes'])),
    text(pick(raw, ['note', 'notes', 'description', 'details', 'commentaire', 'comment'])),
    `${title} ${type}`,
  );
}

function stopOut(
  title: string, name: string, city: string, country: string, lat: number | null, lon: number | null,
  startTime: string | null, durationMin: number | null, note: string, kindText: string,
): Obj {
  const place: Obj = { name, city, country };
  if (lat !== null && lon !== null) { place.lat = lat; place.lon = lon; }
  return {
    title,
    kind: LODGING.test(plain(kindText)) ? 'lodging' : 'activity',
    place,
    startTime,
    durationMin,
    note,
  };
}

function findDays(root: unknown): unknown[] | null {
  if (Array.isArray(root)) return root;
  if (!isObj(root)) return null;
  for (const k of DAY_KEYS) {
    const v = pick(root, [k]);
    if (Array.isArray(v)) return v;
  }
  // Jours rangés dans un sous-objet (« itinerary: { days: [...] } », « trip: { days: [...] } »).
  for (const k of ['itinerary', 'itineraire', 'trip', 'voyage', 'plan', 'planning']) {
    const v = pick(root, [k]);
    if (isObj(v)) {
      const inner = findDays(v);
      if (inner) return inner;
    }
  }
  return null;
}

export function convertForeignItinerary(raw: unknown): ConvertedItinerary | null {
  const rawDays = findDays(raw);
  if (!rawDays) return null;
  const root: Obj = isObj(raw) ? raw : {};
  const sources: Obj[] = [root];
  for (const k of ['trip', 'voyage']) {
    const v = pick(root, [k]);
    if (isObj(v)) sources.push(v);
  }
  const meta = (names: string[]): unknown => {
    for (const s of sources) {
      const v = pick(s, names);
      if (v !== undefined) return v;
    }
    return undefined;
  };

  const nameRaw = meta(['name', 'title', 'nom', 'titre', 'trip', 'voyage']);
  const name = typeof nameRaw === 'string' ? nameRaw.trim() : '';
  const destRaw = meta(['destination']);
  const explicitDest = Array.isArray(destRaw) ? str(destRaw[0]) : str(destRaw);
  const destination = explicitDest || name || null;
  const countriesRaw = meta(['pays', 'country', 'countries']) ?? destRaw;
  const countries = (Array.isArray(countriesRaw) ? countriesRaw : [countriesRaw]).slice(0, 20).map(str).filter(Boolean);
  const cur = str(meta(['devise', 'currency'])).toUpperCase();
  const fallback = { city: destination && !countries.includes(destination) ? destination : '', country: countries[0] ?? '' };

  const days: Obj[] = [];
  const dates: string[] = [];
  let stopCount = 0;
  for (const d of rawDays.slice(0, LIMITS.days)) {
    let title = '';
    let note = '';
    let rawStops: unknown[] = [];
    if (typeof d === 'string') title = d.trim();
    else if (isObj(d)) {
      const date = parseDate(pick(d, ['date']));
      if (date) dates.push(date);
      title = str(pick(d, ['title', 'titre', 'theme']));
      note = text(pick(d, ['notes', 'note']));
      for (const k of STOP_KEYS) {
        const v = pick(d, [k]);
        if (Array.isArray(v)) { rawStops = v; break; }
      }
    } else continue;
    const stops = rawStops.slice(0, LIMITS.stopsPerDay).map((s) => convertStop(s, fallback)).filter((s): s is Obj => s !== null);
    stopCount += stops.length;
    days.push({ day: days.length + 1, title, note, stops });
  }
  if (days.length === 0 || stopCount === 0) return null;

  const startDate = parseDate(meta(['startdate', 'datedebut', 'start', 'debut', 'depart'])) ?? dates[0] ?? null;
  const endDate = parseDate(meta(['enddate', 'datefin', 'end', 'fin', 'retour'])) ?? (dates.length ? dates[dates.length - 1] : null);

  return {
    itinerary: {
      v: 1,
      kind: 'itinerary',
      trip: { name, countries, currency: /^[A-Z]{3}$/.test(cur) ? cur : 'EUR' },
      days,
      checklist: [],
      budget: [],
    },
    startDate,
    endDate,
    destination,
  };
}

function summarize(itinerary: unknown): { dayCount: number; stopCount: number } {
  const days = isObj(itinerary) && Array.isArray(itinerary.days) ? itinerary.days : [];
  const stopCount = days.reduce<number>((n, d) => n + (isObj(d) && Array.isArray(d.stops) ? d.stops.length : 0), 0);
  return { dayCount: days.length, stopCount };
}

function tryParse(s: string): { value: unknown } | null {
  try {
    return { value: JSON.parse(s.replace(/^\uFEFF/, '')) };
  } catch {
    return null;
  }
}

export function parseImportedFile(input: string): ImportedFile {
  if (input.length > LIMITS.responseChars) {
    return { kind: 'unknown', reason: `Le fichier est trop long (plus de ${LIMITS.responseChars} caractères).` };
  }
  // 1. Format v1 de l'appli, éventuellement entouré de texte ou de balises.
  const found = extractJson(input);
  if (found && 'json' in found) {
    const p = tryParse(found.json);
    if (p && isObj(p.value) && p.value.v === 1) {
      if (p.value.kind !== 'itinerary') return { kind: 'unknown', reason: 'Ce fichier contient autre chose qu’un itinéraire.' };
      const trip = isObj(p.value.trip) ? p.value.trip : {};
      const name = str(trip.name);
      return { kind: 'v1', itinerary: p.value, text: input, name, ...summarize(p.value), startDate: null, endDate: null, destination: name || null };
    }
  }
  // 2. Autre JSON : fichier entier, sinon bloc JSON trouvé dans le texte.
  const whole = tryParse(input.trim());
  const candidates = [whole?.value, found && 'json' in found ? tryParse(found.json)?.value : undefined];
  for (const c of candidates) {
    if (c === undefined) continue;
    const conv = convertForeignItinerary(c);
    if (conv) {
      const trip = (conv.itinerary as { trip: { name: string } }).trip;
      return { kind: 'converted', itinerary: conv.itinerary, text: JSON.stringify(conv.itinerary), name: trip.name, ...summarize(conv.itinerary), startDate: conv.startDate, endDate: conv.endDate, destination: conv.destination };
    }
  }
  return { kind: 'unknown', reason: whole ? 'Aucun jour reconnaissable dans ce JSON.' : 'Ce fichier n’est pas un JSON d’itinéraire.' };
}
