# Carnet de route

Appli web installable (Mac + iPhone) pour préparer un voyage à l'étranger et produire un **roadbook complet** :
itinéraire jour par jour, trajets calculés, cartes, checklist, réservations, contacts, roadbook HTML/PDF,
partage par lien en lecture seule et export calendrier (fichier `.ics` ou abonnement).

- Spécification : [`docs/superpowers/specs/2026-11-11-carnet-de-route-etape1-design.md`](docs/superpowers/specs/2026-11-11-carnet-de-route-etape1-design.md)
- Mise en place (Supabase, OpenRouteService, GitHub Pages) : [`docs/MISE-EN-PLACE.md`](docs/MISE-EN-PLACE.md)

## Lancer en local (mode démonstration, sans configuration)

```bash
npm install
npm run dev
```

## Tests

```bash
npm test            # logique et composants (Vitest)
npm run test:e2e    # parcours dans le navigateur (Playwright)
npm run test:db     # migrations et règles de sécurité sur un PostgreSQL 16 local
```

## Organisation du code

| Dossier | Rôle |
|---|---|
| `src/domain` | Logique métier pure (jours, horaires et fuseaux, trajets, roadbook, calendrier) |
| `src/data` | Accès aux données : interface `TripRepository`, versions mémoire et Supabase |
| `src/routing` | Géocodage et calcul de trajets (OpenRouteService via fonction serveur, ou simulé) |
| `src/services` | Orchestration (création, dates, étapes, trajets, réservations) |
| `src/offline` | Cache local et lecture seule hors ligne |
| `src/ui` | Écrans React |
| `supabase/migrations` | Schéma, règles d'accès (RLS), partage, calendrier |
| `supabase/functions` | Fonctions serveur `routes` (trajets) et `calendar` (abonnement) |
