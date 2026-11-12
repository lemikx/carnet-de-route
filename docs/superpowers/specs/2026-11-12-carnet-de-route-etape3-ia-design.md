# Carnet de route — Spécification de l'étape 3 : créer un voyage avec l'IA

Date : 2026-11-12
Statut : en relecture
Suite de : étape 1 (`…etape1-design.md`) et étape 2 (`…etape2-budget-design.md`), toutes deux en production.

## 1. Objectif

Permettre de **créer un voyage complet avec l'aide d'une IA**, sans clé d'API payante : l'appli prépare une demande, l'utilisateur la colle dans Claude (abonnement existant, recherche web activée), puis recolle la réponse ; l'appli la **vérifie**, place les lieux sur la carte et crée un **voyage ordinaire** (jours, étapes, trajets, checklist, lignes de budget).

Deux entrées :
- **« Je sais où aller »** (destination renseignée) : un seul aller-retour, qui produit l'itinéraire détaillé.
- **« Surprends-moi »** (destination vide) : d'abord **trois idées courtes** avec leur indicateur de visa ; l'utilisateur en choisit une ; puis le même aller-retour pour l'itinéraire détaillé.

Le **délai de traitement du visa** est pris en compte dans les deux cas.

### Critères de réussite
1. Je réponds au questionnaire, je copie la demande, je colle la réponse de Claude, et j'obtiens un voyage complet dans l'appli en moins de dix minutes.
2. Chaque idée affiche un **indicateur de visa** (vert, orange, rouge, gris) calculé par l'appli à partir de la date de départ ; les rouges sont grisées en bas, avec la raison.
3. La checklist reçoit l'échéance **« Faire le visa avant le … »**.
4. Les **lieux** sont placés automatiquement ; ceux qui sont introuvables ou trop éloignés sont signalés « à vérifier ».
5. Une réponse illisible, tronquée ou piégée ne fait **jamais** planter l'appli ni créer un voyage à moitié.
6. Je peux **fermer l'appli entre deux copier-coller** et reprendre mon brouillon.
7. Les brouillons n'apparaissent **jamais** dans le partage, le calendrier ni le roadbook.

## 2. Ce qui a été décidé (et ce qui est supposé)

**Décidé avec toi**
- Deux modes (avec ou sans destination) ; génération automatique **en deux temps** (idées, puis itinéraire).
- IA : **copier-coller avec l'abonnement Claude** par défaut ; une clé d'API pourra venir plus tard derrière la même interface.
- Visas : nationalité **française** par défaut ; **tout est montré avec un indicateur de couleur** (vert, orange, rouge), les rouges grisées en bas avec la raison ; toujours « À vérifier sur le site officiel » avec le lien ; échéance ajoutée à la checklist.
- Lieux : **placés automatiquement**, les douteux signalés « à vérifier » ; le voyage est **créé tout de suite**, même avec des lieux à vérifier.
- Questionnaire : une question par écran ; listes de choix validées (§9) ; deux questions facultatives en plus (rythme, contraintes).
- Brouillons **sauvegardés** à chaque étape.
- Bouton **« Ouvrir dans Claude »** en plus du copier-coller, quand c'est possible.
- La recherche de **bons plans par l'IA** pour rester dans le budget est un chantier suivant, qui réutilisera la même mécanique.

**Supposé par moi (à corriger si besoin)**
- Seules les **dates de départ et de retour** sont obligatoires.
- Seuil « orange » : **14 jours** de marge ; sécurité de l'échéance : **7 jours** ; les deux réglables.
- Prénoms des voyageurs **facultatifs** (« Voyageur 1 », « Voyageur 2 »… à défaut) ; ils alimentent l'onglet Budget.
- Plafonds sur ce qui est collé : réponse ≤ **200 000 caractères**, **30 jours**, **12 étapes par jour**, textes ≤ **500 caractères**, montants ≤ **1 000 000**.
- Le lien « Ouvrir dans Claude » (`https://claude.ai/new?q=…`) a une taille maximale que je ne peux pas vérifier d'ici : au-delà d'une limite (6 000 caractères au départ), le bouton est remplacé par le seul copier-coller. **À vérifier à la construction.**
- Les informations de visa viennent de la recherche web de Claude : elles peuvent être périmées. L'appli ne les présente **jamais** comme certaines.

## 3. Architecture

```
Questionnaire (UI) ──► Brief ──► PromptBuilder ──► texte de la demande
                                                        │  (copier / « Ouvrir dans Claude »)
                                                        ▼
                                                  Claude (hors appli)
                                                        │  (coller la réponse)
                                                        ▼
                         ResponseParser ──► validation du protocole v1 (idées ou itinéraire)
                                                        │
              ┌─────────────────────────────────────────┴───────────────┐
              ▼ idées                                                    ▼ itinéraire
   Visa (indicateurs) ──► choix                              PlaceResolver (géocodage, signalements)
                                                                        │
                                                                        ▼
                                                      TripFromItinerary ──► TripService (voyage ordinaire)
```

### Modules
- **`src/ai/protocol/`** : types du protocole v1 et validation (aucune dépendance réseau).
- **`src/ai/promptBuilder.ts`** : brief → texte de la demande (idées ou itinéraire), avec le format de réponse.
- **`src/ai/responseParser.ts`** : texte collé → objet validé ou liste d'erreurs en français ; détection de réponse tronquée.
- **`src/ai/visa.ts`** : niveau de visa (vert, orange, rouge, gris) et échéance de checklist.
- **`src/ai/placeResolver.ts`** : place un lieu (via `RoutingService.geocode`), signale introuvable ou éloigné ; quelques requêtes à la fois, progression.
- **`src/ai/tripFromItinerary.ts`** : itinéraire validé et lieux placés → voyage ordinaire, avec annulation propre en cas d'échec.
- **`src/ai/AiProvider.ts`** : interface (`copyPasteProvider` aujourd'hui ; une clé d'API plus tard sans toucher au reste).
- **`src/data/`** : méthodes de brouillons ajoutées à `TripRepository` (mémoire et Supabase, suite de contrat commune).
- **`src/ui/ai/`** : le parcours.

Les brouillons sont **hors de `TripBundle`** : ils ne peuvent pas fuiter par le partage ni le calendrier.

## 4. Modèle de données

Table **`ai_drafts`** (mêmes règles que le reste : `id`, `user_id`, `created_at`, `updated_at`, RLS « propriétaire »).
- `mode` : `known` | `surprise`
- `stage` : `brief` | `ideas_requested` | `ideas_received` | `idea_chosen` | `itinerary_requested` | `itinerary_received` | `created`
- `brief` (jsonb) : le questionnaire (§9)
- `ideas` (jsonb, facultatif) : les trois idées validées
- `chosen_idea_id` (texte, facultatif)
- `itinerary` (jsonb, facultatif) : l'itinéraire validé
- `trip_id` (facultatif, `on delete set null`) : le voyage créé
- `protocol_version` (entier)

Migration : `0006_ai_drafts.sql`. Aucun déclencheur `touch_trip` ; aucune lecture par `get_shared_roadbook`, `get_calendar_bundle` ni `trip_bundle_json`.

## 5. Protocole v1

Un seul bloc JSON, `"v": 1`. Tous les montants en nombre, toutes les durées en minutes, toutes les heures `HH:mm`, toutes les dates `AAAA-MM-JJ`.

**Réponse « idées »** (`"kind": "ideas"`) : exactement 3 idées
`id`, `destination`, `country` (code ISO à 2 lettres), `summary`, `durationDays`, `highlights` (liste courte), `budgetPerPersonEur` (estimation), `whyItMatches`, et `visa` :
`required` (`true` | `false` | `"unknown"`), `type`, `processingDaysMin`, `processingDaysMax` (nombres ou absents), `officialUrl` (`https` seulement), `notes`.

**Réponse « itinéraire »** (`"kind": "itinerary"`)
- `trip` : `name`, `countries` (codes), `currency` (devise locale), `visa` (même structure que ci-dessus).
- `days` : liste ordonnée ; chaque jour : `day` (1, 2, 3…), `title`, `note`, `stops`.
- Chaque étape : `title`, `kind` (`activity` | `lodging` | `point`), `place` (`name`, `city`, `country`), `startTime` et `durationMin` facultatifs, `note`.
- `checklist` : éléments `category`, `label`, `daysBeforeDeparture` facultatif.
- `budget` : lignes `category`, `label`, `amount`, `currency`, `mode` (`fixed` | `per_person` | `per_day` | `per_person_per_day`).

### Vérification de ce qui est collé
- Le bloc est retrouvé même entouré de texte (première balise `json`, sinon le plus grand objet entre accolades).
- Chaque champ est contrôlé ; les erreurs sont en français et précises (« Jour 3, étape 2 : l'heure “25:00” est invalide »).
- Réponse **tronquée** (accolades non fermées) : détectée ; l'appli propose un texte « continue exactement où tu t'es arrêté ».
- Plus de jours que de dates : avertissement ; moins : accepté avec avertissement.
- Version différente de 1 : refusée avec explication.
- **Contenu non fiable** : chaînes affichées en texte brut, jamais interprétées ; seuls les liens `https` sont conservés ; plafonds du §2 ; caractères de contrôle retirés.

## 6. Visa

- `restant = date de départ − aujourd'hui` (en jours).
- **Gris** « à vérifier » : information absente ou `unknown`.
- **Vert** : visa non requis, ou `processingDaysMax ≤ restant − marge`.
- **Orange** : `restant − marge < processingDaysMax ≤ restant` (marge : 14 jours).
- **Rouge** : `processingDaysMax > restant`.
- **Échéance de checklist** : `départ − processingDaysMax − 7 jours` ; si elle est déjà passée, l'élément est créé avec la mention « en retard ».
- Chaque affichage : « Information donnée par l'IA : à vérifier sur le site officiel » et le lien.

## 7. Placement des lieux

- Requête = `name, city, country`, avec comme point de proximité le **centre des lieux déjà placés** (sinon la destination).
- Au plus **4 requêtes en parallèle**, barre de progression.
- **À vérifier** : aucun résultat ; ou résultat à plus de **150 km** du centre des autres lieux du voyage.
- Quota gratuit atteint ou service indisponible : les lieux restants sont créés **sans carte**, signalés, rien n'est perdu.
- Le choix automatique est le premier résultat ; l'utilisateur corrige ensuite avec l'écran d'étape existant.

## 8. Création du voyage

À partir de l'itinéraire validé :
1. Un voyage (`TripService.createTrip`) avec les dates du brief, le nom et les pays de la réponse, la devise locale.
2. Les voyageurs du brief (onglet Budget), les **lignes de budget prévues** de la réponse (devise convertie avec les taux de l'étape 2).
3. Les étapes de chaque jour (heure et durée si fournies ; l'hébergement en dernière position), puis le calcul des trajets existant.
4. Les éléments de checklist de la réponse, **plus l'échéance de visa** si un visa est requis.
5. Le brouillon passe à `created` et garde le `trip_id`.

**En cas d'échec en cours de route**, le voyage partiel est **supprimé** et le brouillon reste à l'étape précédente : un clic relance sans doublon.

## 9. Écrans

**Point d'entrée** : bouton **« Créer avec l'IA »** sur la liste des voyages, avec « Je sais où aller » et « Surprends-moi » ; la liste affiche aussi les **brouillons en cours**, à reprendre ou à supprimer.

**Questionnaire** (une question par écran, retour possible) : destination (facultative) → dates et durée → ville de départ → voyageurs (adultes, enfants, prénoms facultatifs, **nationalité de chacun**, `FR` par défaut) → budget par personne → profil (listes ci-dessous) → rythme → contraintes.

- **Quel voyageur êtes-vous ?** Aventurier · Culturel · Détente · Gourmand · Sportif · Nature · Romantique · Famille · Fêtard
- **Quel type de voyage recherchez-vous ?** Séjour dans une ville · Circuit itinérant (plusieurs étapes) · Séjour balnéaire · Randonnée ou trek · Road trip · Week-end prolongé
- **Quelles sont vos envies et attentes ?** Plages · Histoire et musées · Paysages et nature · Gastronomie · Vie locale et hors des sentiers battus · Shopping · Vie nocturne · Activités sportives · Bien-être et spa · Photographie · Parcs d'attractions
- **Quel type d'hébergement appréciez-vous ?** Hôtel · Appartement · Auberge de jeunesse · Chambre d'hôtes · Camping · Resort tout compris · Écolodge
- **Rythme** (facultatif) : tranquille · équilibré · intense
- **Contraintes** (facultatif) : champ libre

**Écran « demande »** : le texte, un bouton « Copier », le bouton « Ouvrir dans Claude » si la taille le permet, le rappel d'**activer la recherche web**, et la zone pour **coller la réponse**.

**Écran « idées »** (mode « Surprends-moi ») : trois cartes avec résumé, budget estimé, indicateur de visa ; les rouges grisées en bas avec la raison ; « Choisir cette idée ».

**Écran de contrôle** : nombre de jours, étapes par jour, **lieux à vérifier**, échéance du visa, budget estimé ; bouton **« Créer le voyage »**.

## 10. Gestion des erreurs

| Situation | Comportement |
|---|---|
| Réponse illisible ou mauvais format | Message précis ; texte à coller dans Claude pour corriger. |
| Réponse tronquée | Détectée ; texte « continue exactement où tu t'es arrêté ». |
| Version de protocole différente | Refusée avec explication ; rien n'est créé. |
| Dates qui ne correspondent pas | Avertissement ; l'utilisateur choisit de continuer ou de recoller. |
| Visa inconnu | Indicateur gris, sans blocage. |
| Lieux introuvables ou éloignés | Voyage créé ; lieux signalés « à vérifier ». |
| Quota ou service indisponible en cours de placement | Lieux restants sans carte, signalés. |
| Échec de la création du voyage | Voyage partiel supprimé ; brouillon conservé ; « Réessayer » sans doublon. |
| Hors ligne | Brouillon consultable ; impossible d'avancer sans réseau. |
| Échec d'enregistrement du brouillon | Message et « Réessayer » ; la saisie reste dans le formulaire. |

## 11. Sécurité et confidentialité
- Les brouillons sont protégés par la RLS ; aucune lecture par les fonctions accessibles sans compte.
- Tout ce qui est collé est **non fiable** (voir §5).
- Aucune clé d'API n'est utilisée ni stockée.
- Appels externes : uniquement ceux qui existent (placement des lieux, taux de change). Aucun ne reçoit de nationalité, de budget ni de prénom.
- La demande copiée contient des informations personnelles (nationalités, budget) : elles ne partent que là où **l'utilisateur** les colle lui-même.

## 12. Tests
- **Lecture de la réponse** : valide, entourée de texte, tronquée, types erronés, contenu piégé (balises HTML, `javascript:`, nombres énormes, trop de jours), version inconnue.
- **Visa** : les quatre niveaux et l'échéance, avec des dates précises, y compris échéance déjà passée.
- **Lieux** : introuvable, éloigné de plus de 150 km, quota atteint à mi-parcours, service factice.
- **Création du voyage** : un voyage complet depuis une réponse (étapes, trajets, checklist avec visa, lignes de budget, voyageurs) ; annulation propre quand une étape échoue.
- **Demande** : contient le format de réponse et la consigne de recherche web ; instantané du texte.
- **Brouillons** : contrat du dépôt (mémoire et Supabase) ; SQL : visibles par leur propriétaire seulement, absents du partage et du calendrier.
- **Interface** : le questionnaire (étapes, retour, champs obligatoires), « Réessayer », reprise d'un brouillon.
- **Parcours dans le navigateur** (réponses factices collées) : « Surprends-moi » de bout en bout, puis « Je sais où aller ».
- **Test manuel par toi** : une vraie demande collée dans Claude avec la recherche web, pour un vrai voyage.

## 13. Mise en place
Une migration à coller dans le SQL Editor de Supabase (`0006_ai_drafts.sql`), puis la publication habituelle. Aucun nouveau compte, aucune clé. **Prérequis : la migration du budget (`0005`) doit déjà être passée.**

## 14. Hors périmètre de l'étape 3
- Appel direct d'une API (Claude, Gemini…) : la structure le permet, mais ce n'est pas construit.
- Recherche de bons plans pour rester dans le budget par l'IA (chantier suivant, même mécanique).
- Réservation de vols ou d'hôtels, prix en direct.
- Génération d'images, partage d'un brouillon, plusieurs brouillons comparés côte à côte.
