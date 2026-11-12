# Meilleure période et saisie des dates — plan de développement

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** afficher la meilleure période pour partir (texte + comparaison avec les dates du voyage) pour aider à choisir la destination, et pré-remplir la date de retour quand on choisit le départ.

**Architecture:** un champ facultatif `bestPeriod` rejoint le protocole v1 (idées et `trip` de l'itinéraire) ; `validate.ts` le contrôle, `promptBuilder.ts` le demande, un module pur `period.ts` compare les mois aux dates, un composant `PeriodBadge` l'affiche (cartes d'idées et écran de contrôle). Rien n'est enregistré dans le voyage ni la base. Les dates utilisent une fonction pure `syncEndDate` partagée par le questionnaire et `TripForm`.

**Tech Stack:** celle de l'étape 3 (React, TypeScript, Vitest, Playwright), luxon pour les mois.

**Spec:** `docs/superpowers/specs/2026-11-12-periode-et-dates-design.md` (protocole : `docs/superpowers/specs/2026-11-12-carnet-de-route-etape3-ia-design.md`).

## Global Constraints

- Interface en **français** ; phrase de mise en garde toujours présente : « Information donnée par l'IA : à vérifier ».
- `bestPeriod` : `{ text: string (≤ 500 caractères), goodMonths: number[], avoidMonths: number[] }`, **facultatif** ; mois = entiers de **1 à 12** ; mois invalides ignorés avec avertissement ; réponse sans le champ acceptée (bloc absent).
- Aucune migration, aucune écriture dans le voyage, le roadbook, le partage ni le calendrier.
- Texte collé non fiable : texte brut uniquement (mêmes règles `cleanText` que le reste).
- Dates : le retour se remplit avec la **même date** que le départ si le retour est vide ou antérieur au départ ; jamais d'écrasement d'un retour déjà valide.

## Review Focus

1. Mois invalides (0, 13, 2,5, texte, doublons, listes énormes) : ignorés avec avertissement, jamais d'erreur bloquante — tâche 1.
2. Mois à la fois « conseillé » et « à éviter » : « à éviter » l'emporte — tâche 2.
3. Voyage à cheval sur plusieurs mois ou deux années (ex. 28 déc. → 3 janv.) : tous les mois couverts comptent, pas seulement le mois de départ — tâche 2.
4. Texte `<script>` ou HTML dans la période : affiché comme texte — tâche 3.
5. Départ modifié après avoir saisi un retour valide ; départ vidé ; retour déjà postérieur : jamais d'écrasement — tâche 4.

---

## Structure des fichiers

Créés : `src/ai/period.ts`, `src/ai/period.test.ts`, `src/ui/ai/PeriodBadge.tsx`, `src/ui/ai/PeriodBadge.test.tsx`, `src/domain/dates.test.ts`(ou ajout à `days.test.ts`).
Modifiés : `src/ai/types.ts`, `src/ai/validate.ts`, `src/ai/validate.test.ts`, `src/ai/promptBuilder.ts`, `src/ai/promptBuilder.test.ts`, `src/ai/fixtures.ts`, `src/domain/days.ts`, `src/ui/ai/IdeasPanel.tsx`, `src/ui/ai/ControlPanel.tsx`, `src/ui/ai/QuestionnairePage.tsx`, `src/ui/pages/TripForm.tsx`, `e2e/ai.spec.ts`, `src/ui/app.css`.

---

### Task 1 : `bestPeriod` dans le protocole et la validation

**Files:**
- Modify: `src/ai/types.ts`, `src/ai/validate.ts`, `src/ai/promptBuilder.ts`, `src/ai/fixtures.ts`
- Test: `src/ai/validate.test.ts`, `src/ai/promptBuilder.test.ts`

**Interfaces:**
- Produces (`types.ts`) : `BestPeriod { text: string; goodMonths: number[]; avoidMonths: number[] }` ; `Idea.bestPeriod: BestPeriod | null` ; `ItineraryResponse.trip.bestPeriod: BestPeriod | null`.
- Produces (`validate.ts`) : `parseBestPeriod(raw: unknown, where: string, warnings: string[]): BestPeriod | null` (interne, utilisé par `validateIdeas` et `validateItinerary`).
- Produces (`promptBuilder.ts`) : les formats d'idées et d'itinéraire contiennent `"bestPeriod": { "text": "…", "goodMonths": [11, 12, 1, 2], "avoidMonths": [3, 4] }` et une consigne « mois de 1 à 12 ».

- [ ] **Step 1 : tests qui échouent**
  - `validateIdeas` : idée avec `bestPeriod: { text: 'Novembre à février', goodMonths: [11,12,1,2], avoidMonths: [3,4] }` → conservée à l'identique ; idée **sans** le champ → `bestPeriod === null` et aucun avertissement.
  - Mois invalides : `goodMonths: [0, 13, 2.5, '5', 11, 11]` → `[11]` (invalides retirés, doublon retiré) et un avertissement contenant `bestPeriod`.
  - `goodMonths` de 100 éléments → tronqué à 12 distincts ; `text` de 600 caractères → 500 avec `…` ; `bestPeriod: 'texte'` (pas un objet) → `null` avec avertissement ; `text` vide et mois vides → `null`.
  - `validateItinerary` : `trip.bestPeriod` valide conservé ; absent → `null`.
  - `buildIdeasPrompt` et `buildItineraryPrompt` contiennent `bestPeriod`, `goodMonths` et `avoidMonths`.
- [ ] **Step 2 :** `npx vitest run src/ai` → FAIL.
- [ ] **Step 3 :** implémenter `parseBestPeriod` (réutilise `cleanText`, filtre `Number.isInteger` entre 1 et 12, ensembles triés sans doublon, ≤ 12) ; l'appeler dans `validateIdeas` (par idée) et `validateItinerary` (champ `trip.bestPeriod`) ; ajouter le champ aux formats du prompt ; ajouter `bestPeriod` aux idées et à `trip` de `fixtures.ts` (ex. Kyoto : mars-mai et octobre-novembre bons, juillet-août à éviter).
- [ ] **Step 4 :** PASS. **Step 5 : commit** `feat(ia): meilleure période dans le protocole`

### Task 2 : comparaison avec les dates (`period.ts`)

**Files:**
- Create: `src/ai/period.ts`
- Test: `src/ai/period.test.ts`

**Interfaces:**
- Consumes: `BestPeriod` (tâche 1).
- Produces: `PeriodFit = 'good' | 'average' | 'avoid'` ; `PeriodAssessment { fit: PeriodFit; months: number[]; label: string }` ; `assessPeriod(period: BestPeriod, input: { startDate: string; endDate: string }): PeriodAssessment | null` (`null` si les dates sont invalides ou si la période n'a aucun mois). `months` = mois (1 à 12) couverts par le voyage, du départ au retour.

Règles : un mois de `avoidMonths` couvert → `avoid` (l'emporte sur tout) ; sinon tous les mois couverts dans `goodMonths` → `good` ; sinon `average`. Libellés : « Tes dates tombent en bonne période. » / « Période intermédiaire pour tes dates. » / « Tes dates tombent dans une période à éviter. ».

- [ ] **Step 1 : tests qui échouent** (période Cambodge : good `[11,12,1,2]`, avoid `[3,4]`)
  - 20 → 24 déc. 2026 → `good`, `months` `[12]`.
  - 28 déc. 2026 → 3 janv. 2027 → `good`, `months` `[12, 1]` (deux années).
  - 28 fév. → 2 mars → `avoid` (février bon, mars à éviter : « à éviter » l'emporte).
  - 10 → 12 oct. → `average` (aucun mois dans les deux listes).
  - 30 oct. → 2 nov. → `average` (octobre ni bon ni évité, novembre bon).
  - Mois à la fois bon et évité (`good [5]`, `avoid [5]`) → `avoid`.
  - Voyage de plus de 12 mois (1er janv. 2027 → 1er mars 2028) → tous les mois, sans boucle infinie ; `avoid` si un mois évité existe.
  - Dates invalides (`''`, `'abc'`) ou retour avant départ → `null` ; période sans mois → `null`.
- [ ] **Step 2 :** FAIL. **Step 3 :** implémenter avec `luxon` (parcours mensuel plafonné à 13 pas). **Step 4 :** PASS. **Step 5 : commit** `feat(ia): comparaison de la période avec les dates`

### Task 3 : affichage (`PeriodBadge`) sur les idées et l'écran de contrôle

**Files:**
- Create: `src/ui/ai/PeriodBadge.tsx`
- Modify: `src/ui/ai/IdeasPanel.tsx`, `src/ui/ai/ControlPanel.tsx`, `src/ui/app.css`
- Test: `src/ui/ai/PeriodBadge.test.tsx`, `src/ui/ai/IdeasPanel.test.tsx`, `src/ui/ai/ControlPanel.test.tsx`

**Interfaces:**
- Consumes: `assessPeriod`, `BestPeriod`.
- Produces: `PeriodBadge(props: { period: BestPeriod | null; startDate: string; endDate: string })` : ne rend rien si `period` est `null` ; sinon « Meilleure période », le texte, la phrase de `assessPeriod` (classe `period-good` / `period-average` / `period-avoid`, orange pour `avoid`) et « Information donnée par l'IA : à vérifier ».

- [ ] **Step 1 : tests qui échouent**
  - `PeriodBadge` : `null` → rien dans le DOM ; bonne / intermédiaire / à éviter → phrase et classe correspondantes ; mention « Information donnée par l'IA : à vérifier » toujours présente.
  - Texte piégé : `text: '<img src=x onerror=alert(1)>'` → aucun élément `img`, texte visible tel quel.
  - `IdeasPanel` : une idée avec `bestPeriod` affiche son texte et la phrase ; une idée sans `bestPeriod` n'affiche pas « Meilleure période ».
  - `ControlPanel` : avec `itinerary.trip.bestPeriod` affiche le bloc avant le bouton « Créer le voyage » ; sans, rien.
- [ ] **Step 2 :** FAIL. **Step 3 :** implémenter `PeriodBadge` et l'insérer dans la carte d'idée (sous le visa) et dans `ControlPanel` (avant le bouton) ; styles dans `app.css` dans le style de `.visa-badge`. **Step 4 :** PASS. **Step 5 : commit** `feat(ia): affichage de la meilleure période`

### Task 4 : date de retour pré-remplie

**Files:**
- Modify: `src/domain/days.ts`, `src/ui/ai/QuestionnairePage.tsx`, `src/ui/pages/TripForm.tsx`
- Test: `src/domain/days.test.ts`, `src/ui/ai/QuestionnairePage.test.tsx`, `src/ui/pages/TripsPage.test.tsx`

**Interfaces:**
- Produces (`days.ts`) : `syncEndDate(start: string, end: string): string` — renvoie `start` si `end` est vide ou strictement antérieur à `start` (dates `AAAA-MM-JJ` valides) ; sinon renvoie `end` inchangé ; si `start` est vide ou invalide, renvoie `end`.

- [ ] **Step 1 : tests qui échouent**
  - `syncEndDate('2026-12-20', '')` → `'2026-12-20'` ; `('2026-12-20', '2026-12-10')` → `'2026-12-20'` ; `('2026-12-20', '2026-12-24')` → `'2026-12-24'` ; `('2026-12-20', '2026-12-20')` → inchangé ; `('', '2026-12-24')` → `'2026-12-24'` ; `('abc', '')` → `''`.
  - Questionnaire : saisir le départ `2026-12-20` → « Date de retour » vaut `2026-12-20` ; saisir ensuite un retour `2026-12-24`, puis changer le départ en `2026-12-18` → retour reste `2026-12-24` ; changer le départ en `2026-12-28` → retour devient `2026-12-28`.
  - `TripForm` (via `TripsPage`) : mêmes comportements sur « Date de départ » / « Date de retour ».
- [ ] **Step 2 :** FAIL. **Step 3 :** implémenter `syncEndDate` ; l'appeler dans les gestionnaires `onChange` du départ du questionnaire et de `TripForm`. **Step 4 :** PASS. **Step 5 : commit** `feat: la date de retour suit la date de départ`

### Task 5 : parcours de bout en bout et vérification finale

**Files:**
- Modify: `e2e/ai.spec.ts`
- Test: `e2e/ai.spec.ts`

- [ ] **Step 1 : tests** — dans le parcours « Surprends-moi » : les cartes d'idées affichent « Meilleure période » et une phrase de comparaison (dates de 2030 : mois de mars) ; dans le parcours « Je sais où aller » : le bloc apparaît sur l'écran de contrôle ; dans le questionnaire : après `fill` du départ, le champ « Date de retour » est déjà rempli avec la même date (retirer le `fill` redondant si besoin, sans changer les dates utilisées).
- [ ] **Step 2 :** `npm test`, `npm run test:db`, `npm run test:e2e`, `npm run build` → tout passe.
- [ ] **Step 3 : commit** `test: parcours meilleure période et dates`
