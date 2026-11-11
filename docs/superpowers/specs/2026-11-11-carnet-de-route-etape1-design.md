# Carnet de route — Spécification de l'étape 1

Date : 2026-11-11
Statut : en relecture

## 1. Objectif

Une appli personnelle pour préparer un voyage à l'étranger et produire un **roadbook complet**, utilisable sur Mac et sur iPhone par un seul utilisateur.

Le projet complet est découpé en 3 étapes ; ce document ne couvre que l'étape 1.

| Étape | Contenu |
|---|---|
| **1 (ce document)** | Voyages, itinéraire jour par jour, trajets calculés, cartes, checklist, réservations, roadbook (HTML + PDF) |
| 2 | Budget et conversion de devises |
| 3 | Proposition d'itinéraire par IA, nourrie par une recherche Reddit + YouTube, que l'utilisateur ajuste ensuite |

### Critères de réussite de l'étape 1

1. Je crée un voyage, je remplis les jours, les lieux, les réservations et la checklist depuis mon Mac **ou** mon iPhone, et je retrouve tout sur l'autre appareil.
2. Les trajets en voiture, à pied et à vélo sont calculés automatiquement (durée, distance, tracé) ; les autres sont saisis ou repris d'une réservation.
3. L'appli signale les conflits horaires et les journées trop chargées.
4. Je consulte le roadbook dans l'appli et je l'exporte en PDF, lisible hors ligne sur l'iPhone.
5. Je partage le roadbook avec ma famille par un lien en lecture seule (toujours à jour, sans compte, désactivable) ou en envoyant le PDF.
6. Je retrouve mon voyage dans Calendrier (Mac/iPhone), soit par un fichier importé, soit par un abonnement qui se met à jour tout seul.

## 2. Ce qui a été décidé (et ce qui est supposé)

**Décidé avec toi**
- Appli web installable (PWA) plutôt qu'appli native Apple.
- Un seul utilisateur qui modifie, synchronisé entre Mac et iPhone ; d'autres personnes peuvent seulement consulter le roadbook partagé.
- Hébergement sur GitHub Pages (compte existant), données sur Supabase (gratuit).
- Trajets calculés automatiquement dès l'étape 1.
- Roadbook consultable dans l'appli **et** exportable en PDF.
- Partage du roadbook : envoi du PDF **et** lien secret en lecture seule, infos sensibles masquées par défaut.
- Export calendrier : fichier `.ics` à importer **et** abonnement calendrier toujours à jour, dès l'étape 1.

**Supposé par moi (à corriger si besoin)**
- Interface en français uniquement.
- Connexion par lien magique envoyé par e-mail, sans mot de passe.
- Pas de pièces jointes (PDF des billets) à l'étape 1.
- Hors ligne = **consultation** seulement ; les modifications nécessitent le réseau.
- Nom de l'appli : « Carnet de route ».

## 3. Architecture

```
iPhone / Mac (Safari, appli installée)
        │
        ▼
  Appli web (React + TypeScript, PWA)  ── hébergée sur GitHub Pages
        │                    │
        ▼                    ▼
  Supabase               Supabase Edge Function « routes »
  (connexion,            (garde la clé OpenRouteService secrète)
   base de données)              │
                                 ▼
                         OpenRouteService
                         (adresses → coordonnées, calcul d'itinéraires)

  Cartes : tuiles OpenStreetMap affichées avec Leaflet

  Famille (lien partagé, sans compte)
        │
        ▼
  Appli web, page « roadbook partagé » ──► fonction Supabase get_shared_roadbook(jeton)
                                            (renvoie uniquement le roadbook, filtré)

  Calendrier Apple (abonnement webcal://, sans compte)
        │
        ▼
  Supabase Edge Function « calendar » (jeton calendrier) ──► fichier .ics à jour
```

### Choix techniques

| Rôle | Outil |
|---|---|
| Interface | Vite + React + TypeScript |
| Navigation | React Router (mode « hash », compatible GitHub Pages) |
| Installation et hors ligne | vite-plugin-pwa (service worker) + cache IndexedDB |
| Données et connexion | Supabase (Postgres + Auth), règles d'accès « chaque utilisateur ne voit que ses données » (RLS) |
| Adresses et trajets | OpenRouteService, appelé via une Edge Function Supabase |
| Cartes | Leaflet + OpenStreetMap |
| PDF | Impression du navigateur avec une mise en page dédiée (« Enregistrer en PDF ») |
| Tests | Vitest (logique), Playwright (parcours complets) |

### Découpage en modules

Chaque module a un rôle unique et se teste seul.

- **`domain/`** : logique pure, sans réseau ni interface. Génération des jours à partir des dates, ordre des étapes, détection des conflits horaires, cumul des trajets, tri des réservations, construction du contenu du roadbook.
- **`data/`** : accès aux données derrière une interface unique (`TripRepository`). Deux implémentations : Supabase (réelle) et en mémoire (pour les tests). Le reste de l'appli ne connaît que l'interface.
- **`routing/`** : géocodage et calcul de trajets derrière une interface (`RoutingService`). Implémentations : Edge Function réelle, et une version factice pour les tests.
- **`offline/`** : cache local des voyages déjà consultés et détection de l'état du réseau.
- **`ui/`** : écrans et composants.
- **`roadbook/`** : la page roadbook et sa mise en page d'impression. Elle reçoit un contenu déjà construit, ce qui permet de l'utiliser aussi bien pour le propriétaire que pour un lien partagé.
- **`sharing/`** : création, copie et désactivation des liens ; filtrage des infos sensibles.
- **`calendar/`** : génération du calendrier (`.ics`) à partir d'un voyage. Le même code sert au fichier téléchargé et à l'abonnement (Edge Function).

## 4. Modèle de données

Toutes les tables ont `id`, `user_id`, `created_at`, `updated_at`. L'accès est limité au propriétaire (RLS).

**trips** (voyages)
- `name`, `countries` (liste), `start_date`, `end_date`, `local_currency`, `home_timezone`

**days** (jours) — un par date du voyage, créés automatiquement
- `trip_id`, `date`, `title` (ex. « Kyoto »), `note`

**stops** (lieux d'une journée)
- `day_id`, `position` (ordre), `kind` : `activity` | `lodging` | `point`
- `title`, `address`, `lat`, `lon`, `timezone`
- `start_time` (facultatif), `duration_min` (facultatif), `note`, `phone`, `url`
- `reservation_id` (facultatif)

**legs** (trajets) — entre deux lieux consécutifs
- `from_stop_id`, `to_stop_id`
- `mode` : `car` | `walk` | `bike` | `train` | `bus` | `plane` | `ferry` | `other`
- `duration_min`, `distance_km`, `geometry` (tracé)
- `source` : `auto` | `manual` | `reservation`
- `error` (message si le calcul a échoué), `computed_at`

**reservations**
- `trip_id`, `type` : `flight` | `lodging` | `car_rental` | `train` | `activity` | `other`
- `title`, `start_at`, `end_at` (avec fuseau horaire local), `from_place`, `to_place`
- `confirmation_number`, `price`, `currency`, `url`, `phone`, `note`

**checklist_items**
- `trip_id`, `category` : `documents` | `health` | `luggage` | `before_departure`
- `label`, `done`, `due_date` (facultatif), `position`

**contacts** (contacts utiles)
- `trip_id`, `name`, `kind` : `embassy` | `emergency` | `lodging` | `other`, `phone`, `address`, `note`

**share_links** (liens de partage)
- `trip_id`, `token` (jeton aléatoire de 32 caractères, impossible à deviner), `hide_sensitive` (vrai par défaut), `active`, `revoked_at`
- Un seul lien actif par voyage. « Nouveau lien » désactive l'ancien.

**calendar_links** (abonnements calendrier)
- `trip_id`, `token` (jeton aléatoire distinct de celui du partage), `include_legs` (vrai par défaut), `include_checklist` (vrai par défaut), `active`, `revoked_at`
- Un seul abonnement actif par voyage.

### Fuseaux horaires
Chaque heure est enregistrée avec le fuseau horaire du lieu. Un vol Paris 10:00 → Tokyo 06:00 (+1) s'affiche correctement, et sa durée réelle est calculée. C'est indispensable pour un voyage à l'étranger.

## 5. Écrans et fonctions

### 5.1 Liste des voyages
- Afficher, créer, modifier, dupliquer et supprimer un voyage (avec confirmation).
- Modifier les dates ajoute ou retire des jours ; supprimer un jour qui contient des lieux demande confirmation.

### 5.2 Onglet Itinéraire
- Une section par jour, avec ses lieux dans l'ordre et un trajet entre chaque paire de lieux consécutifs.
- Ajouter un lieu : saisie de l'adresse avec suggestions (géocodage) ; si plusieurs résultats, je choisis.
- Réordonner les lieux par glisser-déposer ; les trajets concernés sont recalculés.
- L'adresse ouvre Plans (Apple Maps) ; un bouton « Itinéraire » ouvre Plans avec départ et arrivée.
- Une carte par jour (points + tracés) et une carte d'ensemble du voyage.
- Le dernier lieu d'un jour et le premier du jour suivant sont aussi reliés par un trajet.

### 5.3 Trajets
- Voiture, marche, vélo : calcul automatique (durée, distance, tracé). Je peux remplacer la durée à la main ; elle passe alors en `manual` et n'est plus recalculée.
- Train, bus, avion, ferry : durée saisie à la main, ou reprise de la réservation liée (`reservation`).
- Recalcul automatique quand un lieu change d'adresse ou de position.

**Alertes**
- **Conflit horaire** : heure d'arrivée estimée (début + durée du lieu précédent + trajet) postérieure à l'heure prévue du lieu suivant. Ex. « Tu arrives à 14:20, l'activité commence à 14:00 ».
- **Journée chargée** : plus de 5 h de trajet cumulé dans la journée (seuil modifiable dans les réglages).

### 5.4 Onglet Checklist
- Quatre catégories, pré-remplies par un modèle de base (passeport, assurance voyage, adaptateur de prise, médicaments, etc.).
- Ajouter, modifier, supprimer, cocher ; échéance facultative (affichée en rouge si dépassée et non cochée).
- Barre de progression « 18/25 faits ».

### 5.5 Onglet Réservations
- Création par type, triées par date.
- Numéro de confirmation copiable en un clic.
- Un vol, un train ou un hébergement crée ou met à jour automatiquement le lieu correspondant dans l'itinéraire (aéroport, gare, hôtel) ; le lieu reste lié à la réservation.

### 5.6 Onglet Contacts
- Contacts utiles du voyage (ambassade, urgences, hébergements…), repris dans l'annexe du roadbook.

### 5.7 Roadbook
Une page de l'appli, et la même page mise en forme pour l'impression ou le PDF.

1. **Couverture** : nom du voyage, dates, pays, carte d'ensemble.
2. **Vue d'ensemble** : tableau jour par jour (lieu de la nuit, km et heures de trajet).
3. **Une page par jour** : carte, programme horaire, trajets (mode, durée, distance), hébergement (adresse, téléphone, numéro de réservation), alertes éventuelles.
4. **Annexes** : toutes les réservations, checklist, contacts utiles.

- Dans l'appli : liens cliquables (adresses → Plans, téléphones, liens de réservation).
- Bouton « Exporter en PDF » : ouvre l'impression du navigateur avec une mise en page A4 (une journée par page) ; sur iPhone, Partager → Enregistrer dans Fichiers.
- Bouton « Partager » : voir 5.8.
- Le roadbook est enregistré dans le cache local et reste consultable hors ligne. Hors ligne, les cartes de la version web peuvent ne pas s'afficher (tuiles non mises en cache) ; le PDF, lui, contient les cartes telles qu'elles étaient à l'export. Pour un voyage, c'est donc le PDF qui fait référence hors ligne.

### 5.8 Partage du roadbook
**Envoyer le PDF** : après l'export, Partager → Messages, WhatsApp, e-mail… C'est une copie figée à la date de l'export.

**Lien en lecture seule**
- Dans le roadbook, « Partager » → « Créer un lien » ; le lien s'affiche avec les boutons « Copier » et « Partager » (feuille de partage iPhone/Mac).
- La personne qui ouvre le lien voit **le roadbook à jour**, sans compte et sans possibilité de modifier. Elle peut aussi l'exporter en PDF.
- Option « Masquer les infos sensibles », **activée par défaut** : numéros de confirmation, prix, liens de réservation et notes personnelles sont retirés. Adresses, horaires, trajets et cartes restent visibles.
- « Désactiver le lien » coupe l'accès immédiatement ; « Nouveau lien » remplace l'ancien.
- Avertissement affiché à la création : « Toute personne qui a ce lien peut voir ton itinéraire, tes hébergements et tes dates. »
- Côté famille, la page affiche en haut : « Roadbook partagé par … — mis à jour le … ».

### 5.9 Export calendrier
Bouton « Calendrier » sur la page du voyage, avec deux choix.

**Contenu (identique pour le fichier et l'abonnement)**
| Élément | Événement |
|---|---|
| Vol, train | Heure de départ → heure d'arrivée, chacune dans son fuseau ; lieu = départ ; titre « ✈️ Paris → Tokyo » / « 🚆 … » |
| Hébergement | Journée entière, du check-in au check-out (la nuit du départ exclue) ; titre « 🏨 {nom} » |
| Location de voiture, activité réservée | À l'heure de la réservation |
| Activité de l'itinéraire avec une heure | À cette heure, durée prévue (1 h si non précisée) ; lieu = adresse |
| Trajet de plus de 30 min (option) | À l'heure de départ estimée ; titre « 🚗 1 h 05 vers Kyoto » ; seulement si l'heure de départ est connue |
| Échéance de checklist non cochée (option) | Journée entière ; titre « À faire : {libellé} » |

- Les notes de l'événement contiennent adresse, téléphone, numéro de réservation et lien de réservation (le calendrier est privé).
- Chaque événement a un identifiant stable : un même élément n'est jamais créé deux fois dans l'abonnement.
- Options « Inclure les trajets de plus de 30 min » et « Inclure les échéances de la checklist », cochées par défaut.

**A. Fichier à importer** : « Télécharger (.ics) » → ouverture dans Calendrier, qui propose l'import. Copie figée ; rappel affiché : « Si tu modifies le voyage, réimporte le fichier ou utilise plutôt l'abonnement. »

**B. Abonnement** : « S'abonner » → crée l'abonnement et ouvre l'adresse `webcal://…` (Calendrier propose de s'abonner) ; boutons « Copier l'adresse », « Nouvelle adresse », « Désactiver ». Calendrier vérifie les mises à jour environ toutes les heures (indication donnée à Calendrier : 1 h).
- Avertissement : « Cette adresse contient tes numéros de réservation. Ne la partage pas : pour ta famille, utilise le partage du roadbook. »
- Désactiver l'abonnement : le calendrier abonné ne reçoit plus rien (les événements déjà affichés disparaissent à la prochaine mise à jour ou restent selon Calendrier ; on te l'indique).

## 6. Gestion des erreurs

| Situation | Comportement |
|---|---|
| Pas de réseau | Bandeau « Hors ligne — consultation seulement ». Les boutons de modification sont désactivés : rien n'est perdu en silence. |
| Adresse introuvable | Message sur le champ, pas de lieu créé sans coordonnées sauf si je le confirme (lieu « sans carte »). |
| Adresse ambiguë | Liste des résultats, je choisis. |
| Trajet impossible (mer, pas de route) | Message sur le trajet, mode suggéré « ferry/avion », saisie manuelle possible. |
| Limite gratuite OpenRouteService atteinte | Message « Calcul indisponible pour aujourd'hui », saisie manuelle possible ; les trajets déjà calculés restent. |
| Session expirée | Demande d'un nouveau lien magique ; données intactes. |
| Abonnement calendrier désactivé ou inconnu | L'adresse renvoie une erreur 404, sans aucune information sur le voyage. |
| Lien partagé désactivé ou inconnu | Page « Ce roadbook n'est plus partagé », sans aucune autre information. |
| Erreur de sauvegarde | Message clair et bouton « Réessayer » ; la saisie reste dans le formulaire. |

## 7. Sécurité
- Clé OpenRouteService stockée **uniquement** dans la Edge Function, jamais dans l'appli.
- RLS sur toutes les tables : un utilisateur n'accède qu'à ses propres lignes.
- La clé publique Supabase (« anon ») est la seule présente dans l'appli, conformément à l'usage prévu.
- La Edge Function n'accepte que les utilisateurs connectés.
- **Partage** : les visiteurs sans compte n'ont **aucun accès direct aux tables**. Ils passent uniquement par la fonction `get_shared_roadbook(jeton)`, qui vérifie que le lien est actif, renvoie seulement le contenu du roadbook de ce voyage et retire les infos sensibles côté serveur quand l'option est activée. Le filtrage n'est donc jamais fait seulement dans le navigateur.
- Le jeton est généré aléatoirement côté serveur (au moins 128 bits) ; la page partagée n'est pas indexée par les moteurs de recherche (`noindex`).
- **Calendrier** : l'Edge Function `calendar` est accessible sans compte (Calendrier Apple ne sait pas se connecter) mais ne répond qu'avec un jeton calendrier actif, et seulement pour le voyage de ce jeton. Le jeton calendrier est distinct du jeton de partage : partager le roadbook ne donne jamais accès au calendrier, qui contient les infos sensibles.

## 8. Tests

- **Vitest (domain/)** : génération des jours, ajout/retrait de jours au changement de dates, conflits horaires (y compris changement de fuseau), seuil de journée chargée, cumul km/heures, tri des réservations, contenu du roadbook.
- **Vitest (sharing/)** : en mode « masquer », aucun numéro de confirmation, prix, lien de réservation ni note n'apparaît dans le contenu partagé.
- **Tests SQL de la fonction de partage** : jeton actif → contenu ; jeton désactivé ou inconnu → rien ; jamais les données d'un autre voyage.
- **Vitest (calendar/)** : fichier `.ics` valide (format standard, lignes repliées à 75 octets, caractères spéciaux échappés), vol avec deux fuseaux aux bonnes heures, hébergement en journées entières, options respectées, identifiants stables d'une génération à l'autre.
- **Tests de l'abonnement** : jeton actif → calendrier ; jeton désactivé, inconnu ou voyage supprimé → 404 ; un jeton de partage ne fonctionne pas comme jeton calendrier.
- **Vitest (data/, routing/)** : implémentations en mémoire et factices conformes aux interfaces ; traitement des erreurs OpenRouteService.
- **Playwright** (avec les versions en mémoire/factices, sans dépendre d'Internet) : créer un voyage → ajouter des lieux → trajet calculé → conflit signalé → réservation reliée à l'itinéraire → roadbook affiché → lien partagé créé, ouvert sans connexion, puis désactivé → fichier calendrier téléchargé → mode hors ligne.
- **Test manuel par toi** (en plus) : import du fichier et abonnement dans Calendrier sur Mac et iPhone ; une modification du voyage apparaît dans l'abonnement.
- **Test manuel par toi** : installation sur Mac et iPhone, synchronisation entre les deux, export PDF.

## 9. Mise en place (guidée pas à pas)
1. Créer un projet Supabase (gratuit) et me transmettre l'URL du projet et la clé « anon » (elles ne sont pas secrètes).
2. Créer une clé OpenRouteService gratuite et l'enregistrer **toi-même** comme secret de la Edge Function (je te donnerai la commande ; elle ne doit pas passer dans la conversation).
3. Déployer les deux Edge Functions (`routes` et `calendar`) — je te donnerai les commandes.
4. Créer le dépôt GitHub et activer GitHub Pages.

## 10. Hors périmètre de l'étape 1
- Budget et devises (étape 2).
- Proposition d'itinéraire par IA et recherche Reddit/YouTube (étape 3). Le modèle de données (days/stops/legs) est conçu pour que l'étape 3 puisse le remplir directement.
- Modification à plusieurs (les autres ne font que consulter), pièces jointes, notifications, modification hors ligne, cartes hors ligne en dehors du roadbook en cache.
- Calcul automatique des trajets en transports en commun (pas de service gratuit fiable).
