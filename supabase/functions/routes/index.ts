// Edge Function Supabase (Deno). Déploiement : supabase functions deploy routes
// La vérification du JWT (utilisateur connecté) est faite par Supabase (verify_jwt = true par défaut).
import tzlookup from 'npm:tz-lookup@6.1.25';
import { handleRoutes } from './ors.ts';

const apiKey = Deno.env.get('ORS_API_KEY') ?? '';

Deno.serve((req) => handleRoutes(req, { apiKey, fetchImpl: fetch, tz: tzlookup }));
