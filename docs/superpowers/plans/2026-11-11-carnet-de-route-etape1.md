# Carnet de route — Étape 1 : plan de développement

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Objectif :** une PWA en français pour préparer un voyage (itinéraire, trajets calculés, checklist, réservations, contacts) et produire un roadbook HTML/PDF partageable par lien en lecture seule.

**Architecture :** logique métier pure dans `src/domain/` (testée unitairement), accès aux données et calcul de trajets derrière deux interfaces (`TripRepository`, `RoutingService`) avec une implémentation réelle (Supabase / Edge Function OpenRouteService) et une implémentation en mémoire pour les tests ; une couche `services/` orchestre les deux ; l'interface React ne parle qu'aux services. Le roadbook est construit par une fonction pure à partir d'un `TripBundle`, ce qui le rend identique pour le propriétaire, le lien partagé et l'impression PDF.

**Stack :** Vite 5, React 18, TypeScript (strict), React Router (HashRouter), Supabase JS v2, Luxon (fuseaux horaires), Leaflet + react-leaflet, @dnd-kit (glisser-déposer), idb-keyval, vite-plugin-pwa, Vitest + Testing Library, Playwright, Deno (Edge Function).

**Spec :** `docs/superpowers/specs/2026-11-11-carnet-de-route-etape1-design.md`

## Global Constraints

- Interface **en français uniquement** ; dates affichées au format `jj/mm/aaaa`, heures `HH:mm` (24 h).
- Nom de l'appli : « Carnet de route ».
- Seuil « journée chargée » par défaut : **5 h** (300 min) de trajet cumulé, modifiable dans les réglages.
- Heures stockées avec le fuseau horaire IANA du lieu (`Europe/Paris`, `Asia/Tokyo`…).
- Modes calculés automatiquement : `car`, `walk`, `bike` uniquement ; `train`, `bus`, `plane`, `ferry`, `other` saisis ou repris d'une réservation.
- Clé OpenRouteService **uniquement** dans le secret de l'Edge Function (`ORS_API_KEY`), jamais dans le code client ni dans le dépôt.
- RLS activé sur toutes les tables ; seule la clé Supabase « anon » est dans l'appli.
- Jeton de partage : 32 caractères hexadécimaux générés côté serveur (`encode(gen_random_bytes(16),'hex')`, 128 bits) ; un seul lien actif par voyage ; `hide_sensitive` vrai par défaut.
- Infos sensibles retirées côté serveur si `hide_sensitive` : `reservations.confirmation_number`, `price`, `currency`, `url`, `note` ; `stops.note` ; `stops.url` des lieux liés à une réservation ; `days.note` ; `contacts.note`.
- Page partagée : `<meta name="robots" content="noindex">`.
- Hors ligne = lecture seule : toute écriture hors ligne lève `OfflineError` et est refusée dans l'interface.
- Routage par hash (`/#/…`) pour GitHub Pages.

## Review Focus

1. **Voyage qui traverse des fuseaux horaires** (vol Paris 10:00 → Tokyo 06:00 le lendemain) : durée réelle juste (13 h), aucun faux conflit — test dans la tâche 3 et la tâche 5.
2. **Raccourcir les dates d'un voyage** alors que des jours supprimés contiennent des lieux : l'appli demande confirmation et ne supprime rien sans accord — tests dans la tâche 2 (`diffDays`) et la tâche 9 (`changeDates` refuse sans `confirm`).
3. **Lieu « sans carte »** (sans coordonnées) : aucun calcul automatique de trajet, trajet en saisie manuelle, carte qui ignore le point sans planter — tests dans la tâche 4 et la tâche 13.
4. **Roadbook d'un voyage presque vide** (jours sans lieu, aucune réservation) : le roadbook s'affiche sans erreur, avec « Aucune étape prévue » — test dans la tâche 6.
5. **Lien partagé d'un voyage supprimé** : affiche « Ce roadbook n'est plus partagé » sans autre information — test SQL dans la tâche 10 (suppression en cascade) et E2E dans la tâche 17.

---

## Structure des fichiers

```
src/
  domain/
    types.ts            Types métier (Trip, Day, Stop, Leg, Reservation, ChecklistItem, Contact, ShareLink, TripBundle)
    time.ts             Conversions date/heure locales ↔ instants (Luxon)
    days.ts             Jours à partir des dates du voyage
    schedule.ts         Heures d'arrivée, conflits, journée chargée, cumuls
    legs.ts             Quels trajets créer / supprimer / recalculer
    reservations.ts     Tri, conversion réservation → lieux + trajet
    checklist.ts        Modèle par défaut, progression, échéances
    roadbook.ts         Construction du roadbook + filtrage des infos sensibles
    format.ts           Formatage FR (dates, durées, distances)
  data/
    TripRepository.ts   Interface + erreurs
    memoryRepository.ts Implémentation en mémoire
    supabaseRepository.ts Implémentation Supabase
    repositoryContract.ts Suite de tests partagée par les implémentations
  routing/
    RoutingService.ts   Interface + RoutingError
    fakeRouting.ts      Implémentation factice déterministe
    edgeRouting.ts      Client de l'Edge Function
  services/
    tripService.ts      Orchestration (création, dates, lieux, trajets, réservations, partage)
  offline/
    cachedRepository.ts Lecture depuis le cache hors ligne, écritures refusées
    useOnline.ts        Hook d'état du réseau
  app/
    AppContext.tsx      Fournit services + utilisateur
    config.ts           Choix memory/supabase via VITE_DATA
    router.tsx
  ui/
    pages/              LoginPage, TripsPage, TripPage, SettingsPage, RoadbookPage, SharedRoadbookPage
    trip/               ItineraryTab, ChecklistTab, ReservationsTab, ContactsTab, LegRow, StopEditor, AddressInput
    map/MapView.tsx
    roadbook/Roadbook.tsx, roadbook.css (écran + @media print)
    common/             OfflineBanner, ConfirmDialog, CopyButton
supabase/
  migrations/0001_schema.sql
  migrations/0002_sharing.sql
  functions/routes/index.ts
  tests/*.sql (pgTAP)
e2e/*.spec.ts
docs/MISE-EN-PLACE.md
.github/workflows/deploy.yml
```

---

### Task 1 : Squelette du projet

**Files :**
- Create : `package.json`, `vite.config.ts`, `tsconfig.json`, `index.html`, `src/main.tsx`, `src/app/router.tsx`, `src/app/config.ts`, `playwright.config.ts`, `.github/workflows/deploy.yml`, `.gitignore`, `.env.example`
- Test : `src/app/config.test.ts`, `e2e/smoke.spec.ts`

**Interfaces :**
- Produces : `getDataMode(env: Record<string,string|undefined>): 'memory' | 'supabase'` (défaut `memory` si `VITE_SUPABASE_URL` absent) ; scripts npm `dev`, `build`, `test`, `test:e2e`, `test:db`.

- [ ] **Step 1 :** Créer le projet Vite React TS, installer les dépendances de la stack. `vite.config.ts` : `base: '/carnet-de-route/'`, vite-plugin-pwa (`registerType: 'autoUpdate'`, manifest `name: 'Carnet de route'`, `lang: 'fr'`, `display: 'standalone'`, icônes 192/512). `index.html` : `lang="fr"`, `apple-mobile-web-app-capable`.
- [ ] **Step 2 : Tests qui échouent**
  - `config.test.ts` : `getDataMode({})` → `'memory'` ; `getDataMode({VITE_DATA:'supabase', VITE_SUPABASE_URL:'x'})` → `'supabase'` ; `getDataMode({VITE_DATA:'memory', VITE_SUPABASE_URL:'x'})` → `'memory'`.
  - `smoke.spec.ts` : la page `/` a pour titre `Carnet de route`.
- [ ] **Step 3 :** `npm test` et `npm run test:e2e` → FAIL.
- [ ] **Step 4 :** Implémenter `getDataMode`, `HashRouter` avec une page d'accueil temporaire. Playwright lance `vite preview` avec `VITE_DATA=memory`, `--trace off`.
- [ ] **Step 5 :** Tests → PASS ; `npm run build` sans erreur.
- [ ] **Step 6 :** Workflow GitHub Pages (`actions/deploy-pages`) sur push `main` : `npm ci && npm test && npm run build`, variables `VITE_DATA`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` lues dans les variables du dépôt.
- [ ] **Step 7 : Commit** `chore: squelette Vite/React/PWA`

### Task 2 : Types, temps et jours

**Files :**
- Create : `src/domain/types.ts`, `src/domain/time.ts`, `src/domain/days.ts`, `src/domain/format.ts`
- Test : `src/domain/time.test.ts`, `src/domain/days.test.ts`, `src/domain/format.test.ts`

**Interfaces :**
- Produces (types, champs de la spec §4 en camelCase) :
  - `type TravelMode = 'car'|'walk'|'bike'|'train'|'bus'|'plane'|'ferry'|'other'`, `AUTO_MODES: TravelMode[] = ['car','walk','bike']`
  - `Trip { id, name, countries: string[], startDate: string /*YYYY-MM-DD*/, endDate, localCurrency, homeTimezone, updatedAt }`
  - `Day { id, tripId, date, title, note }`
  - `Stop { id, dayId, position, kind: 'activity'|'lodging'|'point', title, address, lat: number|null, lon: number|null, timezone, startTime: string|null /*HH:mm*/, durationMin: number|null, note, phone, url, reservationId: string|null }`
  - `Leg { id, fromStopId, toStopId, mode, durationMin: number|null, distanceKm: number|null, geometry: [number,number][]|null, source: 'auto'|'manual'|'reservation', error: string|null, computedAt: string|null, fromKey: string|null, toKey: string|null }` (`fromKey`/`toKey` = coordonnées utilisées au dernier calcul ; détail d'implémentation pour détecter un changement d'adresse)
  - `Reservation { id, tripId, type: 'flight'|'lodging'|'car_rental'|'train'|'activity'|'other', title, startAt: ZonedDateTime, endAt: ZonedDateTime|null, fromPlace: PlaceRef|null, toPlace: PlaceRef|null, confirmationNumber, price: number|null, currency, url, phone, note }`
  - `ZonedDateTime { date: string; time: string; timezone: string }`, `PlaceRef { title, address, lat: number|null, lon: number|null, timezone }`
  - `ChecklistItem { id, tripId, category: 'documents'|'health'|'luggage'|'before_departure', label, done, dueDate: string|null, position }`
  - `Contact { id, tripId, name, kind: 'embassy'|'emergency'|'lodging'|'other', phone, address, note }`
  - `ShareLink { tripId, token, hideSensitive, active, createdAt }`
  - `TripBundle { trip, days, stops, legs, reservations, checklist, contacts }`
  - `time.ts` : `toInstant(z: ZonedDateTime): number` (ms epoch), `minutesBetween(a: ZonedDateTime, b: ZonedDateTime): number`, `addMinutes(z: ZonedDateTime, min: number, targetTz?: string): ZonedDateTime`, `coordKey(lat: number|null, lon: number|null): string|null` (`"48.85660,2.35220"`, 5 décimales ; `null` si une coordonnée manque)
  - `days.ts` : `datesBetween(start: string, end: string): string[]` (inclusif) ; `diffDays(existing: Day[], start: string, end: string, stops: Stop[]): { toCreate: string[]; toDelete: Day[]; nonEmptyToDelete: Day[] }`
  - `format.ts` : `formatDate('2026-12-03')` → `'03/12/2026'`, `formatDuration(125)` → `'2 h 05'`, `formatDuration(45)` → `'45 min'`, `formatDistance(12.345)` → `'12,3 km'`, `formatDayLabel('2026-12-03')` → `'jeudi 3 décembre'`

- [ ] **Step 1 : Tests qui échouent**
  - `datesBetween('2026-12-30','2027-01-02')` → 4 dates `['2026-12-30','2026-12-31','2027-01-01','2027-01-02']` ; `datesBetween('2026-12-03','2026-12-03')` → 1 date.
  - `diffDays` : jours existants 1→5 déc., nouvelles dates 3→7 déc. → `toCreate` = 6 et 7, `toDelete` = 1 et 2 ; si un lieu est rattaché au 2, `nonEmptyToDelete` = [jour du 2].
  - `minutesBetween({date:'2026-12-01',time:'10:00',timezone:'Europe/Paris'},{date:'2026-12-02',time:'06:00',timezone:'Asia/Tokyo'})` → `780`.
  - `addMinutes({date:'2026-12-01',time:'23:30',timezone:'Europe/Paris'}, 60)` → `{date:'2026-12-02',time:'00:30',timezone:'Europe/Paris'}`.
  - `coordKey(null, 2)` → `null`.
  - Formatage : valeurs ci-dessus.
- [ ] **Step 2 :** `npx vitest run src/domain` → FAIL.
- [ ] **Step 3 :** Implémenter avec Luxon (`setZone`, locale `fr`).
- [ ] **Step 4 :** Tests → PASS.
- [ ] **Step 5 : Commit** `feat(domain): types, temps, jours, formatage`

### Task 3 : Planning d'une journée (conflits, journée chargée)

**Files :**
- Create : `src/domain/schedule.ts`
- Test : `src/domain/schedule.test.ts`

**Interfaces :**
- Consumes : types et `time.ts` (tâche 2).
- Produces :
  - `StopTiming { stopId: string; plannedStart: ZonedDateTime|null; estimatedArrival: ZonedDateTime|null; conflictMinutes: number /*0 si aucun*/ }`
  - `DaySchedule { timings: StopTiming[]; travelMinutes: number; distanceKm: number; heavy: boolean; unknownLegs: number }`
  - `computeDaySchedule(day: Day, stops: Stop[] /*triés par position*/, legs: Leg[], heavyThresholdMin = 300): DaySchedule`

Règles : l'heure de référence d'un lieu = son `startTime` s'il existe, sinon son arrivée estimée. Arrivée estimée du lieu n = référence du lieu n-1 + `durationMin` du lieu n-1 (0 si absent) + `durationMin` du trajet n-1→n. Si une donnée de la chaîne manque (référence inconnue ou trajet sans durée), l'arrivée estimée est `null` et aucun conflit n'est signalé. Conflit = arrivée estimée postérieure au `startTime` prévu ; `conflictMinutes` = écart. Les conversions passent par le fuseau de chaque lieu. `heavy` = `travelMinutes > heavyThresholdMin`. `unknownLegs` = trajets sans durée.

- [ ] **Step 1 : Tests qui échouent**
  - `conflit simple` : lieu A 13:00, 60 min ; trajet 80 min ; lieu B 14:00 → B `estimatedArrival.time === '15:20'`, `conflictMinutes === 80`.
  - `pas de conflit` : A 09:00, 60 min ; trajet 30 ; B 11:00 → `conflictMinutes === 0`.
  - `chaîne sans heure` : A 09:00, 60 min ; trajet 30 ; B sans heure, 120 min ; trajet 15 ; C 12:30 → arrivée C 12:45, conflit 15.
  - `trajet inconnu` : trajet sans durée → arrivée `null`, conflit 0, `unknownLegs === 1`.
  - `fuseaux` : A aéroport CDG `Europe/Paris` 10:00, 0 min ; trajet avion 780 min ; B Haneda `Asia/Tokyo` 07:00 le lendemain → arrivée `06:00` heure de Tokyo, conflit 0.
  - `journée chargée` : trajets 200 + 120 min → `travelMinutes === 320`, `heavy === true` ; avec seuil 400 → `false`.
  - `journée vide` → `timings: []`, `travelMinutes: 0`, `heavy: false`.
- [ ] **Step 2 :** FAIL.
- [ ] **Step 3 :** Implémenter.
- [ ] **Step 4 :** PASS.
- [ ] **Step 5 : Commit** `feat(domain): planning journalier et alertes`

### Task 4 : Planification des trajets

**Files :**
- Create : `src/domain/legs.ts`
- Test : `src/domain/legs.test.ts`

**Interfaces :**
- Produces :
  - `orderedStops(days: Day[], stops: Stop[]): Stop[]` — tous les lieux du voyage, triés par date puis position.
  - `LegPlan { create: {fromStopId: string; toStopId: string; mode: TravelMode}[]; remove: Leg[]; recompute: Leg[] }`
  - `planLegs(ordered: Stop[], legs: Leg[], defaultMode: TravelMode = 'car'): LegPlan`
  - `canAutoCompute(leg: Leg, from: Stop, to: Stop): boolean` — `true` si `AUTO_MODES` contient le mode, `source === 'auto'`, et les deux lieux ont des coordonnées.

Règles : un trajet doit exister pour chaque paire consécutive de `ordered` (y compris dernier lieu d'un jour → premier du jour suivant) ; tout trajet dont la paire n'est plus consécutive va dans `remove` ; un trajet existant va dans `recompute` si `canAutoCompute` et (`durationMin === null` ou `fromKey`/`toKey` ≠ `coordKey` actuels). Les trajets `manual` et `reservation` ne sont jamais recalculés.

- [ ] **Step 1 : Tests qui échouent**
  - 3 lieux sans trajet → `create` contient A→B et B→C.
  - Lieux sur deux jours (A, B le 1er ; C le 2) → `create` contient B→C.
  - Lieu B déplacé après C → `remove` = A→B, B→C ; `create` = A→C, C→B.
  - Adresse de B modifiée (coordonnées changées) sur un trajet `auto` → dans `recompute` ; même cas en `manual` → absent.
  - Lieu sans coordonnées : `canAutoCompute` → `false`, le trajet n'est pas dans `recompute`.
- [ ] **Step 2 :** FAIL. **Step 3 :** Implémenter. **Step 4 :** PASS.
- [ ] **Step 5 : Commit** `feat(domain): planification des trajets`

### Task 5 : Réservations et checklist

**Files :**
- Create : `src/domain/reservations.ts`, `src/domain/checklist.ts`
- Test : `src/domain/reservations.test.ts`, `src/domain/checklist.test.ts`

**Interfaces :**
- Produces :
  - `sortReservations(r: Reservation[]): Reservation[]` — par `toInstant(startAt)`.
  - `ReservationStops { stops: Omit<Stop,'id'|'dayId'|'position'> & { date: string } []; leg: { mode: TravelMode; durationMin: number } | null }`
  - `reservationToStops(r: Reservation): ReservationStops`
    - `flight` → lieu `point` « Départ : {title} » à `fromPlace`/`startAt` + lieu `point` « Arrivée : {title} » à `toPlace`/`endAt` ; trajet `plane`, durée `minutesBetween(startAt,endAt)`.
    - `train` → idem, mode `train`.
    - `lodging` → un lieu `lodging` à `toPlace ?? fromPlace`, date de `startAt` (arrivée), titre = `title` ; pas de trajet.
    - `car_rental`, `activity`, `other` → un lieu `activity` à `fromPlace` le jour de `startAt`.
    - Tous les lieux créés ont `reservationId = r.id`.
  - `DEFAULT_CHECKLIST: { category; label }[]` — Documents : Passeport valide (6 mois après le retour), Visa / autorisation d'entrée, Assurance voyage, Permis de conduire international, Copies des documents ; Santé : Vaccins recommandés, Trousse à pharmacie, Ordonnances ; Valise : Adaptateur de prise, Chargeurs, Vêtements adaptés à la météo ; Avant le départ : Prévenir la banque, Forfait téléphone à l'étranger, Télécharger les cartes hors ligne, Générer et partager le roadbook.
  - `checklistProgress(items): { done: number; total: number }`
  - `isOverdue(item: ChecklistItem, today: string): boolean` — `!done && dueDate !== null && dueDate < today`.

- [ ] **Step 1 : Tests qui échouent**
  - Vol Paris 01/12 10:00 `Europe/Paris` → Tokyo 02/12 06:00 `Asia/Tokyo` : 2 lieux (dates `2026-12-01` et `2026-12-02`), trajet `plane` 780 min.
  - Hôtel : un lieu `lodging` à la date d'arrivée, `reservationId` renseigné.
  - `sortReservations` : un vol à Tokyo 08:00 (`Asia/Tokyo`) passe avant un train à Paris le même jour 07:00 (`Europe/Paris`).
  - `checklistProgress` sur 3 éléments dont 2 cochés → `{done:2,total:3}`.
  - `isOverdue` : échéance hier, non coché → `true` ; coché → `false` ; pas d'échéance → `false`.
- [ ] **Step 2 :** FAIL. **Step 3 :** Implémenter. **Step 4 :** PASS.
- [ ] **Step 5 : Commit** `feat(domain): réservations et checklist`

### Task 6 : Construction du roadbook et filtrage

**Files :**
- Create : `src/domain/roadbook.ts`
- Test : `src/domain/roadbook.test.ts`

**Interfaces :**
- Consumes : `computeDaySchedule`, `orderedStops`, `sortReservations`, `checklistProgress`.
- Produces :
  - `RoadbookDay { day: Day; stops: Stop[]; legs: Leg[] /*trajets partant d'un lieu du jour*/; schedule: DaySchedule; lodging: Stop|null /*dernier lieu 'lodging' du jour*/; lodgingReservation: Reservation|null }`
  - `Roadbook { trip: Trip; overview: { date: string; title: string; lodgingTitle: string|null; travelMinutes: number; distanceKm: number }[]; days: RoadbookDay[]; reservations: Reservation[]; checklist: ChecklistItem[]; contacts: Contact[]; totals: { travelMinutes: number; distanceKm: number }; hideSensitive: boolean }`
  - `buildRoadbook(bundle: TripBundle, opts: { hideSensitive: boolean; heavyThresholdMin?: number }): Roadbook`
  - `stripSensitive(bundle: TripBundle): TripBundle` — vide les champs listés dans les Global Constraints (`''` pour les textes, `null` pour `price`).

- [ ] **Step 1 : Tests qui échouent**
  - Voyage de 3 jours avec lieux et trajets → `days.length === 3`, totaux = somme des jours.
  - `lodging` du jour 1 = l'hôtel ; `lodgingReservation` = sa réservation.
  - `hideSensitive: true` → aucun `confirmationNumber`, `price`, `url` de réservation, `note` (réservation, lieu, jour, contact) dans `JSON.stringify(roadbook)` (test avec des valeurs sentinelles `'SECRET-…'`).
  - `hideSensitive: false` → les sentinelles sont présentes.
  - Voyage sans aucun lieu ni réservation → pas d'exception, `days` de longueur = nombre de dates, `stops` vides.
- [ ] **Step 2 :** FAIL. **Step 3 :** Implémenter. **Step 4 :** PASS.
- [ ] **Step 5 : Commit** `feat(domain): roadbook et filtrage des infos sensibles`

### Task 7 : Interface de données et implémentation en mémoire

**Files :**
- Create : `src/data/TripRepository.ts`, `src/data/memoryRepository.ts`, `src/data/repositoryContract.ts`
- Test : `src/data/memoryRepository.test.ts`

**Interfaces :**
- Produces :
```ts
export class OfflineError extends Error {}
export class NotFoundError extends Error {}
export type New<T> = Omit<T, 'id'>;
export interface SharedRoadbookData { bundle: TripBundle; hideSensitive: boolean; ownerName: string; updatedAt: string }
export interface TripRepository {
  listTrips(): Promise<Trip[]>;
  getBundle(tripId: string): Promise<TripBundle>;           // NotFoundError si absent
  createTrip(t: New<Trip>): Promise<Trip>;
  updateTrip(t: Trip): Promise<Trip>;
  deleteTrip(id: string): Promise<void>;                     // supprime tout en cascade
  createDays(tripId: string, dates: string[]): Promise<Day[]>;
  deleteDays(ids: string[]): Promise<void>;                  // supprime leurs lieux
  updateDay(d: Day): Promise<Day>;
  saveStop(s: Stop | New<Stop>): Promise<Stop>;
  deleteStop(id: string): Promise<void>;
  reorderStops(dayId: string, orderedIds: string[]): Promise<void>;
  saveLeg(l: Leg | New<Leg>): Promise<Leg>;
  deleteLegs(ids: string[]): Promise<void>;
  saveReservation(r: Reservation | New<Reservation>): Promise<Reservation>;
  deleteReservation(id: string): Promise<void>;              // supprime les lieux liés
  saveChecklistItem(i: ChecklistItem | New<ChecklistItem>): Promise<ChecklistItem>;
  deleteChecklistItem(id: string): Promise<void>;
  saveContact(c: Contact | New<Contact>): Promise<Contact>;
  deleteContact(id: string): Promise<void>;
  getShareLink(tripId: string): Promise<ShareLink | null>;   // lien actif
  createShareLink(tripId: string, hideSensitive: boolean): Promise<ShareLink>; // désactive l'ancien
  revokeShareLink(tripId: string): Promise<void>;
  getSharedRoadbook(token: string): Promise<SharedRoadbookData | null>;  // filtré si hideSensitive
}
```
- `repositoryContract.ts` : `runRepositoryContract(name: string, make: () => Promise<TripRepository>)` — suite Vitest réutilisée par la tâche 10.
- `createMemoryRepository(seed?: TripBundle[]): TripRepository` — ids `crypto.randomUUID()`, jeton = 32 hex aléatoires, `getSharedRoadbook` applique `stripSensitive` si besoin.

- [ ] **Step 1 : Tests qui échouent** (dans le contrat) : création/lecture d'un voyage ; `deleteTrip` vide le bundle et `getBundle` lève `NotFoundError` ; `deleteDays` supprime les lieux du jour ; `deleteReservation` supprime ses lieux ; `reorderStops` réécrit `position` 0..n-1 ; `createShareLink` deux fois → l'ancien jeton renvoie `null` ; `revokeShareLink` → `null` ; jeton inconnu → `null` ; voyage supprimé → `getSharedRoadbook(ancienJeton)` → `null` ; `hideSensitive` → sentinelles absentes ; jeton de 32 caractères `[0-9a-f]`.
- [ ] **Step 2 :** FAIL. **Step 3 :** Implémenter la version mémoire. **Step 4 :** PASS.
- [ ] **Step 5 : Commit** `feat(data): interface TripRepository et version mémoire`

### Task 8 : Service de trajets (interface, factice, Edge Function)

**Files :**
- Create : `src/routing/RoutingService.ts`, `src/routing/fakeRouting.ts`, `src/routing/edgeRouting.ts`, `supabase/functions/routes/index.ts`, `supabase/functions/routes/ors.ts`
- Test : `src/routing/edgeRouting.test.ts`, `supabase/functions/routes/ors.test.ts` (Deno test)

**Interfaces :**
- Produces :
```ts
export type RoutingErrorCode = 'NOT_FOUND' | 'NO_ROUTE' | 'QUOTA' | 'NETWORK' | 'UNAUTHORIZED';
export class RoutingError extends Error { constructor(public code: RoutingErrorCode, message: string) }
export interface GeocodeResult { label: string; lat: number; lon: number; country: string; timezone: string }
export interface RouteResult { durationMin: number; distanceKm: number; geometry: [number, number][] }
export interface RoutingService {
  geocode(query: string): Promise<GeocodeResult[]>;          // [] si rien trouvé
  route(from: {lat:number;lon:number}, to: {lat:number;lon:number}, mode: 'car'|'walk'|'bike'): Promise<RouteResult>;
}
```
- Edge Function : `POST /routes` corps `{action:'geocode', query}` ou `{action:'route', from, to, mode}` ; exige un JWT Supabase valide (sinon 401) ; appelle ORS avec `ORS_API_KEY` : géocodage `/geocode/search?text=…&size=5&lang=fr`, itinéraire `/v2/directions/{profile}/geojson` avec profils `driving-car`, `foot-walking`, `cycling-regular`. Fuseau horaire d'un résultat calculé avec `tz-lookup` (à partir de lat/lon).
- `ors.ts` : `mapOrsError(status: number, body: unknown): RoutingErrorCode` — 429 → `QUOTA` ; 404 ou code ORS 2004/2009/2010 → `NO_ROUTE` ; 401/403 → `UNAUTHORIZED` ; autre → `NETWORK`. `toRouteResult(geojson)` : secondes → minutes arrondies au supérieur, mètres → km 1 décimale, coordonnées `[lon,lat]` → `[lat,lon]`.
- `createFakeRouting(places?: Record<string, GeocodeResult[]>)` : `route` renvoie distance = distance à vol d'oiseau × 1,3 et durée = distance / vitesse (car 70 km/h, walk 5, bike 15) ; une requête contenant `introuvable` → `[]` ; un trajet dont un point a `lat === 0` → `NO_ROUTE`.

- [ ] **Step 1 : Tests qui échouent**
  - `ors.test.ts` : `mapOrsError(429, {})` → `QUOTA` ; `mapOrsError(404, {error:{code:2010}})` → `NO_ROUTE` ; `toRouteResult` d'un GeoJSON de 3725 s / 52 340 m → `{durationMin: 63, distanceKm: 52.3}` et premier point inversé.
  - `edgeRouting.test.ts` (fetch simulé) : réponse 429 → `RoutingError` code `QUOTA` ; échec réseau → `NETWORK` ; réponse OK → `RouteResult`.
- [ ] **Step 2 :** FAIL (`npx vitest run src/routing`, `deno test supabase/functions/routes`).
- [ ] **Step 3 :** Implémenter.
- [ ] **Step 4 :** PASS.
- [ ] **Step 5 : Commit** `feat(routing): service de trajets et Edge Function ORS`

### Task 9 : Service applicatif `TripService`

**Files :**
- Create : `src/services/tripService.ts`
- Test : `src/services/tripService.test.ts` (repo mémoire + routage factice)

**Interfaces :**
- Consumes : `TripRepository`, `RoutingService`, fonctions du domaine.
- Produces :
```ts
export class NeedsConfirmationError extends Error { constructor(public days: Day[]) }
export interface TripService {
  createTrip(t: New<Trip>): Promise<TripBundle>;                 // + jours + DEFAULT_CHECKLIST
  duplicateTrip(id: string, newName: string): Promise<TripBundle>; // sans lien de partage
  changeDates(tripId: string, start: string, end: string, opts?: { confirm?: boolean }): Promise<TripBundle>;
  addStop(dayId: string, s: New<Omit<Stop,'dayId'|'position'>>): Promise<TripBundle>;
  updateStop(s: Stop): Promise<TripBundle>;
  removeStop(id: string): Promise<TripBundle>;
  moveStop(stopId: string, toDayId: string, toIndex: number): Promise<TripBundle>;
  setLegManual(legId: string, mode: TravelMode, durationMin: number | null): Promise<TripBundle>;
  setLegMode(legId: string, mode: TravelMode): Promise<TripBundle>; // 'auto' si mode calculable
  saveReservation(r: Reservation | New<Reservation>): Promise<TripBundle>;
  syncLegs(tripId: string): Promise<TripBundle>;                 // applique planLegs + calculs
}
```
Chaque méthode qui modifie lieux ou réservations appelle `syncLegs` à la fin. `syncLegs` : applique `planLegs`, puis appelle `routing.route` pour chaque trajet de `create`/`recompute` calculable ; en cas de `RoutingError`, enregistre le trajet avec `durationMin: null` et `error` = message FR (`NO_ROUTE` : « Aucun trajet routier possible (mer ?). Choisis ferry ou avion, ou saisis la durée. » ; `QUOTA` : « Calcul indisponible pour aujourd'hui. Saisis la durée à la main. » ; `NETWORK` : « Calcul impossible : vérifie ta connexion. »). Les trajets entre deux lieux d'une même réservation sont `source: 'reservation'` avec la durée de `reservationToStops`. `saveReservation` remplace les lieux liés existants (supprime puis recrée sur les jours correspondants ; si la date est hors du voyage, le lieu n'est pas créé et la réservation reste dans l'onglet).

- [ ] **Step 1 : Tests qui échouent**
  - `createTrip` 3 jours → 3 jours + 15 éléments de checklist.
  - `changeDates` qui retire un jour contenant un lieu, sans `confirm` → lève `NeedsConfirmationError` et rien n'est supprimé ; avec `confirm: true` → jour et lieu supprimés.
  - `addStop` ×2 → un trajet `auto` calculé avec `durationMin > 0`.
  - Trajet vers un point `lat: 0` → `error` contient « Aucun trajet routier possible ».
  - `setLegManual` puis modification d'adresse → la durée manuelle est conservée.
  - `saveReservation` d'un vol → 2 lieux + trajet `reservation` de 780 min ; modifier l'heure d'arrivée → lieux mis à jour sans doublon.
  - `moveStop` d'un lieu vers le jour suivant → trajets recalculés selon le nouvel ordre.
- [ ] **Step 2 :** FAIL. **Step 3 :** Implémenter. **Step 4 :** PASS.
- [ ] **Step 5 : Commit** `feat(services): orchestration TripService`

### Task 10 : Base Supabase, RLS, partage et implémentation Supabase

**Files :**
- Create : `supabase/migrations/0001_schema.sql`, `supabase/migrations/0002_sharing.sql`, `supabase/tests/rls.sql`, `supabase/tests/sharing.sql`, `src/data/supabaseRepository.ts`, `scripts/test-db.sh`
- Test : `src/data/supabaseRepository.test.ts` (contrat de la tâche 7, exécuté seulement si `SUPABASE_TEST_URL` est défini)

**Interfaces :**
- Produces : tables de la spec §4 (snake_case) + `legs.from_key`, `legs.to_key` ; `user_id uuid default auth.uid()` ; clés étrangères `on delete cascade` ; RLS `user_id = auth.uid()` pour select/insert/update/delete sur chaque table ; trigger `updated_at`.
- `0002_sharing.sql` : table `share_links` ; fonction `create_share_link(p_trip uuid, p_hide boolean) returns share_links` (désactive l'ancien, jeton `encode(gen_random_bytes(16),'hex')`) ; `get_shared_roadbook(p_token text) returns jsonb` en `security definer`, `set search_path = public`, `grant execute … to anon, authenticated` ; renvoie `null` si jeton inconnu ou inactif, sinon `{trip, days, stops, legs, reservations, checklist, contacts, hide_sensitive, owner_name, updated_at}` du seul voyage du lien, avec les champs sensibles remplacés par `''`/`null` côté SQL si `hide_sensitive`. `owner_name` = partie avant `@` de l'e-mail du propriétaire.
- `createSupabaseRepository(client: SupabaseClient): TripRepository` (conversion snake_case ↔ camelCase).
- `scripts/test-db.sh` : lance `supabase test db` si la CLI et Docker sont disponibles ; sinon affiche comment les installer et sort en échec explicite.

- [ ] **Step 1 : Tests SQL qui échouent (pgTAP)**
  - `rls.sql` : l'utilisateur B ne voit aucune ligne du voyage de A (toutes les tables) et ne peut ni modifier ni supprimer.
  - `sharing.sql` : en rôle `anon`, aucun `select` direct possible sur `trips` ; `get_shared_roadbook(jeton actif)` renvoie le voyage ; jeton désactivé, inconnu, ou voyage supprimé → `null` ; avec `hide_sensitive` → `confirmation_number`, `price`, notes vides ; le JSON ne contient jamais l'id d'un autre voyage du même propriétaire.
- [ ] **Step 2 :** `npm run test:db` → FAIL.
- [ ] **Step 3 :** Écrire les migrations et `supabaseRepository.ts`.
- [ ] **Step 4 :** `npm run test:db` → PASS ; `SUPABASE_TEST_URL=… npx vitest run src/data` → contrat PASS.
- [ ] **Step 5 : Commit** `feat(data): schéma Supabase, RLS et partage`

### Task 11 : Hors ligne

**Files :**
- Create : `src/offline/cachedRepository.ts`, `src/offline/useOnline.ts`, `src/ui/common/OfflineBanner.tsx`
- Test : `src/offline/cachedRepository.test.ts`

**Interfaces :**
- Produces : `createCachedRepository(inner: TripRepository, isOnline: () => boolean, store?: KeyValueStore): TripRepository` — en ligne : délègue et met en cache `listTrips` (`trips`) et `getBundle` (`bundle:{id}`), et `getSharedRoadbook` (`shared:{token}`) ; hors ligne : les lectures renvoient le cache (ou `OfflineError` s'il est vide), toutes les écritures lèvent `OfflineError`. `KeyValueStore { get(k): Promise<unknown>; set(k, v): Promise<void> }` (idb-keyval par défaut, Map en test).
- `useOnline(): boolean` (événements `online`/`offline`).
- `OfflineBanner` : texte exact « Hors ligne — consultation seulement ».

- [ ] **Step 1 : Tests qui échouent** : lecture en ligne puis hors ligne → même bundle ; hors ligne sans cache → `OfflineError` ; `saveStop` hors ligne → `OfflineError` et `inner.saveStop` jamais appelé.
- [ ] **Step 2 :** FAIL. **Step 3 :** Implémenter. **Step 4 :** PASS.
- [ ] **Step 5 :** Configurer le service worker (vite-plugin-pwa) pour mettre en cache l'application elle-même (precache) et les tuiles OSM déjà vues (`CacheFirst`, 500 entrées max).
- [ ] **Step 6 : Commit** `feat(offline): cache local et lecture seule hors ligne`

### Task 12 : Connexion, liste des voyages, page voyage, réglages

**Files :**
- Create : `src/app/AppContext.tsx`, `src/ui/pages/LoginPage.tsx`, `TripsPage.tsx`, `TripPage.tsx`, `SettingsPage.tsx`, `src/ui/common/ConfirmDialog.tsx`
- Test : `src/ui/pages/TripsPage.test.tsx`, `e2e/trips.spec.ts`

**Interfaces :**
- Consumes : `TripService`, `TripRepository` (via contexte), `useOnline`.
- Produces : `useApp(): { repo: TripRepository; service: TripService; user: {email: string} | null; settings: { heavyThresholdMin: number }; setSettings(s): void }` ; routes `#/connexion`, `#/`, `#/voyage/:id/:onglet` (`itineraire|checklist|reservations|contacts`), `#/voyage/:id/roadbook`, `#/reglages`, `#/r/:token`. Réglages stockés dans `localStorage` (try/catch, défaut 300).
- Mode `memory` : utilisateur fictif connecté automatiquement. Mode `supabase` : `signInWithOtp({ email, options: { emailRedirectTo: location.origin + location.pathname } })` ; message « Lien envoyé à {email}. Ouvre-le sur cet appareil. » ; session expirée → retour à `#/connexion` avec « Ta session a expiré, demande un nouveau lien. ».

- [ ] **Step 1 : Tests qui échouent**
  - `TripsPage.test.tsx` : liste vide → « Aucun voyage pour l'instant » ; création d'un voyage → apparaît avec ses dates `03/12/2026 → 10/12/2026`.
  - `e2e/trips.spec.ts` : créer, renommer, dupliquer (« … (copie) »), supprimer avec confirmation ; raccourcir les dates d'un voyage dont un jour retiré a un lieu → boîte de confirmation listant ce jour, « Annuler » ne change rien.
  - `TripsPage.test.tsx` : un `createTrip` qui rejette → message « Enregistrement impossible. » + bouton « Réessayer », le formulaire garde la saisie ; « Réessayer » relance l'appel.
- [ ] **Step 2 :** FAIL. **Step 3 :** Implémenter. Désactiver tous les boutons de modification quand `useOnline()` est faux. Fournir un hook `useSave(fn)` (état `saving`/`error`, `retry()`) utilisé par tous les formulaires des tâches 12 à 16. **Step 4 :** PASS.
- [ ] **Step 5 : Commit** `feat(ui): connexion, voyages, réglages`

### Task 13 : Onglet Itinéraire et cartes

**Files :**
- Create : `src/ui/trip/ItineraryTab.tsx`, `StopEditor.tsx`, `AddressInput.tsx`, `LegRow.tsx`, `src/ui/map/MapView.tsx`
- Test : `src/ui/trip/LegRow.test.tsx`, `src/ui/trip/AddressInput.test.tsx`, `src/ui/map/MapView.test.tsx`, `e2e/itinerary.spec.ts`

**Interfaces :**
- Consumes : `TripService`, `computeDaySchedule`, `RoutingService.geocode`, formatage.
- Produces : `MapView({ points: {lat:number|null; lon:number|null; label:string}[]; lines: [number,number][][]; height?: number })` — ignore les points sans coordonnées, ajuste le cadrage ; `appleMapsUrl(address: string)` → `https://maps.apple.com/?q=…` ; `appleMapsDirectionsUrl(from: string, to: string, mode: TravelMode)` → `https://maps.apple.com/?saddr=…&daddr=…&dirflg=d|w|r` (car `d`, walk `w`, transports `r`).

Comportement : une section par jour (`formatDayLabel`, titre modifiable), carte du jour, lieux dans l'ordre (glisser-déposer @dnd-kit, aussi entre jours), un `LegRow` entre chaque paire : mode (liste), durée et distance, « Itinéraire » vers Plans, champ durée manuelle, message d'erreur du trajet. Alertes : conflit « Tu arrives à {HH:mm}, {titre} commence à {HH:mm} » ; journée chargée « {durée} de trajet ce jour-là ». Carte d'ensemble en haut de l'onglet. `AddressInput` : recherche après 400 ms, liste des résultats à choisir ; aucun résultat → « Adresse introuvable » + bouton « Ajouter sans carte ».

- [ ] **Step 1 : Tests qui échouent**
  - `LegRow` : trajet avec `error` → message affiché + champ durée ; trajet `plane` → pas de calcul, champ durée.
  - `AddressInput` : 2 résultats → les deux proposés, le choix renvoie lat/lon/fuseau ; requête « introuvable » → « Adresse introuvable » et « Ajouter sans carte ».
  - `MapView` : un point sans coordonnées parmi trois → 2 marqueurs, pas d'erreur.
  - `e2e/itinerary.spec.ts` : ajouter 2 lieux au jour 1 → durée de trajet affichée ; mettre une heure qui crée un conflit → alerte visible ; réordonner → trajets mis à jour ; ajouter un lieu sans carte → trajet en saisie manuelle.
- [ ] **Step 2 :** FAIL. **Step 3 :** Implémenter. **Step 4 :** PASS.
- [ ] **Step 5 : Commit** `feat(ui): itinéraire, trajets et cartes`

### Task 14 : Onglets Checklist, Réservations, Contacts

**Files :**
- Create : `src/ui/trip/ChecklistTab.tsx`, `ReservationsTab.tsx`, `ReservationForm.tsx`, `ContactsTab.tsx`, `src/ui/common/CopyButton.tsx`
- Test : `src/ui/trip/ChecklistTab.test.tsx`, `src/ui/trip/ReservationForm.test.tsx`, `e2e/reservations.spec.ts`

**Interfaces :**
- Consumes : `TripService.saveReservation`, `TripRepository` (checklist, contacts), `checklistProgress`, `isOverdue`, `sortReservations`.
- Produces : `CopyButton({ value: string })` — `navigator.clipboard.writeText`, affiche « Copié » 2 s.

Libellés des types : Vol, Hébergement, Location de voiture, Train, Activité ou billet, Autre. Catégories : Documents, Santé, Valise, Avant le départ. Contacts : Ambassade / consulat, Urgences, Hébergement, Autre. Formulaire réservation : lieux de départ/arrivée via `AddressInput` (fuseau rempli automatiquement) ; si `endAt` < `startAt` → « L'arrivée doit être après le départ ».

- [ ] **Step 1 : Tests qui échouent**
  - Checklist : « 2/3 faits » ; élément en retard affiché avec la classe `overdue`.
  - Formulaire : arrivée avant départ → erreur, pas d'enregistrement.
  - `e2e/reservations.spec.ts` : créer un vol → visible dans Réservations triées et deux lieux dans l'Itinéraire aux bons jours ; copier le numéro de confirmation → « Copié » ; ajouter un contact « Ambassade de France ».
- [ ] **Step 2 :** FAIL. **Step 3 :** Implémenter. **Step 4 :** PASS.
- [ ] **Step 5 : Commit** `feat(ui): checklist, réservations, contacts`

### Task 15 : Roadbook (HTML + PDF)

**Files :**
- Create : `src/ui/roadbook/Roadbook.tsx`, `src/ui/roadbook/roadbook.css`, `src/ui/pages/RoadbookPage.tsx`
- Test : `src/ui/roadbook/Roadbook.test.tsx`, `e2e/roadbook.spec.ts`

**Interfaces :**
- Consumes : `buildRoadbook`, `MapView`, formatage, `appleMapsUrl`.
- Produces : `Roadbook({ roadbook: Roadbook; banner?: ReactNode })` — composant de présentation pur, réutilisé par la page partagée (tâche 16).

Sections dans l'ordre de la spec §5.7 : couverture (nom, dates, pays, carte d'ensemble) ; vue d'ensemble (tableau) ; une section par jour (carte, programme horaire avec heures prévues/estimées, trajets mode/durée/distance, hébergement avec adresse, téléphone `tel:`, n° de réservation si non masqué, alertes) ; annexes (réservations, checklist, contacts). Jour sans lieu → « Aucune étape prévue ». Bouton « Exporter en PDF » → `window.print()` (masqué à l'impression). CSS d'impression : `@page { size: A4; margin: 12mm }`, `break-before: page` sur chaque jour et sur les annexes, cartes à hauteur fixe ; attendre le chargement des tuiles (événement `load` de Leaflet) avant `print()`, 3 s max.

- [ ] **Step 1 : Tests qui échouent**
  - `Roadbook.test.tsx` : 3 jours → 3 sections `data-testid="roadbook-day"` ; jour vide → « Aucune étape prévue » ; `hideSensitive` → pas de numéro de confirmation ; adresse = lien `maps.apple.com`.
  - `e2e/roadbook.spec.ts` : ouvrir le roadbook d'un voyage rempli ; `page.pdf()` en émulation `print` produit un PDF de ≥ 1 page par jour + couverture.
- [ ] **Step 2 :** FAIL. **Step 3 :** Implémenter. **Step 4 :** PASS.
- [ ] **Step 5 : Commit** `feat(ui): roadbook HTML et export PDF`

### Task 16 : Partage du roadbook

**Files :**
- Create : `src/ui/roadbook/SharePanel.tsx`, `src/ui/pages/SharedRoadbookPage.tsx`
- Test : `src/ui/roadbook/SharePanel.test.tsx`, `e2e/sharing.spec.ts`

**Interfaces :**
- Consumes : `TripRepository.getShareLink/createShareLink/revokeShareLink/getSharedRoadbook`, `Roadbook`, `CopyButton`.
- Produces : `shareUrl(token: string): string` → `${location.origin}${location.pathname}#/r/${token}`.

Panneau « Partager » (dans la page roadbook) : sans lien → case « Masquer les infos sensibles » (cochée) + « Créer un lien » + avertissement exact « Toute personne qui a ce lien peut voir ton itinéraire, tes hébergements et tes dates. » ; avec lien → URL, « Copier », « Partager » (`navigator.share` si disponible), « Nouveau lien », « Désactiver le lien » (avec confirmation). Rappel : « Pour une copie figée, exporte le PDF et envoie-le. »
Page `#/r/:token` : accessible sans connexion ; ajoute `<meta name="robots" content="noindex">` ; bandeau « Roadbook partagé par {ownerName} — mis à jour le {jj/mm/aaaa à HH:mm} » ; bouton « Exporter en PDF » ; jeton invalide → uniquement « Ce roadbook n'est plus partagé. »

- [ ] **Step 1 : Tests qui échouent**
  - `SharePanel` : case cochée par défaut ; avertissement présent ; « Désactiver » demande confirmation.
  - `e2e/sharing.spec.ts` : créer un lien → l'ouvrir dans un nouveau contexte navigateur non connecté → roadbook visible, aucun numéro de confirmation ; modifier le voyage côté propriétaire → recharger la page partagée → modification visible ; « Nouveau lien » → l'ancien affiche « Ce roadbook n'est plus partagé. » ; désactiver → idem.
- [ ] **Step 2 :** FAIL. **Step 3 :** Implémenter. En mode `memory`, les deux contextes Playwright partagent les données via un `seed` exposé par `window.__memoryStore` (uniquement quand `VITE_DATA=memory`). **Step 4 :** PASS.
- [ ] **Step 5 : Commit** `feat(ui): partage du roadbook par lien`

### Task 17 : Parcours complet, hors ligne et guide de mise en place

**Files :**
- Create : `e2e/full-journey.spec.ts`, `e2e/offline.spec.ts`, `docs/MISE-EN-PLACE.md`, `README.md`
- Modify : `.github/workflows/deploy.yml` (ajout `npm run test:e2e`)

- [ ] **Step 1 : Tests**
  - `full-journey.spec.ts` (mode memory) : créer un voyage Paris → Japon (5 jours) → vol aller → hôtel → 3 activités avec trajets → conflit signalé puis corrigé → checklist 3 cochés → contact → roadbook → lien partagé ouvert sans connexion → supprimer le voyage → le lien affiche « Ce roadbook n'est plus partagé. ».
  - `offline.spec.ts` : ouvrir un voyage, `context.setOffline(true)`, recharger → voyage et roadbook visibles, bandeau « Hors ligne — consultation seulement », boutons de modification désactivés.
- [ ] **Step 2 :** `npm run test:e2e` → PASS (corriger ce qui échoue dans la tâche propriétaire du code).
- [ ] **Step 3 :** Rédiger `docs/MISE-EN-PLACE.md` en français, pas à pas : créer le projet Supabase ; appliquer les migrations (`supabase db push`) ; activer l'e-mail OTP et ajouter l'URL GitHub Pages aux URL de redirection ; créer la clé OpenRouteService ; l'enregistrer **soi-même** avec `supabase secrets set ORS_API_KEY=…` (ne jamais la coller dans une conversation ni la committer) ; déployer la fonction (`supabase functions deploy routes`) ; créer le dépôt GitHub, renseigner les variables `VITE_DATA=supabase`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, activer Pages (source : GitHub Actions) ; installer l'appli sur Mac (Safari → Fichier → Ajouter au Dock) et sur iPhone (Partager → Sur l'écran d'accueil) ; checklist de test manuel (synchro Mac ↔ iPhone, export PDF dans Fichiers, lien partagé ouvert sur un autre téléphone).
- [ ] **Step 4 :** `npm test && npm run test:e2e && npm run build` → tout PASS.
- [ ] **Step 5 : Commit** `test: parcours complet, hors ligne ; docs: guide de mise en place`
