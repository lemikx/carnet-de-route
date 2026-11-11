# Carnet de route — Spécification de l'étape 2 : le budget

Date : 2026-11-11
Statut : en relecture
Suite de : `2026-11-11-carnet-de-route-etape1-design.md` (étape 1, en production)

## 1. Objectif

Un onglet **Budget** par voyage pour **ne pas avoir de mauvaise surprise** : prévoir ce que le voyage va coûter, suivre ce qui est réellement dépensé, comparer à une **enveloppe maximale** facultative, et partager les frais entre les voyageurs.

### Critères de réussite
1. Je fixe une enveloppe, je saisis des lignes prévues, et je vois la **projection**, l'écart avec l'enveloppe et une **alerte** si je la dépasse.
2. Les prix de mes **réservations** entrent automatiquement dans le prévu, sans double saisie.
3. Je saisis une dépense dans une **devise étrangère** ; elle est convertie en euros avec un taux **figé au jour de la dépense** et modifiable.
4. À plusieurs, je vois le **coût par personne** et **qui doit combien à qui** ; le total des soldes est toujours nul.
5. Quand je dépasse l'enveloppe, l'appli propose jusqu'à **trois pistes chiffrées** pour y revenir, sans IA.
6. Le budget n'apparaît **jamais** dans le roadbook partagé ni dans le calendrier.
7. Sans enveloppe, l'onglet reste utilisable : totaux et écarts, sans alerte.

## 2. Ce qui a été décidé (et ce qui est supposé)

**Décidé avec toi**
- Le budget couvre **le prévu et le réel**, toutes catégories.
- Voyage **à plusieurs** ; répartition des frais **avec qui a payé quoi** ; usage « total du groupe seulement » possible.
- Parts **égales par défaut**, **modifiables dépense par dépense**.
- Taux de change **automatique par défaut, modifiable à la main**, avec une **marge de sécurité** facultative sur les prévisions.
- Prévisions par **lignes avec mode de calcul** (fixe, par personne, par jour, par personne et par jour).
- **Enveloppe maximale** facultative, au total ou par personne ; l'appli aide à rester dedans par des pistes chiffrées **calculées** (option A). La recherche de bons plans par l'IA est reportée à l'étape 3.

**Supposé par moi (à corriger si besoin)**
- Devise de référence **fixe : l'euro** ; une seule enveloppe, en euros.
- Huit catégories : vols, hébergement, transports sur place, repas, activités, achats, imprévus, autre.
- Le budget est **absent du roadbook**, y compris du tien (PDF et page dans l'appli) ; il pourra y être ajouté plus tard comme option.
- **Dupliquer un voyage** copie voyageurs, lignes prévues et enveloppe, **pas les dépenses**.
- La marge de sécurité est de **3 %** par défaut (réglable de 0 à 20 %).
- Source des taux : **Frankfurter** (taux de la Banque centrale européenne, gratuit, sans clé). Ses adresses exactes et ses devises gérées sont à vérifier au moment de la construction ; en cas de changement, seule l'implémentation de `FxService` est à adapter.
- Les voyageurs sont de simples **noms** : ils n'ont pas de compte et ne se connectent pas.

## 3. Architecture

Le budget est **isolé du reste** : il n'entre ni dans `TripBundle`, ni dans la fonction de partage, ni dans le calendrier. Cela garantit qu'il ne peut pas fuiter par ces chemins.

```
Onglet Budget (UI)
      │
      ▼
BudgetService ──► TripRepository (méthodes budget, Supabase ou mémoire)
      │
      ├──► domain/budget (calculs purs : conversion, prévu, projection, soldes, alertes, conseils)
      └──► FxService (taux de change)
                ├─ frankfurterFx : appel direct au service gratuit depuis le navigateur
                └─ fakeFx        : taux fixes pour les tests
```

### Modules
- **`src/domain/budget/`** : logique pure, sans réseau.
  `money.ts` (arrondis en centimes, conversion), `planned.ts` (montant prévu d'une ligne), `projection.ts` (totaux, projection, alertes), `settlement.ts` (parts, soldes, virements), `advice.ts` (pistes d'économie).
- **`src/data/`** : méthodes budget ajoutées à `TripRepository` (§4), implémentées en mémoire et sur Supabase, couvertes par la même suite de contrat.
- **`src/fx/`** : `FxService` (interface), `frankfurterFx.ts`, `fakeFx.ts`, cache local des derniers taux.
- **`src/services/budgetService.ts`** : orchestration (voyageurs par défaut, application d'un conseil).
- **`src/ui/budget/`** : l'onglet et ses composants.

## 4. Modèle de données

Toutes les tables ont `id`, `user_id`, `created_at`, `updated_at`, les mêmes règles d'accès (RLS « chacun ne voit que ses lignes ») et la même vérification que l'étape 1 : une ligne ne peut être rattachée qu'à un parent qui appartient au même utilisateur. Suppression d'un voyage = suppression en cascade de tout son budget. Migration : `0005_budget.sql`.

**Colonnes ajoutées à `trips`**
- `budget_cap` (numérique ≥ 0, facultatif) : l'enveloppe, en euros.
- `budget_cap_mode` : `total` | `per_person` (défaut `total`).
- `fx_margin_pct` (numérique, 0 à 20, défaut 3).

**travelers** (voyageurs)
- `trip_id`, `name` (1 à 60 caractères), `position`.

**budget_lines** (lignes prévues)
- `trip_id`, `category`, `label`, `amount` (≥ 0), `currency` (3 lettres), `mode` : `fixed` | `per_person` | `per_day` | `per_person_per_day`, `position`.
- `rate_to_eur` (valeur d'une unité de la devise en euros, > 0), `rate_manual` (booléen), `rate_date`.

**expenses** (dépenses réelles)
- `trip_id`, `date`, `category`, `label`, `amount` (> 0), `currency`, `rate_to_eur` (figé), `rate_manual`, `paid_by` (voyageur, suppression refusée tant qu'il est référencé), `line_id` (facultatif), `reservation_id` (facultatif) ; **au plus un** des deux rattachements.

**expense_shares** (personnes concernées par une dépense)
- `expense_id`, `traveler_id` ; au moins une ligne par dépense ; suppression d'un voyageur refusée tant qu'il y figure.

Les **lignes issues des réservations ne sont pas stockées** : une réservation dont le prix est renseigné produit à la volée une ligne `fixed` (identifiant `res:{id}`), dans la catégorie correspondante (vol → vols ; hébergement → hébergement ; train et location de voiture → transports sur place ; activité → activités ; autre → autre).

**Interface `TripRepository` (ajouts)**
`getBudget(tripId)` → `{ travelers, lines, expenses }` ; `saveTraveler` / `deleteTraveler` ; `saveBudgetLine` / `deleteBudgetLine` ; `saveExpense` (avec ses parts) / `deleteExpense` ; `updateBudgetSettings(tripId, { cap, capMode, fxMarginPct })`.

## 5. Calculs

Tous les montants sont calculés **en centimes entiers** ; l'affichage est arrondi au centime.

**Taux effectif d'une ligne prévue**
- Devise `EUR` : 1.
- Autre devise : `rate_to_eur × (1 + marge / 100)`.
- Les dépenses réelles utilisent leur taux figé, **sans marge**.
- Le taux d'une ligne prévue se rafraîchit à l'ouverture de l'onglet si la ligne a plus de 24 heures et n'est pas `rate_manual`. Le prix d'une réservation utilise le dernier taux connu.

**Montant prévu d'une ligne (en euros)** = `amount × facteur × taux effectif`, avec `n` le nombre de voyageurs et `j` le nombre de jours du voyage (dates incluses) :
| Mode | Facteur |
|---|---|
| `fixed` | 1 |
| `per_person` | n |
| `per_day` | j |
| `per_person_per_day` | n × j |

**Réel d'une dépense** = `arrondi(amount × rate_to_eur)`.

**Projection** : pour chaque ligne (ou réservation) à laquelle des dépenses sont rattachées, on retient `max(prévu, réel rattaché)` ; on ajoute les lignes sans dépense à leur prévu, et les dépenses **hors prévu** à leur réel.
`projection = Σ max(prévu, réel) par ligne + Σ dépenses non rattachées`.

**Enveloppe** : `cap_total = cap` en mode `total`, `cap × n` en mode `per_person`.

**Alertes** (sans enveloppe : aucune)
- Orange : `projection > cap_total`.
- Rouge : `réel total > cap_total`.
- Orange sur une ligne : `réel rattaché > prévu`.

**Coût par personne**
- Prévu et projection : `projection / n`.
- Réel : somme des parts de chaque voyageur (§ ci-dessous).

**Parts et soldes**
Pour une dépense de `E` centimes partagée entre `k` personnes : chaque part vaut `⌊E / k⌋`, et le reste `E − k×⌊E/k⌋` est distribué à raison de **1 centime** aux premières personnes, dans l'ordre des voyageurs. Le payeur est crédité de `E`, chaque personne concernée est débitée de sa part ; la somme des soldes est **toujours 0**. Les virements sont calculés en rapprochant le plus gros créditeur du plus gros débiteur, à égalité selon l'ordre des voyageurs, ce qui donne un résultat **déterministe**.

**Conseils d'économie** (si `projection > cap_total`, avec `D = projection − cap_total`)
Ils ne portent que sur la part **non engagée** : pour chaque ligne **stockée** (pas une réservation), `reste = max(0, prévu − réel rattaché)`.
1. **Baisse proportionnelle** : chaque ligne stockée voit son montant unitaire réduit dans le rapport `(réel + reste × f) / (réel + reste)` avec `f = 1 − D / Σ reste`, arrondi au centime **à la baisse** pour que l'économie atteigne `D`. Proposée seulement si `Σ reste ≥ D`.
2. **Retirer le poste le plus coûteux** : la ligne stockée au plus grand `reste`, mise à 0. Indique si cela suffit.
3. **Réduire la marge de sécurité** à 1 % : économie = `Σ (montant de base des lignes et réservations en devise étrangère) × (marge − 1) / 100`. Proposée seulement si la marge dépasse 1 % et s'il existe des montants en devise étrangère.

Chaque piste affiche l'**économie** en euros et si elle **suffit** à revenir dans l'enveloppe. « Appliquer » modifie les lignes ou la marge concernées ; le résultat est recalculé aussitôt.

## 6. Écrans

**Onglet « Budget »**, à côté de Checklist, Réservations et Contacts.
- **Enveloppe** : montant, au total ou par personne, et marge de sécurité. Champ vide = pas d'enveloppe.
- **Résumé** : prévu, projection, réel ; jauge colorée ; alertes ; conseils avec un bouton « Appliquer » par piste.
- **Voyageurs** : à la première ouverture, l'appli demande les prénoms (au moins une personne). Ajout, renommage, suppression.
- **Prévu** : lignes par catégorie ; lignes de réservation repérées par un badge, non modifiables ici ; bouton « Ajouter les postes habituels » (repas, transports sur place, activités, imprévus, montants à remplir).
- **Dépenses** : formulaire (date du jour par défaut, montant, devise locale par défaut, catégorie, libellé, payeur, personnes concernées = tous par défaut, rattachement facultatif à une ligne ou à une réservation), taux affiché et modifiable ; liste des dépenses.
- **Soldes** : « Marie doit 45,20 € à Paul », coût par personne.

**Hors ligne** : consultation seulement, comme le reste de l'appli. Les derniers taux connus restent utilisables pour l'affichage.

## 7. Gestion des erreurs

| Situation | Comportement |
|---|---|
| Service de taux indisponible ou devise non gérée | Message clair ; dernier taux connu proposé ; saisie manuelle du taux ; rien n'est perdu. |
| Montant vide, négatif ou à plus de deux décimales | Refusé avec un message sous le champ. |
| Suppression d'un voyageur payeur ou concerné | Refusée, avec explication : il faut d'abord réaffecter ses dépenses. |
| Dernier voyageur | Suppression impossible : il en faut au moins un. |
| Suppression d'une ligne prévue | Ses dépenses passent en « hors prévu » et sont conservées. |
| Suppression d'une réservation | Sa ligne disparaît du prévu ; ses dépenses passent en « hors prévu ». |
| Changement du nombre de voyageurs ou de jours | Les lignes « par personne » et « par jour » se recalculent seules. |
| Échec d'enregistrement | Message et bouton « Réessayer » ; la saisie reste dans le formulaire. |
| Hors ligne | Bandeau habituel ; boutons de modification désactivés. |

## 8. Sécurité et confidentialité
- Toutes les tables budget sont protégées par la RLS : un utilisateur n'accède qu'à ses lignes, et ne peut rattacher une ligne qu'à un parent qui lui appartient.
- Le budget **n'est lu ni par `get_shared_roadbook`, ni par `get_calendar_bundle`**, ni par aucune fonction accessible sans compte ; leurs réponses ne contiennent aucun champ budget. Un test le garantit.
- Le seul appel externe ajouté est vers le service de taux de change : il ne reçoit **que des codes de devise**, jamais de montant ni de nom.

## 9. Tests
- **Domaine (Vitest)** : les quatre modes ; marge de change ; arrondis en centimes ; règle `max(prévu, réel)` ; dépenses hors prévu ; enveloppe par personne ; coût par personne ; soldes (parts inégales, reste de centimes, somme nulle, un seul voyageur) ; virements déterministes ; alertes ; montants exacts des trois conseils, y compris « insuffisant ».
- **Contrat du dépôt** (mémoire et Supabase) : cascades à la suppression d'un voyage ; refus de supprimer un voyageur référencé ; rattachements exclusifs ; duplication sans les dépenses.
- **SQL** (base locale) : un autre utilisateur ne voit rien du budget ; impossible d'y rattacher une ligne ; **le roadbook partagé et le calendrier ne contiennent aucun champ budget**.
- **Interface** : validation des formulaires ; « Réessayer » ; refus de supprimer un voyageur concerné ; taux manuel.
- **Parcours dans le navigateur** : créer un voyage, ajouter des voyageurs et des lignes, saisir une dépense en yens avec taux manuel, voir l'alerte, appliquer un conseil, lire les soldes.
- **Test manuel par toi** : un vrai voyage avec plusieurs personnes, en vérifiant les soldes à la main.

## 10. Mise en place
Une migration à lancer dans le SQL Editor de Supabase (fichier fourni), puis la publication habituelle. Aucun nouveau compte, ni clé.

## 11. Hors périmètre de l'étape 2
- Recherche de bons plans par l'IA et demande préparée pour Claude : **étape 3**.
- Interrogation en direct des prix de vols ou d'hôtels (services payants).
- Import de relevés bancaires, photos de tickets, exports comptables.
- Enveloppe en plusieurs devises, ou budget par jour.
- Budget dans le roadbook.
