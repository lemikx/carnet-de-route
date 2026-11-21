// Edge Function Supabase (Deno) : connecteur Claude « Carnet de route » (serveur MCP).
// Déploiement : npm run sync:domain && supabase functions deploy claude-connector --no-verify-jwt
import { createClient } from 'npm:@supabase/supabase-js@2.46.1';
import { parseItinerary } from '../_shared/ai/responseParser.ts';
import { buildItineraryPrompt } from '../_shared/ai/promptBuilder.ts';
import type { Brief } from '../_shared/ai/types.ts';
import { handleConnector } from './handler.ts';

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
});

Deno.serve((req) =>
  handleConnector(req, {
    async lastBrief(token) {
      const { data, error } = await admin.rpc('connector_last_brief', { p_token: token });
      return error || !data ? null : (data as { brief: unknown });
    },
    async createDraft(token, brief, itinerary) {
      const { data, error } = await admin.rpc('connector_create_draft', { p_token: token, p_brief: brief, p_itinerary: itinerary });
      if (error) {
        if (error.message.includes('RATE_LIMIT')) return { error: 'RATE_LIMIT' };
        if (error.message.includes('UNAUTHORIZED')) return { error: 'UNAUTHORIZED' };
        return { error: 'FAILED' };
      }
      return { id: String(data) };
    },
    parseItinerary,
    buildPrompt: (brief, today) => buildItineraryPrompt(brief as Brief, null, today),
    today: () => new Date().toISOString().slice(0, 10),
    appUrl: Deno.env.get('APP_URL') ?? 'https://lemikx.github.io/carnet-de-route/',
  }),
);
