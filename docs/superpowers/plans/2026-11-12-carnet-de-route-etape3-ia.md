# Carnet de route — Étape 3 : créer un voyage avec l'IA — plan de développement

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Objectif :** un parcours « Créer avec l'IA » : questionnaire → demande à coller dans Claude → réponse recollée, vérifiée → lieux placés → voyage ordinaire créé (étapes, trajets, checklist avec échéance de visa, budget).

**Architecture :** tout le dialogue avec l'IA passe par un protocole JSON versionné (`v: 1`) : `promptBuilder` écrit la demande, `responseParser` valide ce qui est collé (non fiable), `visa` calcule les indicateurs, `placeResolver` géocode, `tripFromItinerary` crée le voyage avec annulation propre. Des brouillons (`ai_drafts`) sont sauvegardés à chaque étape, **hors de `TripBundle`**. Une interface `AiProvider` laisse la place à une clé d'API plus tard (non construite).

**Stack :** celle des étapes 1 et 2 (React, TypeScript, Supabase, Vitest, Playwright), sans nouvelle dépendance.

**Spec :** `docs/superpowers/specs/2026-11-12-carnet-de-route-etape3-ia-design.md` (lire aussi les specs des étapes 1 et 2 pour `TripService`, `BudgetService`, `RoutingService`, `FxService`).

## Global Constraints

- Interface en **français**. Protocole : un seul bloc JSON, `"v": 1` ; heures `HH:mm`, dates `AAAA-MM-JJ`, durées en minutes, montants en nombres.
- **Plafonds** de ce qui est collé : réponse ≤ **200 000** caractères ; ≤ **30** jours ; ≤ **12** étapes par jour ; textes ≤ **500** caractères (tronqués avec avertissement) ; montants et nombres ≤ **1 000 000** ; idées : **exactement 3**.
- Liens : seuls `https://` conservés ; tout le reste devient `null`. Chaînes : caractères de contrôle retirés ; jamais interprétées comme du HTML.
- Visa : `restant = départ − aujourd'hui` ; **gris** si inconnu ; **vert** si non requis ou `max ≤ restant − 14` ; **orange** si `restant − 14 < max ≤ restant` ; **rouge** si `max > restant` ; échéance `= départ − max − 7 jours` ; affichage toujours « Information donnée par l'IA : à vérifier sur le site officiel » + lien.
- Lieux : requête `nom, ville, pays` ; **4 requêtes en parallèle au plus** ; « à vérifier » si introuvable ou à **plus de 150 km** du centre des autres lieux ; quota ou service indisponible → lieux restants **sans carte**, signalés.
- Création : voyage partiel **supprimé** en cas d'échec ; brouillon conservé à l'étape précédente ; jamais de doublon au réessai.
- Les brouillons ne sont lus **ni par `get_shared_roadbook`, ni par `get_calendar_bundle`, ni par `trip_bundle_json`** ; RLS propriétaire ; aucun déclencheur `touch_trip`.
- Aucune clé d'API utilisée ou stockée. Hors ligne : consultation seulement (`OfflineError` pour toute écriture).
- Messages d'enregistrement : « Enregistrement impossible. » + « Réessayer » (`useSave` avec des fonctions `() => Promise`).

## Review Focus

1. **Contenu collé piégé** : balises HTML, `javascript:`, caractères de contrôle, nombres énormes, tableaux démesurés, clés `__proto__` / `constructor`. Attendu : texte brut inoffensif, refus propre, jamais d'exécution — tâches 1, 2 et 11.
2. **Réponse mal découpée** : JSON entouré de texte avec d'autres accolades, deux blocs JSON, JSON tronqué. Attendu : le bon bloc est pris, ou « réponse coupée » est détecté — tâche 2.
3. **Jours incohérents** : numéros de jours en double, manquants, dans le désordre ; plus ou moins de jours que de dates. Attendu : erreur ou avertissement précis, jamais d'étape rangée au mauvais jour en silence — tâches 1 et 8.
4. **Échec en cours de création** (quota, réseau) : attendu : aucun voyage à moitié créé, brouillon intact, réessai sans doublon — tâches 8 et 9.
5. **Cas limites de visa et de lieux** : départ aujourd'hui ou passé, délai absent, échéance déjà dépassée ; tous les lieux introuvables. Attendu : jamais de crash ni de date invalide ; voyage créé sans carte — tâches 3, 7 et 8.

---

## Structure des fichiers

```
src/ai/        types.ts  options.ts  limits.ts  validate.ts  responseParser.ts  visa.ts  promptBuilder.ts
               placeResolver.ts  tripFromItinerary.ts  aiService.ts  AiProvider.ts  fixtures.ts (tests)  (+ *.test.ts)
src/ui/ai/     AiHomePage.tsx  QuestionnairePage.tsx  questionnaireSteps.ts  DraftPage.tsx  RequestPanel.tsx
               IdeasPanel.tsx  ControlPanel.tsx  VisaBadge.tsx  DraftsList.tsx
supabase/migrations/ 0006_ai_drafts.sql      supabase/tests/ai_drafts.sql
e2e/ai.spec.ts
```
Modifiés : `src/data/*` (interface, mémoire, Supabase, contrat, mapping), `src/ui/pages/TripsPage.tsx`, `src/app/router.tsx`, `scripts/test-db.sh`, `supabase/setup-complet.sql`, `docs/MISE-EN-PLACE.md`, `README.md`.

---

### Task 1 : types, options et validation du protocole

**Files :**
- Create : `src/ai/types.ts`, `src/ai/options.ts`, `src/ai/limits.ts`, `src/ai/validate.ts`
- Test : `src/ai/validate.test.ts`

**Interfaces :**
- Produces (`types.ts`) :
  - `PROTOCOL_VERSION = 1`
  - `VisaInfo { required: boolean | 'unknown'; type: string; processingDaysMin: number | null; processingDaysMax: number | null; officialUrl: string | null; notes: string }`
  - `Idea { id: string; destination: string; country: string; summary: string; durationDays: number; highlights: string[]; budgetPerPersonEur: number | null; whyItMatches: string; visa: VisaInfo }` ; `IdeasResponse { v: 1; kind: 'ideas'; ideas: Idea[] }`
  - `ItineraryPlace { name: string; city: string; country: string }` ; `ItineraryStop { title: string; kind: StopKind; place: ItineraryPlace; startTime: string | null; durationMin: number | null; note: string }` ; `ItineraryDay { day: number; title: string; note: string; stops: ItineraryStop[] }`
  - `ItineraryChecklistItem { category: ChecklistCategory; label: string; daysBeforeDeparture: number | null }` ; `ItineraryBudgetLine { category: BudgetCategory; label: string; amount: number; currency: string; mode: LineMode }`
  - `ItineraryResponse { v: 1; kind: 'itinerary'; trip: { name: string; countries: string[]; currency: string; visa: VisaInfo }; days: ItineraryDay[]; checklist: ItineraryChecklistItem[]; budget: ItineraryBudgetLine[] }`
  - `Brief { destination: string | null; startDate: string; endDate: string; departureCity: string | null; adults: number; children: number; travelers: { name: string; nationality: string }[]; budgetPerPersonEur: number | null; travelerTypes: string[]; tripTypes: string[]; wishes: string[]; lodging: string[]; pace: 'calm' | 'balanced' | 'intense' | null; constraints: string }`
  - `AiDraft { id: string; stage: DraftStage; mode: 'known' | 'surprise'; brief: Brief; ideas: Idea[] | null; chosenIdeaId: string | null; itinerary: ItineraryResponse | null; tripId: string | null; protocolVersion: number; updatedAt: string }` ; `DraftStage = 'brief' | 'ideas_requested' | 'ideas_received' | 'idea_chosen' | 'itinerary_requested' | 'itinerary_received' | 'created'`
- Produces (`options.ts`) : `TRAVELER_TYPES`, `TRIP_TYPES`, `WISHES`, `LODGINGS`, `PACES` : listes `{ id: string; label: string }` avec exactement les libellés de la spec §9 (ids en anglais minuscules, ex. `adventurer`, `city_stay`).
- Produces (`limits.ts`) : `LIMITS = { responseChars: 200000, days: 30, stopsPerDay: 12, textChars: 500, maxNumber: 1000000, ideas: 3 }`.
- Produces (`validate.ts`) : `cleanText(s: unknown, max?: number): string` (retire les caractères de contrôle sauf retour à la ligne, tronque) ; `safeUrl(u: unknown): string | null` (https seulement) ; `validateIdeas(raw: unknown): { value: IdeasResponse; warnings: string[] } | { errors: string[] }` ; `validateItinerary(raw: unknown, opts: { tripDays: number }): { value: ItineraryResponse; warnings: string[] } | { errors: string[] }`.

- [ ] **Step 1 : tests qui échouent** (objets JavaScript, pas encore de texte)
  - `cleanText('a\u0000b\u001fc')` → `'abc'` ; une chaîne de 600 caractères → 500 (avec `…` final) ; `cleanText(42)` → `''`.
  - `safeUrl('https://a.fr/x')` conservé ; `'http://a.fr'`, `'javascript:alert(1)'`, `'data:text/html,x'`, `'//a.fr'`, `42` → `null`.
  - `validateIdeas` : 3 idées valides → `value.ideas.length === 3` ; 2 idées → erreur « Il faut exactement 3 idées » ; `visa.required: 'peut-être'` → erreur nommant l'idée ; `processingDaysMax: -3` ou `2e9` → erreur ; `officialUrl: 'javascript:x'` → conservée à `null` avec avertissement.
  - `validateItinerary` : itinéraire valide → `ok` ; `startTime: '25:00'` → erreur exacte « Jour 3, étape 2 : l’heure « 25:00 » est invalide. » ; `day` en double (1, 1) ou non croissant (1, 3, 2) → erreur « Les jours doivent être numérotés 1, 2, 3… sans trou » ; 31 jours → erreur ; 13 étapes dans un jour → erreur ; `kind: 'hotel'` → erreur ; `budget[].amount: 5e9` ou négatif → erreur ; `mode` inconnu → erreur ; `days.length` ≠ `tripDays` → **avertissement** (« 6 jours proposés pour 5 dates »), pas d'erreur.
  - **Clés piégées** : un objet avec `__proto__` ou `constructor` ne modifie pas `Object.prototype` et n'est pas copié dans le résultat ; des champs inconnus sont ignorés.
- [ ] **Step 2 :** `npx vitest run src/ai` → FAIL. **Step 3 :** implémenter (valider champ par champ, construire de nouveaux objets, jamais de copie des clés reçues). **Step 4 :** PASS. **Step 5 : commit** `feat(ia): types et validation du protocole`

### Task 2 : lecture de la réponse collée

**Files :**
- Create : `src/ai/responseParser.ts`, `src/ai/fixtures.ts`
- Test : `src/ai/responseParser.test.ts`

**Interfaces :**
- Consumes : `validateIdeas`, `validateItinerary`, `LIMITS` (tâche 1).
- Produces : `extractJson(text: string): { json: string } | { truncated: true } | null` ; `type ParseResult<T> = { ok: true; value: T; warnings: string[] } | { ok: false; errors: string[]; truncated: boolean }` ; `parseIdeas(text: string): ParseResult<IdeasResponse>` ; `parseItinerary(text: string, opts: { tripDays: number }): ParseResult<ItineraryResponse>`. `fixtures.ts` exporte `IDEAS_FIXTURE`, `ITINERARY_FIXTURE` (objets valides) et `asReply(obj: unknown, wrap?: 'fence' | 'text'): string`.

Règles : on prend la **première balise ```json**, sinon le plus grand objet équilibré entre accolades (en ignorant les accolades dans les chaînes) ; deux blocs → le premier ; accolades non fermées → `truncated: true` ; texte > 200 000 caractères → refus ; `JSON.parse` échoué → erreur « Je n'arrive pas à lire la réponse : … » ; `v !== 1` → « Cette réponse suit une autre version du protocole (v…) ».

- [ ] **Step 1 : tests qui échouent**
  - Réponse = JSON valide seul, ou dans une balise ```json, ou entourée de « Voici ton itinéraire ! … Bon voyage {😀} » → même `value`.
  - Deux blocs JSON (idées puis itinéraire) → le premier.
  - Accolades dans une chaîne (`"note": "voir } ici"`) → bien lu.
  - JSON coupé à mi-chemin → `ok: false`, `truncated: true`.
  - Texte sans JSON → `ok: false`, `truncated: false`, message d'aide.
  - `{"v": 2, …}` → erreur de version ; `kind: 'itinerary'` collé dans `parseIdeas` → « Cette réponse est un itinéraire, pas des idées ».
  - Texte de 200 001 caractères → refusé sans analyser ; tableau de 100 000 jours → erreur de plafond sans lenteur (test < 1 s).
  - **Contenu piégé** : `title: "<script>alert(1)</script>"` → conservé comme texte (la chaîne contient encore `<script>`, c'est l'affichage qui ne l'interprète pas) ; `officialUrl: "javascript:alert(1)"` → `null` ; caractères de contrôle retirés.
- [ ] **Step 2 :** FAIL. **Step 3 :** implémenter. **Step 4 :** PASS. **Step 5 : commit** `feat(ia): lecture de la réponse collée`

### Task 3 : visa

**Files :**
- Create : `src/ai/visa.ts`
- Test : `src/ai/visa.test.ts`

**Interfaces :**
- Consumes : `VisaInfo` (tâche 1).
- Produces : `VisaLevel = 'green' | 'orange' | 'red' | 'grey'` ; `VisaAssessment { level: VisaLevel; reason: string; remainingDays: number; deadline: string | null; overdue: boolean }` ; `assessVisa(visa: VisaInfo, input: { departureDate: string; today: string; marginDays?: number; safetyDays?: number }): VisaAssessment` (défauts 14 et 7).

- [ ] **Step 1 : tests qui échouent** (aujourd'hui = `2026-11-12`, départ `2026-12-20`, soit 38 jours restants)
  - `required: true`, `max: 20` → vert, échéance `2026-11-23`, `overdue` faux.
  - `max: 30` → orange, échéance `2026-11-13`, non dépassée ; `max: 45` → rouge, échéance `2026-10-29`, `overdue` vrai.
  - Limites : `max: 24` → vert ; `25` → orange ; `38` → orange ; `39` → rouge.
  - `required: false` → vert, échéance `null` ; `required: 'unknown'` → gris ; `required: true` avec `max: null` → gris, échéance `null`.
  - Départ aujourd'hui ou passé, `required: true` → rouge ; `required: false` → vert ; `remainingDays` jamais NaN.
  - Marge personnalisée (`marginDays: 0`) : `max: 38` → vert.
  - Chaque niveau a une raison en français (rouge : « Délai de traitement jusqu'à 45 jours, mais il ne reste que 38 jours avant le départ. »).
- [ ] **Step 2 :** FAIL. **Step 3 :** implémenter avec `luxon` (jours calendaires, UTC). **Step 4 :** PASS. **Step 5 : commit** `feat(ia): indicateurs de visa`

### Task 4 : la demande

**Files :**
- Create : `src/ai/promptBuilder.ts`, `src/ai/AiProvider.ts`
- Test : `src/ai/promptBuilder.test.ts`

**Interfaces :**
- Consumes : `Brief`, `Idea`, `options` (tâche 1).
- Produces : `buildIdeasPrompt(brief: Brief, today: string): string` ; `buildItineraryPrompt(brief: Brief, idea: Idea | null, today: string): string` (sans idée, la destination du brief est utilisée ; erreur si elle est vide) ; `buildContinuePrompt(): string` ; `openInClaudeUrl(prompt: string, maxChars?: number): string | null` (`https://claude.ai/new?q=…` encodé ; `null` au-delà de 6 000 caractères par défaut) ; `interface AiProvider { id: 'copy-paste'; request(prompt: string): Promise<string> }` et `copyPasteProvider` (la réponse est fournie par l'utilisateur : `request` n'est pas appelée par l'interface aujourd'hui, elle existe pour une clé d'API future).

Contenu obligatoire de la demande : rôle de conseiller de voyage ; consigne explicite **« utilise la recherche web »** pour visas et prix ; dates, durée, ville de départ, voyageurs avec **nationalités**, budget, profil, rythme, contraintes ; la mention `"v": 1` et la liste exacte des champs du format de réponse (idées ou itinéraire) ; « réponds uniquement avec un seul bloc ```json » ; heures `HH:mm`, durées en minutes, chaque lieu avec ville et pays.

- [ ] **Step 1 : tests qui échouent**
  - La demande « idées » contient `recherche web`, `"v": 1`, `"kind": "ideas"`, `exactement 3`, les nationalités `FR` et `BE` d'un brief à deux voyageurs, les deux dates, et chaque libellé de profil choisi (pas les ids).
  - La demande « itinéraire » avec une idée contient sa destination et son pays ; sans idée et sans destination → lève une erreur ; elle contient `"kind": "itinerary"`, `daysBeforeDeparture`, `place` et `mode`.
  - Brief sans budget ni contraintes → les lignes correspondantes sont absentes (pas de « null » ni « undefined » dans le texte).
  - Une contrainte contenant des retours à la ligne et des guillemets est insérée telle quelle sans casser le texte.
  - `openInClaudeUrl` : demande courte → commence par `https://claude.ai/new?q=` et se décode en la demande exacte ; demande de 6 001 caractères → `null`.
  - `buildContinuePrompt()` contient « continue exactement où tu t’es arrêté ».
- [ ] **Step 2 :** FAIL. **Step 3 :** implémenter. **Step 4 :** PASS. **Step 5 : commit** `feat(ia): écriture de la demande`

### Task 5 : brouillons dans les dépôts

**Files :**
- Modify : `src/data/TripRepository.ts`, `memoryRepository.ts`, `repositoryContract.ts`
- Test : `src/data/memoryRepository.test.ts` (contrat)

**Interfaces :**
- Consumes : `AiDraft`, `Brief` (tâche 1).
- Produces (ajouts à `TripRepository`) : `listDrafts(): Promise<AiDraft[]>` (plus récent d'abord) ; `getDraft(id: string): Promise<AiDraft>` (`NotFoundError` si absent) ; `saveDraft(d: AiDraft | New<AiDraft>): Promise<AiDraft>` ; `deleteDraft(id: string): Promise<void>`.
- Comportement : `deleteTrip` met `tripId` à `null` dans les brouillons qui le référencent ; `getSharedRoadbook` ne contient jamais de brouillon.

- [ ] **Step 1 : tests qui échouent** (contrat)
  - Créer deux brouillons, `listDrafts` les renvoie du plus récent au plus ancien ; `saveDraft` avec `id` met à jour sans doublon et change `updatedAt` ; `getDraft` d'un id inconnu → `NotFoundError` ; `deleteDraft` le retire.
  - Le contenu de `brief`, `ideas` et `itinerary` est rendu à l'identique (copie profonde, pas de référence partagée).
  - Supprimer un voyage dont un brouillon porte le `tripId` → brouillon conservé, `tripId` `null`.
  - `JSON.stringify(await repo.getSharedRoadbook(token))` et `getBundle` ne contiennent ni `brief`, ni `draft`.
- [ ] **Step 2 :** FAIL. **Step 3 :** implémenter la version mémoire (stockage persistant du mode démo inclus). **Step 4 :** PASS (les tests Supabase restent sautés). **Step 5 : commit** `feat(ia): brouillons dans les dépôts`

### Task 6 : base de données des brouillons et dépôt Supabase

**Files :**
- Create : `supabase/migrations/0006_ai_drafts.sql`, `supabase/tests/ai_drafts.sql`
- Modify : `src/data/supabaseRepository.ts`, `supabaseMapping.ts`, `scripts/test-db.sh`, `supabase/setup-complet.sql` (régénéré, 6 migrations)
- Test : `supabase/tests/ai_drafts.sql`, `src/data/supabaseMapping.test.ts`, `src/data/supabaseBudget.test.ts` (client factice)

**Interfaces :**
- Produces (SQL) : table `ai_drafts (id, user_id default auth.uid(), mode check in ('known','surprise'), stage check in (7 valeurs), brief jsonb not null, ideas jsonb, chosen_idea_id text, itinerary jsonb, trip_id uuid references trips on delete set null, protocol_version int not null default 1, created_at, updated_at)` ; RLS « propriétaire » avec vérification que `trip_id`, s'il est renseigné, appartient au même utilisateur ; `revoke all … from anon` ; déclencheur `set_updated_at` ; **aucun** `touch_trip`.
- Produces (TS) : méthodes de brouillons de la tâche 5 côté Supabase (`from('ai_drafts')`), noms de colonnes convertis ; les objets `brief`, `ideas`, `itinerary` restent tels quels (ne pas convertir leurs clés).

- [ ] **Step 1 : tests qui échouent**
  - SQL : Alice crée un brouillon ; Bob ne le voit pas, ne peut pas en créer un pointant vers le voyage d'Alice, ne peut ni le modifier ni le supprimer ; `anon` n'a aucun accès ; **`get_shared_roadbook` et `get_calendar_bundle` ne contiennent ni `ai_drafts`, ni `brief`, ni `itinerary`** ; supprimer le voyage met `trip_id` à null sans supprimer le brouillon ; valeur de `stage` invalide refusée.
  - Client factice (comme `supabaseBudget.test.ts`) : `saveDraft` envoie les colonnes en snake_case et un `brief` intact (clé `departureCity` conservée) ; `listDrafts` trie par `updated_at` décroissant et reconvertit `trip_id` en `tripId`.
- [ ] **Step 2 :** `npm run test:db` → FAIL. **Step 3 :** migration, dépôt, régénération de `setup-complet.sql`. **Step 4 :** `npm run test:db` et `npx vitest run` → PASS. **Step 5 : commit** `feat(ia): table des brouillons et dépôt Supabase`

### Task 7 : placement des lieux

**Files :**
- Create : `src/ai/placeResolver.ts`
- Test : `src/ai/placeResolver.test.ts`

**Interfaces :**
- Consumes : `RoutingService.geocode(query, focus?)` et `RoutingError` (étape 1) ; `ItineraryPlace` (tâche 1).
- Produces : `ResolvedPlace { status: 'ok' | 'not_found' | 'far' | 'unavailable'; lat: number | null; lon: number | null; timezone: string | null; label: string | null }` ; `haversineKm(a: LatLon, b: LatLon): number` ; `resolvePlaces(places: ItineraryPlace[], deps: { routing: RoutingService; onProgress?(done: number, total: number): void; concurrency?: number }): Promise<ResolvedPlace[]>` (résultat dans l'ordre d'entrée).

Règles : requête `nom, ville, pays` ; mêmes requêtes mises en cache ; lots de 4 maximum, le **point de proximité** de chaque lot est le centre des lieux déjà placés ; premier résultat retenu ; après le dernier lot, tout lieu à plus de **150 km** de la **médiane** des lieux placés passe en `far` (coordonnées conservées) ; `RoutingError` de code `QUOTA`, `NETWORK` ou `UNAUTHORIZED` → ce lieu et **tous les suivants** en `unavailable`, plus aucun appel.

- [ ] **Step 1 : tests qui échouent** (service de géocodage factice)
  - Quatre lieux trouvés → `ok`, ordre conservé, `onProgress` appelé jusqu'à `(4, 4)`.
  - Résultat vide → `not_found` (`lat` `null`).
  - Frontière : centre à 35,00 ° N ; lieu à 36,34 ° (≈ 149 km) → `ok` ; à 36,36 ° (≈ 151 km) → `far` avec coordonnées.
  - Quota au 5ᵉ lieu sur 10 → les lieux 5 à 10 sont `unavailable`, et le service n'est plus appelé après l'échec.
  - Concurrence : le maximum d'appels simultanés observé est ≤ 4.
  - Deux lieux identiques → un seul appel.
  - Le deuxième lot reçoit un `focus` proche du premier lot ; le premier lot n'en reçoit pas.
  - Liste vide → `[]` sans appel ; tous introuvables → tous `not_found`, pas d'exception.
- [ ] **Step 2 :** FAIL. **Step 3 :** implémenter. **Step 4 :** PASS. **Step 5 : commit** `feat(ia): placement des lieux`

### Task 8 : création du voyage

**Files :**
- Create : `src/ai/tripFromItinerary.ts`
- Test : `src/ai/tripFromItinerary.test.ts`

**Interfaces :**
- Consumes : `TripService` (`createTrip`, `addStop`), `BudgetService` (`ensureTravelers`, `newExpenseRate`), `TripRepository` (`saveChecklistItem`, `saveBudgetLine`, `getBundle`, `deleteTrip`), `ResolvedPlace`, `assessVisa`, `Brief`, `ItineraryResponse`.
- Produces : `CreationError extends Error` ; `createTripFromItinerary(deps: { repo: TripRepository; tripService: TripService; budgetService: BudgetService; today: string }, input: { brief: Brief; itinerary: ItineraryResponse; resolved: ResolvedPlace[] }): Promise<{ tripId: string; toVerify: number; skippedBudgetLines: number }>` — `resolved` suit l'ordre des étapes de tous les jours mis bout à bout.

Comportement : voyage avec les dates du brief, le nom, les pays et la devise de la réponse ; jour `n` de l'itinéraire = n-ième date du voyage (les jours en trop sont ignorés) ; étapes avec heure et durée ; lieu `ok` ou `far` → coordonnées, `not_found` ou `unavailable` → étape sans carte ; adresse = `nom, ville, pays` ; voyageurs du brief (« Voyageur n » à défaut de prénom) ; lignes de budget ; checklist : éléments de la réponse (échéance `départ − daysBeforeDeparture`), et si un visa est requis, l'élément existant « Visa / autorisation d'entrée » reçoit l'échéance (suffixe « (en retard) » si dépassée), sinon un élément est ajouté ; une ligne de budget dont le taux est introuvable est ignorée et comptée. `toVerify` = nombre d'étapes dont le lieu n'est pas `ok`. Toute erreur → `repo.deleteTrip` puis `CreationError`.

- [ ] **Step 1 : tests qui échouent** (dépôt mémoire, routage et taux factices)
  - Itinéraire de 3 jours, 7 étapes : un voyage de 3 jours avec 7 étapes aux bons jours, heures et durées ; trajets calculés entre étapes localisées ; `toVerify` = nombre de lieux non `ok`.
  - Lieux tous `not_found` → voyage créé, toutes les étapes sans carte, `toVerify` = 7, aucune exception.
  - Itinéraire de 4 jours pour 3 dates → le 4ᵉ jour est ignoré ; pour 5 dates → deux jours vides.
  - Visa requis, max 20, départ 2026-12-20, aujourd'hui 2026-11-12 → l'élément « Visa / autorisation d'entrée » a l'échéance `2026-11-23` ; échéance dépassée → libellé « … (en retard) » ; visa non requis → aucune échéance.
  - Budget : une ligne en EUR et une en JPY créées (taux factice) ; une ligne en `XXX` ignorée, `skippedBudgetLines` = 1 ; voyageurs créés (« Voyageur 1 »…).
  - **Échec à la 4ᵉ étape** (dépôt qui lève une erreur) → `CreationError`, `listTrips()` vide, aucun voyageur ni budget orphelin ; relancer ensuite avec un dépôt sain crée exactement un voyage.
- [ ] **Step 2 :** FAIL. **Step 3 :** implémenter. **Step 4 :** PASS. **Step 5 : commit** `feat(ia): création du voyage depuis un itinéraire`

### Task 9 : service des brouillons

**Files :**
- Create : `src/ai/aiService.ts`
- Test : `src/ai/aiService.test.ts`

**Interfaces :**
- Consumes : tâches 2, 4, 5, 7, 8.
- Produces : `interface AiService { startDraft(brief: Brief): Promise<AiDraft>; buildRequest(draftId: string): Promise<{ prompt: string; kind: 'ideas' | 'itinerary'; openUrl: string | null }>; receiveIdeas(draftId: string, text: string): Promise<ParseResult<AiDraft>>; chooseIdea(draftId: string, ideaId: string): Promise<AiDraft>; receiveItinerary(draftId: string, text: string): Promise<ParseResult<AiDraft>>; create(draftId: string, onProgress?: (done: number, total: number) => void): Promise<{ tripId: string; toVerify: number; skippedBudgetLines: number }> }` ; `createAiService(deps: { repo; routing; tripService; budgetService; today?: () => string }): AiService`.

Étapes : `startDraft` → `mode` `known` si destination non vide, sinon `surprise` ; stade `brief` ; `buildRequest` passe le stade à `ideas_requested` (surprise) ou `itinerary_requested` (known, ou après choix d'une idée) ; `receiveIdeas` → `ideas_received` ; `chooseIdea` → `idea_chosen` ; `receiveItinerary` → `itinerary_received` ; `create` → `created` avec `tripId`. Un stade incompatible lève une erreur claire (« Cette étape n'est pas disponible pour ce brouillon »). Les réponses refusées ne modifient **pas** le brouillon.

- [ ] **Step 1 : tests qui échouent**
  - Parcours « surprise » complet avec `IDEAS_FIXTURE` puis `ITINERARY_FIXTURE` : stades dans l'ordre, voyage créé, `tripId` enregistré.
  - Parcours « known » : saute les idées ; destination vide en `known` impossible.
  - Réponse invalide → `ok: false`, brouillon inchangé (stade et contenu) ; réponse tronquée → `truncated` vrai.
  - `receiveItinerary` avant `chooseIdea` en `surprise` → erreur de stade ; `chooseIdea` avec un id inconnu → erreur.
  - `create` qui échoue (dépôt en panne) → brouillon toujours `itinerary_received`, aucun voyage ; réessai → un seul voyage.
  - `create` deux fois de suite → la seconde lève « déjà créé » et ne crée pas de second voyage.
  - Les brouillons survivent à un rechargement (même dépôt, nouveau service).
- [ ] **Step 2 :** FAIL. **Step 3 :** implémenter. **Step 4 :** PASS. **Step 5 : commit** `feat(ia): service des brouillons`

### Task 10 : accueil et questionnaire

**Files :**
- Create : `src/ui/ai/AiHomePage.tsx`, `QuestionnairePage.tsx`, `questionnaireSteps.ts`
- Modify : `src/app/router.tsx` (`/ia`, `/ia/nouveau`), `src/ui/pages/TripsPage.tsx` (bouton « Créer avec l'IA »), `src/ui/app.css`
- Test : `src/ui/ai/QuestionnairePage.test.tsx`

**Interfaces :**
- Consumes : `createAiService`, `useApp()`, options (tâche 1).
- Produces : `STEPS` (liste ordonnée : destination, dates, départ, voyageurs, budget, profil, hébergement, rythme, contraintes) ; `emptyBrief(today: string): Brief` ; `validateStep(stepId: string, brief: Brief): string | null` (message d'erreur ou `null`) ; `QuestionnairePage` (une question par écran, bouton « Retour », « Passer » sur les étapes facultatives, « Terminer » → `startDraft` puis `/ia/<id>`).

- [ ] **Step 1 : tests qui échouent**
  - Premier écran = « Où veux-tu aller ? » ; passer la destination puis des dates **vides** → « Indique les dates de départ et de retour. » ; retour avant départ → « La date de retour doit être après le départ. » ; départ dans le passé → refusé.
  - Voyageurs : 2 adultes, nationalité `FR` par défaut, modifiable ; au moins 1 adulte ; 0 → message.
  - Budget « 1 500,5 » accepté ; « abc » refusé ; vide accepté.
  - « Retour » conserve les réponses ; « Passer » sur le rythme laisse `pace` à `null`.
  - « Terminer » avec destination → brouillon `known` et navigation vers `/ia/<id>` ; sans destination → `surprise`.
  - Échec d'enregistrement → « Enregistrement impossible. », réponses conservées, « Réessayer » relance.
- [ ] **Step 2 :** FAIL. **Step 3 :** implémenter. **Step 4 :** PASS. **Step 5 : commit** `feat(ia): accueil et questionnaire`

### Task 11 : la demande, les idées et le visa

**Files :**
- Create : `src/ui/ai/DraftPage.tsx`, `RequestPanel.tsx`, `IdeasPanel.tsx`, `VisaBadge.tsx`
- Modify : `src/app/router.tsx` (`/ia/:draftId`), `src/ui/app.css`
- Test : `src/ui/ai/RequestPanel.test.tsx`, `IdeasPanel.test.tsx`, `VisaBadge.test.tsx`

**Interfaces :**
- Consumes : `AiService`, `assessVisa`, `ParseResult`.
- Produces : `VisaBadge(props: { visa: VisaInfo; departureDate: string; today: string })` ; `RequestPanel(props: { draft: AiDraft; kind: 'ideas' | 'itinerary'; prompt: string; openUrl: string | null; onPaste(text: string): Promise<ParseResult<unknown>> })` ; `IdeasPanel(props: { draft: AiDraft; today: string; onChoose(ideaId: string): void })` ; `DraftPage` choisit l'écran selon le stade.

Comportement : `RequestPanel` : texte de la demande, bouton « Copier » (« Copié »), « Ouvrir dans Claude » seulement si `openUrl`, rappel « Active la recherche web dans Claude », zone de collage et bouton « Analyser la réponse » ; erreurs listées avec leur détail ; **réponse tronquée** → bloc « La réponse semble coupée » avec la demande « continue » à copier. `IdeasPanel` : trois cartes (destination, résumé, budget estimé, points forts, `VisaBadge`) ; cartes **rouges** rangées en bas, grisées, avec la raison ; « Choisir cette idée ».

- [ ] **Step 1 : tests qui échouent**
  - `VisaBadge` : quatre niveaux avec leurs textes, le lien officiel, et toujours « Information donnée par l'IA : à vérifier sur le site officiel » ; lien `javascript:` absent.
  - `IdeasPanel` : idées dans l'ordre vert, orange, gris puis rouge (même si la réponse les donne dans un autre ordre) ; la rouge a la classe `muted` et sa raison ; « Choisir cette idée » appelle `onChoose` avec le bon id.
  - `RequestPanel` : copier appelle le presse-papiers avec la demande exacte ; sans `openUrl`, pas de bouton « Ouvrir dans Claude » ; réponse invalide → « Jour 3, étape 2 : l’heure « 25:00 » est invalide. » affiché ; tronquée → texte « continue exactement où tu t’es arrêté » affiché ; réponse valide → `onPaste` renvoie `ok`.
  - **Texte piégé** : une idée dont le résumé est `<img src=x onerror=alert(1)>` s'affiche comme texte (aucun élément `img` dans le DOM) ; un titre d'étape contenant `<script>` idem.
- [ ] **Step 2 :** FAIL. **Step 3 :** implémenter. **Step 4 :** PASS. **Step 5 : commit** `feat(ia): demande, idées et indicateurs de visa`

### Task 12 : contrôle, création et brouillons

**Files :**
- Create : `src/ui/ai/ControlPanel.tsx`, `DraftsList.tsx`
- Modify : `src/ui/ai/DraftPage.tsx`, `src/ui/pages/TripsPage.tsx` (liste des brouillons), `src/ui/app.css`
- Test : `src/ui/ai/ControlPanel.test.tsx`, `DraftsList.test.tsx`

**Interfaces :**
- Consumes : `AiService.create`, `resolvePlaces`, `assessVisa`.
- Produces : `ControlPanel(props: { draft: AiDraft; today: string; onCreate(onProgress: (d: number, t: number) => void): Promise<{ tripId: string; toVerify: number; skippedBudgetLines: number }> })` ; `DraftsList(props: { drafts: AiDraft[]; onDelete(id: string): void })`.

Comportement : `ControlPanel` : nombre de jours, étapes par jour, avertissements du protocole (jours en trop ou manquants), échéance du visa, budget estimé (somme des lignes en EUR connues), bouton « Créer le voyage » ; pendant la création, **barre de progression** ; échec → « La création a échoué : rien n'a été enregistré. », bouton « Réessayer » ; succès → lien vers le voyage et « N lieu(x) à vérifier » (lien vers l'itinéraire). `DraftsList` : titre (destination ou « Surprends-moi »), dates, stade en français, « Reprendre » et « Supprimer » (avec confirmation) ; brouillons `created` masqués.

- [ ] **Step 1 : tests qui échouent**
  - Résumé : 3 jours, 7 étapes affichés ; avertissement « 6 jours proposés pour 5 dates » ; échéance de visa affichée (« Faire le visa avant le 23/11/2026 »).
  - Création : progression « 3 / 7 » visible ; succès → « 2 lieux à vérifier » et lien vers `/voyage/<id>/itineraire`.
  - Échec → message, brouillon toujours listé, « Réessayer » relance et réussit.
  - `DraftsList` : deux brouillons affichés, « Supprimer » demande confirmation puis appelle `onDelete` ; un brouillon `created` n'apparaît pas ; liste vide → rien (pas de titre).
  - Hors ligne : boutons de création et de suppression désactivés.
- [ ] **Step 2 :** FAIL. **Step 3 :** implémenter. **Step 4 :** PASS. **Step 5 : commit** `feat(ia): contrôle, création et brouillons`

### Task 13 : parcours complet, documentation et vérification finale

**Files :**
- Create : `e2e/ai.spec.ts`
- Modify : `docs/MISE-EN-PLACE.md` (migration `0006`, après la `0005`), `README.md`, `supabase/setup-complet.sql`
- Test : `e2e/ai.spec.ts`

- [ ] **Step 1 : test de bout en bout** (mode démo, `VITE_FX=fake`, réponses de `fixtures.ts` collées en dur)
  - **« Surprends-moi »** : questionnaire (dates dans le futur, 2 adultes) → la demande contient « recherche web » → coller `IDEAS_FIXTURE` → trois cartes dont une rouge grisée en bas → choisir une idée → coller `ITINERARY_FIXTURE` → écran de contrôle (jours, étapes) → « Créer le voyage » → le voyage apparaît dans la liste avec ses étapes ; la checklist contient l'échéance de visa ; l'onglet Budget contient les voyageurs et les lignes.
  - **« Je sais où aller »** : destination renseignée → aucune étape « idées » → itinéraire collé → voyage créé.
  - Réponse invalide collée → message précis, rien n'est créé ; fermer et rouvrir l'appli → le brouillon est dans la liste et se reprend ; le supprimer.
  - Le roadbook partagé du voyage créé ne contient aucun mot du questionnaire (nationalité, budget).
- [ ] **Step 2 :** `npm test`, `npm run test:db`, `npm run test:e2e`, `npm run build` → tout PASS.
- [ ] **Step 3 :** régénérer `setup-complet.sql` (6 migrations) ; compléter `MISE-EN-PLACE.md` (« Pour ajouter la création par IA à une base existante : coller uniquement `0006_ai_drafts.sql`, après la `0005` ») ; mettre à jour le `README`.
- [ ] **Step 4 : commit** `test: parcours IA ; docs: migration 0006`
