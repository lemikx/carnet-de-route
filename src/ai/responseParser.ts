import { LIMITS } from './limits';
import type { IdeasResponse, ItineraryResponse } from './types';
import { validateIdeas, validateItinerary } from './validate';

export type ParseResult<T> =
  | { ok: true; value: T; warnings: string[] }
  | { ok: false; errors: string[]; truncated: boolean };

/** Cherche le bloc JSON : balise ```json d'abord, sinon premier objet équilibré portant « v ». */
export function extractJson(text: string): { json: string } | { truncated: true } | null {
  const fence = /```(?:json)?[ \t]*\r?\n?/i.exec(text);
  if (fence && /```json/i.test(text)) {
    const start = text.search(/```json/i);
    const afterOpen = text.indexOf('\n', start);
    const body = afterOpen === -1 ? '' : text.slice(afterOpen + 1);
    const end = body.indexOf('```');
    if (end === -1) return body.trim() ? { truncated: true } : null;
    return { json: body.slice(0, end).trim() };
  }
  const candidates: string[] = [];
  let i = 0;
  let sawUnclosed = false;
  while (i < text.length) {
    if (text[i] !== '{') { i++; continue; }
    let depth = 0;
    let inStr = false;
    let esc = false;
    let j = i;
    for (; j < text.length; j++) {
      const c = text[j];
      if (inStr) {
        if (esc) esc = false;
        else if (c === '\\') esc = true;
        else if (c === '"') inStr = false;
      } else if (c === '"') inStr = true;
      else if (c === '{') depth++;
      else if (c === '}') { depth--; if (depth === 0) break; }
    }
    if (depth !== 0) { sawUnclosed = true; break; }
    candidates.push(text.slice(i, j + 1));
    i = j + 1;
  }
  const withV = candidates.find((c) => {
    try { const o = JSON.parse(c); return typeof o === 'object' && o !== null && 'v' in o; } catch { return false; }
  });
  if (withV) return { json: withV };
  if (sawUnclosed) return { truncated: true };
  if (candidates.length) return { json: candidates.reduce((a, b) => (b.length > a.length ? b : a)) };
  return null;
}

function read(text: string, kind: 'ideas' | 'itinerary'): { raw: unknown } | { fail: { ok: false; errors: string[]; truncated: boolean } } {
  const fail = (errors: string[], truncated = false) => ({ fail: { ok: false as const, errors, truncated } });
  if (text.length > LIMITS.responseChars) {
    return fail([`La réponse est trop longue (plus de ${LIMITS.responseChars} caractères).`]);
  }
  const found = extractJson(text);
  if (!found) return fail(['Je n’ai pas trouvé de bloc JSON dans la réponse. Colle la réponse complète de Claude.']);
  if ('truncated' in found) {
    return fail(['La réponse semble coupée : le bloc JSON n’est pas terminé. Demande à Claude de continuer, puis colle tout.'], true);
  }
  let raw: unknown;
  try {
    raw = JSON.parse(found.json);
  } catch (e) {
    return fail([`Je n’arrive pas à lire la réponse : ${(e as Error).message}`]);
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return fail(['La réponse n’est pas un objet JSON.']);
  const o = raw as Record<string, unknown>;
  if (o.v !== 1) return fail([`Cette réponse suit une autre version du protocole (v${String(o.v)}).`]);
  if (o.kind !== kind) {
    const other = o.kind === 'itinerary' ? 'un itinéraire' : o.kind === 'ideas' ? 'des idées' : 'autre chose';
    return fail([`Cette réponse est ${other}, pas ${kind === 'ideas' ? 'des idées' : 'un itinéraire'}.`]);
  }
  return { raw };
}

export function parseIdeas(text: string): ParseResult<IdeasResponse> {
  const r = read(text, 'ideas');
  if ('fail' in r) return r.fail;
  const v = validateIdeas(r.raw);
  return 'errors' in v ? { ok: false, errors: v.errors, truncated: false } : { ok: true, ...v };
}

export function parseItinerary(text: string, opts: { tripDays: number }): ParseResult<ItineraryResponse> {
  const r = read(text, 'itinerary');
  if ('fail' in r) return r.fail;
  const v = validateItinerary(r.raw, opts);
  return 'errors' in v ? { ok: false, errors: v.errors, truncated: false } : { ok: true, ...v };
}
