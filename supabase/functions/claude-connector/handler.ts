// Serveur MCP « Carnet de route » : permet à Claude de déposer un brouillon de voyage, et rien d'autre.
// Aucun import : ce fichier est chargé tel quel par Deno et testé avec Vitest (dépendances injectées).

type ParseResult =
  | { ok: true; value: { days: unknown[] }; warnings: string[] }
  | { ok: false; errors: string[]; truncated: boolean };

export interface ConnectorDeps {
  /** null = jeton invalide ou révoqué ; sinon le dernier questionnaire de l'utilisateur (ou null). */
  lastBrief(token: string): Promise<{ brief: unknown } | null>;
  createDraft(token: string, brief: unknown, itinerary: unknown): Promise<{ id: string } | { error: 'UNAUTHORIZED' | 'RATE_LIMIT' | 'FAILED' }>;
  parseItinerary(text: string, opts: { tripDays: number }): ParseResult;
  buildPrompt(brief: unknown, today: string): string;
  today(): string;
  appUrl: string;
}

const MAX_BODY = 300_000;
const MAX_DAYS = 30;
const SERVER = { name: 'carnet-de-route', version: '1.0.0' };

const DEFAULT_BRIEF = {
  destination: null, startDate: '', endDate: '', departureCity: null, adults: 1, children: 0, travelers: [],
  budgetPerPersonEur: null, travelerTypes: [], tripTypes: [], wishes: [], lodging: [], pace: null, constraints: '',
};

const TOOLS = [
  {
    name: 'get_itinerary_format',
    description:
      "À appeler en premier. Renvoie les consignes et le format JSON exact de l'itinéraire attendu par l'appli Carnet de route, avec les préférences habituelles du voyageur (voyageurs, nationalités, ville de départ, budget, profil).",
    inputSchema: {
      type: 'object',
      properties: {
        destination: { type: 'string', description: 'Destination du voyage' },
        startDate: { type: 'string', description: 'Date de départ, AAAA-MM-JJ' },
        endDate: { type: 'string', description: 'Date de retour, AAAA-MM-JJ' },
      },
      required: ['destination', 'startDate', 'endDate'],
    },
  },
  {
    name: 'create_trip_draft',
    description:
      "Dépose l'itinéraire dans l'appli Carnet de route comme brouillon à valider par le voyageur. « itinerary » est l'objet JSON au format renvoyé par get_itinerary_format.",
    inputSchema: {
      type: 'object',
      properties: {
        destination: { type: 'string' },
        startDate: { type: 'string', description: 'AAAA-MM-JJ' },
        endDate: { type: 'string', description: 'AAAA-MM-JJ' },
        itinerary: { type: 'object', description: 'Itinéraire au format JSON v1 (kind "itinerary")' },
      },
      required: ['startDate', 'endDate', 'itinerary'],
    },
  },
];

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const text = (id: unknown, t: string, isError = false) =>
  json({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: t }], ...(isError ? { isError: true } : {}) } });

const DATE = /^\d{4}-\d{2}-\d{2}$/;
function tripDays(start: unknown, end: unknown): number | string {
  if (typeof start !== 'string' || typeof end !== 'string' || !DATE.test(start) || !DATE.test(end)) {
    return 'Dates invalides : utilise le format AAAA-MM-JJ pour startDate et endDate.';
  }
  const a = Date.parse(`${start}T00:00:00Z`);
  const b = Date.parse(`${end}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 'Dates invalides.';
  if (b < a) return 'La date de retour doit être après la date de départ.';
  const n = Math.round((b - a) / 86_400_000) + 1;
  if (n > MAX_DAYS) return `Voyage trop long : ${n} jours (maximum ${MAX_DAYS}).`;
  return n;
}

function briefFor(last: unknown, args: Record<string, unknown>) {
  const base = last && typeof last === 'object' && !Array.isArray(last) ? (last as Record<string, unknown>) : {};
  const destination = typeof args.destination === 'string' && args.destination.trim() ? args.destination.trim().slice(0, 120) : null;
  return { ...DEFAULT_BRIEF, ...base, destination, startDate: args.startDate, endDate: args.endDate };
}

function tokenOf(req: Request): string {
  const h = req.headers.get('Authorization') ?? '';
  const m = /^Bearer\s+(\S+)$/i.exec(h);
  if (m) return m[1];
  return new URL(req.url).searchParams.get('token') ?? '';
}

export async function handleConnector(req: Request, deps: ConnectorDeps): Promise<Response> {
  if (req.method !== 'POST') return json({ error: 'Méthode non autorisée' }, 405);
  const token = tokenOf(req);
  const raw = await req.text();
  if (raw.length > MAX_BODY) return json({ error: 'Requête trop volumineuse' }, 413);
  const session = token ? await deps.lastBrief(token) : null;
  if (!session) return json({ error: 'Adresse du connecteur invalide ou révoquée' }, 401);

  let msg: { id?: unknown; method?: unknown; params?: Record<string, unknown> };
  try {
    msg = JSON.parse(raw);
  } catch {
    return json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'JSON invalide' } }, 400);
  }
  if (!msg || typeof msg !== 'object' || Array.isArray(msg)) {
    return json({ jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Requête invalide' } }, 400);
  }
  const id = msg.id ?? null;
  // Notification (pas d'identifiant) : rien à répondre.
  if (msg.id === undefined) return new Response(null, { status: 202 });

  switch (msg.method) {
    case 'initialize': {
      const asked = typeof msg.params?.protocolVersion === 'string' ? msg.params.protocolVersion : '2025-06-18';
      return json({
        jsonrpc: '2.0', id,
        result: {
          protocolVersion: asked,
          capabilities: { tools: {} },
          serverInfo: SERVER,
          instructions: 'Pour créer un voyage : appelle get_itinerary_format, prépare l’itinéraire (avec la recherche web), puis create_trip_draft.',
        },
      });
    }
    case 'ping':
      return json({ jsonrpc: '2.0', id, result: {} });
    case 'tools/list':
      return json({ jsonrpc: '2.0', id, result: { tools: TOOLS } });
    case 'tools/call': {
      const name = msg.params?.name;
      const args = (msg.params?.arguments ?? {}) as Record<string, unknown>;
      if (name !== 'get_itinerary_format' && name !== 'create_trip_draft') {
        return json({ jsonrpc: '2.0', id, error: { code: -32602, message: `Outil inconnu : ${String(name)}` } });
      }
      const days = tripDays(args.startDate, args.endDate);
      if (typeof days === 'string') return text(id, days, true);
      const brief = briefFor(session.brief, args);

      if (name === 'get_itinerary_format') {
        if (!brief.destination) return text(id, 'Indique la destination (« destination »).', true);
        const prompt = deps.buildPrompt(brief, deps.today());
        return text(id, `${prompt}

IMPORTANT pour ce connecteur : ne réponds pas avec un bloc de code. Une fois l'itinéraire prêt (${days} jours, du ${args.startDate} au ${args.endDate}), appelle l'outil create_trip_draft avec startDate, endDate, destination et l'objet JSON complet dans « itinerary ».`);
      }

      if (name === 'create_trip_draft') {
        const itinText = typeof args.itinerary === 'string' ? args.itinerary : JSON.stringify(args.itinerary ?? null);
        const r = deps.parseItinerary(itinText, { tripDays: days });
        if (!r.ok) return text(id, `Itinéraire refusé :\n- ${r.errors.join('\n- ')}\nCorrige puis rappelle create_trip_draft.`, true);
        const out = await deps.createDraft(token, brief, r.value);
        if ('error' in out) {
          const why = out.error === 'RATE_LIMIT' ? 'Limite atteinte : 20 brouillons par jour au plus.'
            : out.error === 'UNAUTHORIZED' ? 'Adresse du connecteur révoquée.' : 'Enregistrement impossible, réessaie plus tard.';
          return text(id, why, true);
        }
        const stops = r.value.days.reduce<number>((n, d) => n + (((d as { stops?: unknown[] }).stops ?? []).length), 0);
        const warn = r.warnings.length ? `\nAvertissements :\n- ${r.warnings.join('\n- ')}` : '';
        return text(id, `Brouillon déposé dans Carnet de route : ${r.value.days.length} jours, ${stops} étapes.${warn}
Le voyageur doit l'ouvrir et cliquer sur « Créer le voyage » : ${deps.appUrl}#/ia/${out.id}`);
      }
      return json({ jsonrpc: '2.0', id, error: { code: -32602, message: 'Outil inconnu' } });
    }
    default:
      return json({ jsonrpc: '2.0', id, error: { code: -32601, message: `Méthode inconnue : ${String(msg.method)}` } });
  }
}
