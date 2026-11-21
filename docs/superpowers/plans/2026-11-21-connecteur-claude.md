# Connecteur Claude « Carnet de route » — plan de développement

**Spec :** `docs/superpowers/specs/2026-11-21-connecteur-claude-design.md`
**Exécution :** dans cette session, tests d'abord (TDD), pas de sous-agent pour le code.

## Tâches
1. **Base (migration 0007)** — table `connector_links` (jeton haché SHA-256, une adresse active par utilisateur, RLS propriétaire, aucun accès anonyme) ; fonctions `create_connector_link()` (renvoie le jeton en clair une seule fois), `revoke_connector_link()`, et pour la fonction serveur seulement (`service_role`) : `connector_last_brief(p_token)` et `connector_create_draft(p_token, p_brief, p_itinerary)` (brouillon `itinerary_received`, 20 par jour au plus). Tests SQL `supabase/tests/connector.sql` ; `setup-complet.sql` régénéré.
2. **Logique du serveur MCP** — `supabase/functions/claude-connector/handler.ts` sans import (dépendances injectées, comme `calendar/handler.ts`) : authentification par `Authorization: Bearer` ou `?token=`, JSON-RPC MCP (`initialize`, `notifications/initialized`, `ping`, `tools/list`, `tools/call`), outils `get_itinerary_format` et `create_trip_draft`, validation par `parseItinerary`, dates contrôlées (≤ 30 jours), taille ≤ 200 000 caractères. Tests Vitest `handler.test.ts`. `index.ts` (Deno) branche les RPC ; `sync-domain` copie aussi `src/ai`.
3. **Dépôts et Réglages** — `TripRepository` : `getConnectorLink()`, `createConnectorLink()`, `revokeConnectorLink()` (mémoire + Supabase) ; section « Connecteur Claude » dans Réglages (créer, copier adresse et jeton une seule fois, révoquer, mode d'emploi). Tests contrat + interface.
4. **Docs et vérification** — `MISE-EN-PLACE.md` (migration 0007, déploiement, ajout dans claude.ai), README ; `npm test`, `test:db`, `test:e2e`, `build`.
