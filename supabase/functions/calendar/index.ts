// Edge Function Supabase (Deno) : abonnement calendrier par jeton secret.
// Déploiement : npm run sync:domain && supabase functions deploy calendar --no-verify-jwt
import { createClient } from 'npm:@supabase/supabase-js@2.46.1';
import { buildCalendar } from '../_shared/domain/calendar.ts';
import { rowsToBundle } from '../_shared/data/supabaseMapping.ts';
import { handleCalendar } from './handler.ts';

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
});

Deno.serve((req) =>
  handleCalendar(
    req,
    async (token) => {
      const { data, error } = await admin.rpc('get_calendar_bundle', { p_token: token });
      if (error || !data) return null;
      return {
        bundle: rowsToBundle(data),
        opts: { includeLegs: Boolean(data.include_legs), includeChecklist: Boolean(data.include_checklist) },
      };
    },
    buildCalendar,
  ),
);
