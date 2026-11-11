# Carnet de route — Étape 2 : le budget — plan de développement

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Objectif :** un onglet Budget par voyage : enveloppe facultative, lignes prévues avec modes de calcul, dépenses réelles multi-devises, partage des frais entre voyageurs, alertes et pistes d'économie calculées.

**Architecture :** calculs purs dans `src/domain/budget/` (testés seuls) ; données budget derrière de nouvelles méthodes de `TripRepository` (mémoire et Supabase, une seule suite de contrat) et **hors de `TripBundle`** pour qu'elles ne puissent pas fuiter vers le roadbook, le partage ou le calendrier ; taux de change derrière `FxService` (Frankfurter, ou factice pour les tests) ; `budgetService` orchestre ; l'interface vit dans `src/ui/budget/`.

**Stack :** celle de l'étape 1 (Vite, React, TypeScript, Supabase, Vitest, Playwright), sans nouvelle dépendance.

**Spec :** `docs/superpowers/specs/2026-11-11-carnet-de-route-etape2-budget-design.md` (comprendre aussi l'étape 1 : `…etape1-design.md` et son plan).

## Global Constraints

- Interface en **français** ; montants affichés `1 234,56 €` (`Intl.NumberFormat('fr-FR', {style:'currency', currency})`).
- Devise de référence : **EUR**, fixe. Tous les calculs en **centimes entiers**.
- Catégories (8) : `flight` Vols, `lodging` Hébergement, `local_transport` Transports sur place, `food` Repas, `activity` Activités, `shopping` Achats, `contingency` Imprévus, `other` Autre.
- Modes de ligne (4) : `fixed`, `per_person` (× n), `per_day` (× j), `per_person_per_day` (× n × j) ; `j` = nombre de jours du voyage, dates incluses.
- Marge de change : défaut **3 %**, plage **0 à 20**, appliquée aux **prévisions** en devise étrangère seulement, jamais aux dépenses réelles.
- Taux : `rateToEur` = valeur d'**une unité** de la devise en euros. Rafraîchissement d'une ligne prévue si plus de **24 h** et `rateManual` faux. Dépense réelle : taux **figé** au jour de la dépense.
- Montant saisi : maximum **2 décimales**, virgule ou point acceptés, espaces ignorés ; négatif refusé ; dépense > 0.
- Projection = Σ `max(prévu, réel rattaché)` par ligne ou réservation + dépenses non rattachées. Alertes : orange `projection > enveloppe`, rouge `réel > enveloppe`, orange par élément `réel > prévu` ; **aucune alerte sans enveloppe**. Égalité = pas d'alerte.
- Le budget n'apparaît **ni dans `get_shared_roadbook`, ni dans `get_calendar_bundle`, ni dans le roadbook** (propriétaire compris). Aucun déclencheur `touch_trip` sur les tables budget (la date « mis à jour le » du partage ne doit pas trahir l'activité budget).
- Hors ligne : consultation seulement (`OfflineError` pour toute écriture, comme l'étape 1).
- Voyageurs : au moins **un** ; suppression refusée s'il est payeur ou concerné.
- Messages d'erreur d'enregistrement : « Enregistrement impossible. » + « Réessayer » (`useSave` de l'étape 1, avec des fonctions `() => Promise`, pas des promesses déjà créées).

## Review Focus

1. **Fuite via la fiche du voyage** : `trips.budget_cap`, `budget_cap_mode`, `fx_margin_pct` sont dans `to_jsonb(trip)` que reprennent le partage et le calendrier. Attendu : jamais visibles hors du propriétaire — tests tâches 5 et 6.
2. **Saisie à la française** : « 40,5 », « 1 200,50 », « 12,345 », « -3 », vide, texte. Attendu : acceptés ou refusés avec message, jamais NaN ni 0 silencieux — tâche 1 et tâche 11.
3. **Zéro ou un seul voyageur** : division par `n`. Attendu : pas de division par zéro, coût par personne `null` à 0 voyageur, interface qui impose au moins un voyageur — tâches 2, 5 et 9.
4. **Devise sans taux** (service indisponible, devise inconnue, réservation en devise sans taux connu). Attendu : jamais converti en 0 € en silence ; élément marqué « taux manquant » ; dépense refusée sans taux — tâches 1, 7 et 11.
5. **Suppressions en cascade et soldes** : ligne ou réservation supprimée → dépenses conservées « hors prévu » ; voyageur payeur supprimé → refusé ; 1 centime partagé entre 3 personnes → somme des soldes nulle — tâches 3 et 5.

---

## Structure des fichiers

```
src/domain/budget/   types.ts  money.ts  planned.ts  projection.ts  settlement.ts  advice.ts  (+ *.test.ts)
src/fx/              FxService.ts  frankfurterFx.ts  fakeFx.ts  (+ tests)
src/services/        budgetService.ts (+ test)
src/ui/budget/       BudgetTab.tsx  useBudget.ts  labels.ts  TravelersSetup.tsx  SettingsPanel.tsx
                     LinesPanel.tsx  ExpenseForm.tsx  ExpensesList.tsx  SummaryPanel.tsx  AdvicePanel.tsx  SettlementPanel.tsx
supabase/migrations/ 0005_budget.sql      supabase/tests/budget.sql
```
Modifiés : `src/domain/types.ts` (Trip), `src/domain/roadbook.ts`, `src/data/*` (interface, mémoire, Supabase, contrat, mapping), `src/services/tripService.ts` (duplication), `src/app/AppContext.tsx` et `config.ts` (FxService), `src/ui/pages/TripPage.tsx` (onglet), `scripts/test-db.sh`, `playwright.config.ts`, `docs/MISE-EN-PLACE.md`.

---

### Task 1 : types, argent et montant prévu

**Files :**
- Create : `src/domain/budget/types.ts`, `money.ts`, `planned.ts`
- Modify : `src/domain/types.ts` (ajout au `Trip`)
- Test : `src/domain/budget/money.test.ts`, `planned.test.ts`

**Interfaces :**
- Produces (`types.ts`) :
  - `BudgetCategory`, `LineMode` (valeurs des Global Constraints) ; `CapMode = 'total' | 'per_person'`.
  - `Traveler { id; tripId; name; position }`
  - `BudgetLine { id; tripId; category; label; amount: number; currency: string; mode: LineMode; position: number; rateToEur: number; rateManual: boolean; rateDate: string }`
  - `Expense { id; tripId; date: string; category; label; amount: number; currency: string; rateToEur: number; rateManual: boolean; paidBy: string; participantIds: string[]; lineId: string | null; reservationId: string | null }`
  - `BudgetData { travelers: Traveler[]; lines: BudgetLine[]; expenses: Expense[] }` ; `BudgetSettings { cap: number | null; capMode: CapMode; fxMarginPct: number }`
  - `Trip` reçoit trois champs **optionnels** : `budgetCap?: number | null`, `budgetCapMode?: CapMode`, `fxMarginPct?: number` ; `settingsOf(trip: Trip): BudgetSettings` (défauts `null`, `'total'`, `3`).
- Produces (`money.ts`) : `toCents(amount: number): number` ; `parseAmount(input: string): number | null` ; `convertToEurCents(amount: number, rateToEur: number): number` ; `effectiveRate(currency: string, rateToEur: number, marginPct: number): number` ; `formatEur(cents: number): string`.
- Produces (`planned.ts`) : `tripDays(trip: Pick<Trip,'startDate'|'endDate'>): number` ; `PlannedItem { key: string /* ligne.id ou 'res:'+id */; source: 'line' | 'reservation'; category: BudgetCategory; label: string; currency: string; plannedCents: number; baseCents: number /* sans marge */; missingRate: boolean }` ; `plannedItems(input: { lines: BudgetLine[]; reservations: Reservation[]; travelers: number; days: number; marginPct: number; reservationRates: Record<string, number> }): PlannedItem[]` ; `reservationCategory(type: ReservationType): BudgetCategory`.

- [ ] **Step 1 : tests qui échouent**
  - `parseAmount` : `'40,5'`→40.5 ; `'1 200,50'`→1200.5 ; `'1200.5'`→1200.5 ; `'0'`→0 ; `'12,345'`, `'-3'`, `''`, `'abc'` → `null`.
  - `toCents(19.99)` = 1999 ; `toCents(0.1 + 0.2)` = 30. `convertToEurCents(10000, 0.0061)` = 6100.
  - `effectiveRate('EUR', 1, 3)` = 1 ; `effectiveRate('JPY', 0.0061, 3)` ≈ 0.006283. `formatEur(123456)` = `'1 234,56 €'` (espaces insécables acceptés).
  - `tripDays` : 2026-12-01 → 2026-12-05 = 5.
  - `plannedItems` avec n=4, j=5, marge 3 : ligne EUR `fixed` 120 → 12000 ; EUR `per_person` 50 → 20000 ; EUR `per_day` 30 → 15000 ; JPY `per_person_per_day` 5000 à 0,0061 → **62830** (`baseCents` 61000) ; réservation vol 800 EUR → clé `res:R1`, catégorie `flight`, 80000 ; réservation 100 USD avec `reservationRates {USD: 0.92}` → **9476** ; réservation en CAD sans taux → `plannedCents` 0 et `missingRate` vrai ; réservation sans prix → aucun élément ; n = 0 → les lignes `per_person` valent 0 (pas d'erreur).
  - `reservationCategory` : flight→flight, lodging→lodging, train et car_rental→local_transport, activity→activity, other→other.
- [ ] **Step 2 :** `npx vitest run src/domain/budget` → FAIL.
- [ ] **Step 3 :** implémenter (arrondi `Math.round` au centime ; la marge ne s'applique pas à l'EUR).
- [ ] **Step 4 :** → PASS. **Step 5 : commit** `feat(budget): types, argent et montants prévus`

### Task 2 : projection, alertes et totaux

**Files :**
- Create : `src/domain/budget/projection.ts`
- Test : `src/domain/budget/projection.test.ts`

**Interfaces :**
- Consumes : tâche 1.
- Produces :
  - `BudgetAlert = { type: 'projection_over_cap'; overCents: number } | { type: 'actual_over_cap'; overCents: number } | { type: 'item_over'; key: string; overCents: number }`
  - `ItemStatus { key: string; plannedCents: number; actualCents: number; missingRate: boolean }`
  - `BudgetSummary { plannedCents: number; projectionCents: number; actualCents: number; capCents: number | null; perPersonProjectionCents: number | null; alerts: BudgetAlert[]; items: ItemStatus[]; unattachedCents: number; byCategory: Record<BudgetCategory, { plannedCents: number; actualCents: number }> }`
  - `expenseCents(e: Expense): number` ; `computeBudget(input: { items: PlannedItem[]; expenses: Expense[]; settings: BudgetSettings; travelers: number }): BudgetSummary`. Une dépense est rattachée à `lineId` ou à `'res:' + reservationId`.

- [ ] **Step 1 : tests qui échouent** (L1 prévu 10000, L2 prévu 5000)
  - Dépenses rattachées à L1 : 12000 au total ; dépense non rattachée : 3000 → `projectionCents` 20000, `actualCents` 15000, `plannedCents` 15000, `unattachedCents` 3000.
  - Enveloppe 18000 en `total` → alerte `projection_over_cap` de 2000, pas d'alerte `actual_over_cap` (15000 < 18000).
  - Enveloppe `per_person` 5000 avec 4 voyageurs → `capCents` 20000, projection 20000 → **aucune alerte** (égalité).
  - `item_over` pour L1 (12000 > 10000, 2000) quand une enveloppe existe ; **sans enveloppe → `alerts` vide**.
  - Même éléments, dépenses rattachées à L1 de 20000 et non rattachées de 5000 (réel total 25000) avec enveloppe 18000 → `actual_over_cap` de 7000.
  - `travelers` = 0 → `perPersonProjectionCents` `null`, et en `per_person` `capCents` 0 sans exception ; 4 voyageurs, projection 20000 → 5000.
  - `expenseCents` d'une dépense 10000 JPY au taux 0,0061 = 6100 ; `byCategory` additionne prévu et réel par catégorie.
  - Un élément `missingRate` n'est pas comptabilisé à 0 sans être signalé : `items[].missingRate` est conservé.
- [ ] **Step 2 :** FAIL. **Step 3 :** implémenter. **Step 4 :** PASS. **Step 5 : commit** `feat(budget): projection et alertes`

### Task 3 : parts, soldes et virements

**Files :**
- Create : `src/domain/budget/settlement.ts`
- Test : `src/domain/budget/settlement.test.ts`

**Interfaces :**
- Produces : `shares(totalCents: number, participantIds: string[]): Map<string, number>` (ordre = ordre fourni) ; `balances(expenses: Expense[], order: string[]): Map<string, number>` (positif = on lui doit) ; `Transfer { from: string; to: string; cents: number }` ; `transfers(balances: Map<string, number>, order: string[]): Transfer[]` ; `actualPerTraveler(expenses: Expense[], order: string[]): Map<string, number>` (somme des parts).

- [ ] **Step 1 : tests qui échouent**
  - `shares(1000, [a,b,c])` → a 334, b 333, c 333 ; `shares(1, [a,b,c])` → a 1, b 0, c 0 ; somme toujours égale au total (boucle sur 1 à 50 centimes et 1 à 7 personnes).
  - Dépense 3000 payée par A partagée par A, B, C → soldes A +2000, B −1000, C −1000 ; somme = 0.
  - Dépense 900 payée par B partagée par A et B ajoutée → somme toujours 0.
  - `transfers({A:+2000,B:−1000,C:−1000})` → `[{B→A,1000},{C→A,1000}]` ; `{A:500,B:300,C:−800}` → `[{C→A,500},{C→B,300}]` ; soldes nuls → `[]`.
  - `actualPerTraveler` : la dépense de 1000 entre 3 personnes donne 334, 333, 333.
- [ ] **Step 2 :** FAIL. **Step 3 :** implémenter (rapprocher le plus gros créditeur du plus gros débiteur ; égalités par ordre des voyageurs). **Step 4 :** PASS. **Step 5 : commit** `feat(budget): parts, soldes et virements`

### Task 4 : conseils d'économie

**Files :**
- Create : `src/domain/budget/advice.ts`
- Test : `src/domain/budget/advice.test.ts`

**Interfaces :**
- Consumes : `PlannedItem`, `BudgetLine`, `BudgetSummary`, `Expense`.
- Produces : `Advice = { kind: 'proportional'; savingCents: number; suffices: boolean; changes: { lineId: string; newAmount: number }[] } | { kind: 'drop_largest'; savingCents: number; suffices: boolean; lineId: string } | { kind: 'reduce_margin'; savingCents: number; suffices: boolean; newMarginPct: 1 }` ; `computeAdvice(input: { summary: BudgetSummary; items: PlannedItem[]; lines: BudgetLine[]; settings: BudgetSettings; travelers: number; days: number }): Advice[]`.

Règles : `D = projection − cap` ; sans enveloppe ou `D ≤ 0` → `[]`. Seules les **lignes stockées** sont réductibles, sur leur `reste = max(0, prévu − réel rattaché)`. Proportionnelle : `f = 1 − D / Σ reste` ; nouveau montant unitaire = `amount × (prévu' / prévu)` **arrondi à la baisse au centime** ; proposée seulement si `Σ reste ≥ D`. Retrait : la ligne de plus grand `reste`, montant 0. Marge : économie `= Σ baseCents des éléments en devise étrangère × (marge − 1) / 100`, seulement si marge > 1 et s'il existe de tels éléments.

- [ ] **Step 1 : tests qui échouent** (n=2, j=2, enveloppe 20000 `total`)
  - L1 `food` `per_person_per_day` 20 EUR (8000) ; L2 `activity` `fixed` 60 EUR (6000) ; réservation hôtel 100 EUR (10000, non réductible) ; D = 4000.
  - Proportionnelle : L1 → 14,28 et L2 → 42,85 (nouveau montant unitaire) ; `savingCents` 4003 ≥ 4000 → `suffices` vrai.
  - Retrait : L1 (8000 > 6000) ; `savingCents` 8000, `suffices` vrai.
  - Pas de piste « marge » (aucun montant en devise étrangère).
  - Avec une dépense de 5000 rattachée à L2 (prévu 6000) : D reste 4000, `reste` de L1 = 8000 et de L2 = 1000 ; proportionnelle : L1 → **11,11**, L2 → **55,55**, `savingCents` **4001**, `suffices` vrai ; le retrait vise L1 (8000).
  - Enveloppe 8000 (D = 16000 > Σ reste = 14000, sans dépense) : **pas** de piste proportionnelle ; retrait de L1, `savingCents` 8000, `suffices` **faux**.
  - Marge : élément 100 USD au taux 0,92 (`baseCents` 9200), marge 3 → `reduce_margin` économie **184** ; avec D = 500 → `suffices` faux.
  - Pas d'enveloppe, ou projection ≤ enveloppe → `[]`.
- [ ] **Step 2 :** FAIL. **Step 3 :** implémenter. **Step 4 :** PASS. **Step 5 : commit** `feat(budget): conseils d'économie`

### Task 5 : données budget dans les dépôts, sans fuite

**Files :**
- Modify : `src/data/TripRepository.ts`, `memoryRepository.ts`, `repositoryContract.ts`, `src/domain/roadbook.ts`
- Test : `src/data/memoryRepository.test.ts` (contrat), `src/domain/roadbook.test.ts`

**Interfaces :**
- Consumes : tâche 1.
- Produces (interface `TripRepository`, en plus de l'existant) :
  - `getBudget(tripId: string): Promise<BudgetData>`
  - `saveTraveler(t: Traveler | New<Traveler>): Promise<Traveler>` ; `deleteTraveler(id: string): Promise<void>`
  - `saveBudgetLine(l: BudgetLine | New<BudgetLine>): Promise<BudgetLine>` ; `deleteBudgetLine(id: string): Promise<void>`
  - `saveExpense(e: Expense | New<Expense>): Promise<Expense>` ; `deleteExpense(id: string): Promise<void>`
  - `updateBudgetSettings(tripId: string, s: BudgetSettings): Promise<Trip>`
  - `class BudgetError extends Error { code: 'TRAVELER_IN_USE' | 'LAST_TRAVELER' | 'NO_PARTICIPANT' | 'BOTH_LINKS' }`
- Comportement : `deleteTrip` supprime aussi voyageurs, lignes et dépenses ; `deleteBudgetLine` et `deleteReservation` mettent `lineId` / `reservationId` des dépenses à `null` ; `deleteTraveler` lève `TRAVELER_IN_USE` si payeur ou concerné, `LAST_TRAVELER` si c'est le dernier ; `saveExpense` lève `NO_PARTICIPANT` si `participantIds` est vide et `BOTH_LINKS` si les deux rattachements sont renseignés.
- `getSharedRoadbook` (mémoire) et `buildRoadbook` ne renvoient **aucun** des champs `budgetCap`, `budgetCapMode`, `fxMarginPct` dans `trip`.

- [ ] **Step 1 : tests qui échouent** (suite de contrat, pour la mémoire et plus tard Supabase)
  - Créer un voyage, deux voyageurs, une ligne, une dépense ; `getBudget` les renvoie ; `updateBudgetSettings(id, {cap: 3000, capMode:'per_person', fxMarginPct: 5})` met à jour `getBundle(id).trip`.
  - `deleteTrip` puis `getBudget` → vide (ou `NotFoundError`).
  - Dépense rattachée à une ligne ; `deleteBudgetLine` → dépense conservée, `lineId` `null`. Idem avec `deleteReservation`.
  - `deleteTraveler` d'un payeur → `TRAVELER_IN_USE` ; du dernier voyageur → `LAST_TRAVELER` ; `saveExpense` sans participant → `NO_PARTICIPANT` ; avec `lineId` et `reservationId` → `BOTH_LINKS`.
  - **Fuite** : après `updateBudgetSettings`, `JSON.stringify(await repo.getSharedRoadbook(token))` ne contient ni `budgetCap` ni `fxMarginPct` ; `JSON.stringify(buildRoadbook(bundle, {hideSensitive: false}))` non plus.
- [ ] **Step 2 :** FAIL. **Step 3 :** implémenter (mémoire ; `stripSensitive` et `buildRoadbook` retirent les trois champs du `trip`). **Step 4 :** PASS. **Step 5 : commit** `feat(budget): données budget dans les dépôts, sans fuite`

### Task 6 : migration SQL, sécurité et dépôt Supabase

**Files :**
- Create : `supabase/migrations/0005_budget.sql`, `supabase/tests/budget.sql`
- Modify : `src/data/supabaseRepository.ts`, `supabaseMapping.ts`, `scripts/test-db.sh` (ajouter `budget.sql`)
- Test : `supabase/tests/budget.sql`, `src/data/supabaseMapping.test.ts`, contrat Supabase (sauté sans `SUPABASE_TEST_URL`)

**Interfaces :**
- Produces (SQL) :
  - colonnes `trips.budget_cap numeric check (>= 0)`, `budget_cap_mode text default 'total'`, `fx_margin_pct numeric default 3 check (0..20)` ;
  - tables `travelers`, `budget_lines`, `expenses` (`line_id` et `reservation_id` en `on delete set null`, au plus un des deux, `paid_by` en `on delete restrict`), `expense_shares` (`traveler_id` en `restrict`) ; RLS « propriétaire » et vérification du parent comme à l'étape 1 ; **pas** de déclencheur `touch_trip` ;
  - `trip_bundle_json` **redéfinie** pour retirer `budget_cap`, `budget_cap_mode` et `fx_margin_pct` de `trip` (utilisée par le partage et le calendrier) ;
  - `get_my_budget(p_trip uuid) returns jsonb` (`security invoker`) : voyageurs, lignes, dépenses avec `participant_ids` ;
  - `save_expense(p_expense jsonb, p_participants uuid[]) returns jsonb` (`security invoker`, atomique, refuse un tableau vide) ;
  - exécution réservée à `authenticated` pour ces deux fonctions.
- Produces (TS) : la version Supabase des méthodes de l'interface de la tâche 5, via `get_my_budget` et `save_expense` (pas de longue liste d'identifiants dans l'URL) ; une violation `restrict` devient `BudgetError('TRAVELER_IN_USE')`.

- [ ] **Step 1 : tests SQL qui échouent** (`budget.sql`, style des tests de l'étape 1)
  - Un autre utilisateur ne voit rien des cinq tables budget ; il ne peut pas rattacher une ligne à un voyage qui n'est pas le sien.
  - `anon` n'a aucun accès aux tables ni aux deux fonctions.
  - **`get_shared_roadbook` et `get_calendar_bundle` ne contiennent aucun `budget_cap`, `fx_margin_pct`, `travelers`, `expenses` ni `budget_lines`**, même quand l'enveloppe est renseignée.
  - Supprimer une ligne ou une réservation conserve la dépense (`line_id` / `reservation_id` à null) ; supprimer un payeur est refusé ; `save_expense` avec zéro participant est refusé.
  - Charger un budget de 300 dépenses en un appel.
- [ ] **Step 2 :** `npm run test:db` → FAIL.
- [ ] **Step 3 :** écrire la migration, les méthodes Supabase et leurs conversions de noms. **Step 4 :** `npm run test:db` → PASS ; `npx vitest run` → PASS. **Step 5 : commit** `feat(budget): base de données, sécurité et dépôt Supabase`

### Task 7 : taux de change

**Files :**
- Create : `src/fx/FxService.ts`, `frankfurterFx.ts`, `fakeFx.ts`
- Modify : `src/app/config.ts`, `src/app/AppContext.tsx`, `playwright.config.ts`
- Test : `src/fx/frankfurterFx.test.ts`, `src/app/config.test.ts`

**Interfaces :**
- Produces :
  - `FxRate { currency: string; rate: number; date: string; stale: boolean }` ; `class FxError extends Error { code: 'UNAVAILABLE' | 'UNSUPPORTED' }`
  - `interface FxService { getRate(currency: string, date?: string): Promise<FxRate>; listCurrencies(): Promise<string[]> }`
  - `createFrankfurterFx(fetchImpl: typeof fetch, store: KeyValueStore): FxService` (`KeyValueStore` de `src/offline/cachedRepository.ts`)
  - `createFakeFx(rates?: Record<string, number>): FxService` (défaut `{JPY: 0.0061, USD: 0.92, GBP: 1.17, CHF: 1.04}`)
  - `getFxMode(env): 'frankfurter' | 'fake'` (`'fake'` si `VITE_FX === 'fake'`) ; `AppValue` gagne `fx: FxService`.
- Comportement : `EUR` → taux 1 sans appel ; sinon `GET https://api.frankfurter.dev/v1/latest?base=<DEV>&symbols=EUR` (ou `/v1/<AAAA-MM-JJ>?…` avec une date) ; réponse `rates.EUR` ; résultat mis en cache sous `fx:<DEV>:<date|latest>` ; échec réseau → copie en cache avec `stale: true`, sinon `FxError('UNAVAILABLE')` ; statut 404 ou 422 → `FxError('UNSUPPORTED')`. **Vérifier ces adresses dans la documentation publique de Frankfurter avant d'écrire le code ; si elle est inaccessible depuis l'environnement, le dire et garder l'adresse de la spec.**

- [ ] **Step 1 : tests qui échouent** (`fetch` simulé)
  - `getRate('EUR')` → `{rate: 1, stale: false}`, aucun appel.
  - `getRate('JPY')` : réponse `{"date":"2026-11-11","rates":{"EUR":0.0061}}` → `{rate: 0.0061, date: '2026-11-11', stale: false}` ; l'URL demandée contient `base=JPY` et `symbols=EUR`.
  - Deuxième appel réseau en échec → même taux avec `stale: true` ; pas de cache et échec → `UNAVAILABLE` ; statut 404 → `UNSUPPORTED`.
  - Avec une date : l'URL contient la date.
  - `getFxMode({VITE_FX:'fake'})` = `'fake'`, `getFxMode({})` = `'frankfurter'`.
- [ ] **Step 2 :** FAIL. **Step 3 :** implémenter ; `playwright.config.ts` construit l'appli avec `VITE_FX=fake`. **Step 4 :** PASS. **Step 5 : commit** `feat(budget): taux de change`

### Task 8 : service budget et duplication

**Files :**
- Create : `src/services/budgetService.ts`
- Modify : `src/services/tripService.ts` (duplication)
- Test : `src/services/budgetService.test.ts`, `src/services/tripService.test.ts`

**Interfaces :**
- Consumes : dépôt (tâche 5), `FxService` (tâche 7), domaine (tâches 1 à 4).
- Produces :
  - `interface BudgetService { ensureTraveler(tripId: string, name: string): Promise<Traveler>; addUsualLines(tripId: string): Promise<BudgetLine[]>; refreshRates(tripId: string): Promise<BudgetLine[]>; reservationRates(reservations: Reservation[]): Promise<{ rates: Record<string, number>; missing: string[] }>; newExpenseRate(currency: string, date: string): Promise<{ rateToEur: number; manual: false } | { error: 'UNAVAILABLE' | 'UNSUPPORTED' }>; applyAdvice(tripId: string, advice: Advice): Promise<void> }` ; `createBudgetService(repo: TripRepository, fx: FxService): BudgetService`.
  - `addUsualLines` crée 4 lignes à 0 EUR : `food` `per_person_per_day`, `local_transport` `per_person_per_day`, `activity` `per_person`, `contingency` `fixed`.
  - `refreshRates` met à jour (taux et `rateDate`) les lignes en devise étrangère, **non manuelles**, de plus de 24 h ; une erreur du service laisse les lignes inchangées.
  - `applyAdvice` : `proportional` modifie les montants, `drop_largest` met la ligne à 0, `reduce_margin` fixe `fxMarginPct` à 1.
  - `tripService.duplicateTrip` copie aussi voyageurs, lignes prévues et enveloppe, **pas les dépenses**.

- [ ] **Step 1 : tests qui échouent** (dépôt mémoire, `createFakeFx`)
  - `addUsualLines` : 4 lignes de catégories et modes attendus, montant 0, devise `EUR`.
  - `refreshRates` : ligne JPY datée de 2 jours avec taux 0,005 → taux 0,0061 et date du jour ; ligne `rateManual` inchangée ; ligne de moins de 24 h inchangée ; service en panne → inchangées.
  - `reservationRates` : réservations en USD et CAD → `rates {USD: 0.92}`, `missing ['CAD']`.
  - `newExpenseRate('JPY', date)` → taux factice ; devise inconnue → `{error: 'UNSUPPORTED'}`.
  - `applyAdvice` pour chaque `kind`, puis les totaux recalculés rentrent dans l'enveloppe quand `suffices` est vrai.
  - `duplicateTrip` : nouveau voyage avec les mêmes voyageurs, lignes et enveloppe, zéro dépense, nouveaux identifiants.
- [ ] **Step 2 :** FAIL. **Step 3 :** implémenter. **Step 4 :** PASS. **Step 5 : commit** `feat(budget): service budget`

### Task 9 : l'onglet Budget, les voyageurs et l'enveloppe

**Files :**
- Create : `src/ui/budget/BudgetTab.tsx`, `useBudget.ts`, `labels.ts`, `TravelersSetup.tsx`, `SettingsPanel.tsx`
- Modify : `src/ui/pages/TripPage.tsx` (onglet `budget`), `src/ui/app.css`
- Test : `src/ui/budget/BudgetTab.test.tsx`

**Interfaces :**
- Consumes : `TripTabProps` (`src/ui/trip/types.ts`), `useApp()` (étendu avec `fx`), `createBudgetService`.
- Produces : `useBudget(bundle: TripBundle): { data: BudgetData | null; summary: BudgetSummary | null; items: PlannedItem[]; missingRates: string[]; reload(): Promise<void>; service: BudgetService }` (calcule `plannedItems` puis `computeBudget` ; appelle `refreshRates` à l'ouverture) ; `CATEGORY_LABELS`, `MODE_LABELS` ; `BudgetTab(props: TripTabProps)`.

Comportement : sans voyageur, `TravelersSetup` demande le nombre et les prénoms (au moins un) avant tout le reste ; `SettingsPanel` : enveloppe (vide = aucune), mode total ou par personne, marge de 0 à 20 ; ajout, renommage et suppression de voyageurs avec les messages d'erreur de la spec (§7) ; boutons désactivés hors ligne.

- [ ] **Step 1 : tests qui échouent**
  - Sans voyageur : le formulaire « Combien êtes-vous ? » est affiché, le reste de l'onglet ne l'est pas ; valider avec deux prénoms les crée.
  - Zéro prénom → « Indique au moins un voyageur. » et rien n'est créé.
  - Enveloppe 3000 par personne et marge 5 enregistrées dans le voyage (puis `reload()` de l'onglet) ; champ vidé → enveloppe `null`.
  - Une ligne « Repas » à 30 € par personne et par jour sur 5 jours : 3 voyageurs → « 450,00 € » ; en ajoutant un voyageur → « 600,00 € » ; en prolongeant le voyage d'un jour → recalcul aussi.
  - Marge 25 → « La marge doit être entre 0 et 20 % » et rien n'est enregistré.
  - Supprimer un voyageur payeur → « Ce voyageur a des dépenses : réaffecte-les d'abord. » ; supprimer le dernier → « Il faut au moins un voyageur. ».
- [ ] **Step 2 :** FAIL. **Step 3 :** implémenter. **Step 4 :** PASS. **Step 5 : commit** `feat(budget): onglet Budget, voyageurs et enveloppe`

### Task 10 : le prévu

**Files :**
- Create : `src/ui/budget/LinesPanel.tsx`
- Modify : `src/ui/budget/BudgetTab.tsx`
- Test : `src/ui/budget/LinesPanel.test.tsx`

**Interfaces :**
- Consumes : `useBudget`, `BudgetService.addUsualLines`, `parseAmount`, `formatEur`, `CATEGORY_LABELS`, `MODE_LABELS`.
- Produces : `LinesPanel(props: { tripId: string; data: BudgetData; items: PlannedItem[]; reservations: Reservation[]; disabled: boolean; onChange(): void })`.

Comportement : lignes regroupées par catégorie avec leur montant prévu en euros ; lignes de réservation avec un badge « réservation », non modifiables ; formulaire (catégorie, libellé, montant, devise, mode de calcul) ; montant refusé selon `parseAmount` ; devise étrangère : taux obtenu par `fx` et modifiable (`rateManual`) ; « Ajouter les postes habituels » ; réservation en devise sans taux : badge « taux manquant » et champ de taux.

- [ ] **Step 1 : tests qui échouent**
  - « Ajouter les postes habituels » crée 4 lignes visibles.
  - Ligne « Repas » 40 EUR en `per_person_per_day` avec 4 voyageurs sur 5 jours → « 800,00 € » affiché.
  - Montant « 40,5 » accepté ; « 12,345 » → « Montant invalide (2 décimales au plus). ».
  - Devise JPY : le taux est rempli ; le modifier met `rateManual` à vrai.
  - Réservation avec prix : ligne avec le badge « réservation », sans bouton Modifier ; réservation en CAD sans taux : badge « taux manquant ».
- [ ] **Step 2 :** FAIL. **Step 3 :** implémenter. **Step 4 :** PASS. **Step 5 : commit** `feat(budget): lignes prévues`

### Task 11 : les dépenses

**Files :**
- Create : `src/ui/budget/ExpenseForm.tsx`, `ExpensesList.tsx`
- Modify : `src/ui/budget/BudgetTab.tsx`
- Test : `src/ui/budget/ExpenseForm.test.tsx`

**Interfaces :**
- Consumes : `useBudget`, `BudgetService.newExpenseRate`, `parseAmount`.
- Produces : `ExpenseForm(props: { tripId: string; data: BudgetData; reservations: Reservation[]; localCurrency: string; initial?: Expense; disabled: boolean; onSave(e: New<Expense> & { id?: string }): void; onCancel(): void })` ; `ExpensesList`.

Comportement : date du jour par défaut (fuseau local), devise locale du voyage par défaut ; payeur obligatoire ; personnes concernées : tous cochés par défaut, au moins une ; rattachement facultatif à une ligne **ou** à une réservation ; le taux s'affiche et se modifie ; **sans taux** (service indisponible ou devise inconnue), l'enregistrement est refusé avec « Impossible d'obtenir le taux : saisis-le à la main. » et le champ de taux apparaît.

- [ ] **Step 1 : tests qui échouent**
  - « 10 000 » ¥ le 2026-12-01 avec le taux factice → « ≈ 61,00 € » ; le taux est enregistré dans la dépense.
  - Montant « 40,5 » accepté ; « -3 », vide, « 12,345 » refusés avec message.
  - Aucune personne concernée → « Choisis au moins une personne concernée. ».
  - Taux indisponible → enregistrement refusé, champ de taux affiché ; après saisie manuelle `0,006` → enregistré avec `rateManual` vrai.
  - Choisir une ligne puis une réservation remplace le rattachement (jamais les deux).
  - Échec d'enregistrement → « Enregistrement impossible. », saisie conservée, « Réessayer » relance vraiment.
- [ ] **Step 2 :** FAIL. **Step 3 :** implémenter. **Step 4 :** PASS. **Step 5 : commit** `feat(budget): dépenses`

### Task 12 : résumé, conseils et soldes

**Files :**
- Create : `src/ui/budget/SummaryPanel.tsx`, `AdvicePanel.tsx`, `SettlementPanel.tsx`
- Modify : `src/ui/budget/BudgetTab.tsx`, `src/ui/app.css`
- Test : `src/ui/budget/SummaryPanel.test.tsx`, `AdvicePanel.test.tsx`, `SettlementPanel.test.tsx`

**Interfaces :**
- Consumes : `BudgetSummary`, `Advice`, `Transfer`, `balances`, `transfers`, `actualPerTraveler`.
- Produces : `SummaryPanel(props: { summary: BudgetSummary; travelers: number })` ; `AdvicePanel(props: { advice: Advice[]; lines: BudgetLine[]; onApply(a: Advice): void; disabled: boolean })` ; `SettlementPanel(props: { data: BudgetData })`.

Comportement : jauge et trois chiffres (prévu, projection, réel) ; messages d'alerte en orange ou rouge, avec le montant du dépassement ; aucun message sans enveloppe ; un bouton « Appliquer » par piste, avec l'économie et « suffit » ou « ne suffit pas » ; soldes : « Marie doit 45,20 € à Paul » et coût par personne.

- [ ] **Step 1 : tests qui échouent**
  - Projection 20000 pour une enveloppe de 18000 → « Tu dépasses l'enveloppe de 20,00 € » (orange) ; sans enveloppe → aucun message ; réel au-delà de l'enveloppe → message rouge.
  - Piste proportionnelle affichée avec « économie 40,03 € » et « suffit » ; clic sur « Appliquer » → `onApply` appelé avec la piste.
  - Soldes : trois voyageurs, une dépense de 30 € payée par Alice et partagée par tous → « Bob doit 10,00 € à Alice » et « Chloé doit 10,00 € à Alice ».
  - Tous les soldes nuls → « Tout est équilibré. ».
- [ ] **Step 2 :** FAIL. **Step 3 :** implémenter. **Step 4 :** PASS. **Step 5 : commit** `feat(budget): résumé, conseils et soldes`

### Task 13 : parcours complet, documentation et vérification finale

**Files :**
- Create : `e2e/budget.spec.ts`
- Modify : `docs/MISE-EN-PLACE.md` (migration 0005 à coller dans le SQL Editor), `README.md`, `supabase/setup-complet.sql` (régénéré depuis les migrations), `.github/workflows/deploy.yml` (rien à changer si `test:db` couvre `budget.sql`)
- Test : `e2e/budget.spec.ts`

- [ ] **Step 1 : test de bout en bout** (mode démo, `VITE_FX=fake`)
  - Créer un voyage « Japon » du 01/12 au 05/12 ; ouvrir **Budget** ; saisir « Alice », « Bob », « Chloé » ; fixer l'enveloppe à 1000 € au total ; « Ajouter les postes habituels » ; mettre « Repas » à 30 € par personne et par jour (450 €) et « Activités » à 200 € par personne (600 €) ; l'alerte orange « Tu dépasses l'enveloppe de 50,00 € » apparaît.
  - Saisir une dépense de 10 000 ¥ payée par Alice pour tous : « ≈ 61,00 € » ; un conseil « proportionnelle » s'affiche ; « Appliquer » → l'alerte disparaît.
  - Soldes (`shares(6100, [Alice, Bob, Chloé])` = 2034, 2033, 2033) : « Bob doit 20,33 € à Alice » et « Chloé doit 20,33 € à Alice ».
  - Après « Appliquer », la projection vaut au plus 1000 € (les montants sont arrondis à la baisse) : l'alerte orange a disparu.
  - Créer un lien de partage et l'ouvrir dans un autre onglet : **aucun mot de budget** (« Budget », « Enveloppe », « 1000 ») n'y figure ; télécharger le `.ics` : il ne contient pas non plus de montant du budget.
- [ ] **Step 2 :** `npm test`, `npm run test:db`, `npm run test:e2e`, `npm run build` → tout PASS.
- [ ] **Step 3 :** régénérer `supabase/setup-complet.sql` à partir des cinq migrations ; compléter `MISE-EN-PLACE.md` (« Pour ajouter le budget à une base existante : coller uniquement `0005_budget.sql` »).
- [ ] **Step 4 : commit** `test: parcours budget ; docs: migration 0005`
