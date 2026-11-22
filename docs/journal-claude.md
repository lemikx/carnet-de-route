# Journal des travaux faits avec Claude (21 et 22 novembre 2026)

Récapitulatif d'une conversation Claude (application web), pour reprendre le travail dans Claude Code, projet « application voyage ».

## Règles de travail retenues

- Fusion dans `main` uniquement avec l'accord explicite de Mikael (voir `CLAUDE.md`).
- Recherche et collecte confiées à des sous-agents (Haiku), écriture de code à Sonnet, décisions et vérifications à Opus. Toujours vérifier le travail d'un sous-agent.
- Pour chaque voyage créé dans l'application (brouillon via le connecteur) :
  - consulter diplomatie.gouv.fr : « Entrée / séjour », « Conseils aux voyageurs », « Informations utiles », « Sécurité » ;
  - intégrer les consignes de conduite et de location de voiture ; ne pas prévoir de location quand la conduite est déconseillée (préférer chauffeur, taxis officiels, train) ;
  - intégrer la météo locale et dire si les dates sont propices ;
  - chercher les meilleurs spots, lieux atypiques et adresses des locaux (guides, Petit Futé, blogs et vlogueurs comme pistes), puis vérifier coordonnées GPS et horaires sur des sources fiables.
- Les voyages déjà créés (Portugal, Maroc v1 à v4, Thaïlande v1 et v2) sont des tests : ne pas les mettre à jour sauf demande.

## Mis en ligne (dans l'ordre)

| Version | Contenu |
|---|---|
| 338dcad | Photos libres de droits sur les étapes : recherche Wikimedia Commons dans l'éditeur d'étape, crédit et licence affichés (migration 0008). |
| 2a45b16 | Photos automatiques ; légende « Photo : Auteur · Licence » avec lien (corrige un échec e2e). |
| e81bf37 | Toutes les étapes sans photo sont traitées, même après une recherche sans résultat. |
| 881b7b4 | Vraies photos seulement (JPEG, PNG, WebP) ; pas de photo pour les étapes de transport ; mauvaises photos (PDF) retirées. |
| 776330e | Photo de la ville pour les hébergements ; repli sur la ville quand le nom ne donne rien. |
| 083bc44 | Design vert sauge : palette claire et sombre (contrastes ≥ 4,5:1), Fraunces pour les titres, Manrope pour le texte (polices embarquées). |
| 7e1ac31 | Disposition façon maquette (cartes photo, barre de navigation en bas sur mobile, jours en pastilles) et icône monogramme C (montagne et soleil). |
| 8d2db01 | Accueil avec recherche, réservations façon billet, vignette compacte sur mobile. |
| 4322390 | Billet : codes d'aéroport, terminal, porte et siège (migration 0009). |

Suite dans Claude Code (22 novembre 2026) :

| Version | Contenu |
|---|---|
| 12bb278 | Le bouton « Créer ce voyage avec l'IA » de l'accueil transmet la destination au questionnaire ; règles de création de voyage et d'écriture du code ajoutées à `CLAUDE.md` ; `setup-complet.sql` régénéré. |
| 5bfaa8e | Roadbook partagé avec « masquer les infos sensibles » : siège, porte et terminal masqués côté base (migration 0010) et côté appli ; codes d'aéroport conservés. |

Migrations Supabase appliquées à la main par Mikael : `0008_stop_photos.sql`, `0009_reservation_flight_fields.sql`, `0010_hide_flight_details.sql`.
`supabase/setup-complet.sql` contient maintenant les migrations 0001 à 0010 (à régénérer à chaque nouvelle migration).

## Maquettes (artefacts Claude Design)

- Refonte design (directions A à F) : https://claude.ai/artifact/5W4p4LdMkaX9boxmjEFMZ8
- Style de référence vert sauge (accueil, itinéraire, réservations) : https://claude.ai/artifact/UWjpZLkCmGtKURZzwhH2Bw
- Logo, 3 propositions (choix : n° 3, monogramme) : https://claude.ai/artifact/K5FhXLRobvgAAZ2Ljsb2aN

## Accès des enfants (22 novembre 2026)

- Choix de Mikael : pas de compte séparé pour les enfants ; ils utilisent **le compte de Mikael** sur leur téléphone.
- Procédure : sur son téléphone, l'enfant ouvre l'appli, tape l'adresse e-mail de Mikael et appuie sur « Recevoir le lien » ; Mikael lui transfère aussitôt l'e-mail ; l'enfant ouvre le lien sur son téléphone (lien à usage unique, valable environ 1 heure). Il reste ensuite connecté sur cet appareil.
- Conséquences : les enfants voient et peuvent modifier tous les voyages, le budget et les réglages ; consigne de ne pas toucher à Réglages (« Connecteur Claude », « Se déconnecter »). Couper l'accès : Supabase → Authentication → Users → compte de Mikael → déconnecter les sessions.
- Les liens de connexion ne peuvent être envoyés qu'à l'adresse de Mikael (Resend avec `onboarding@resend.dev`) ; des comptes séparés demanderaient un nom de domaine vérifié chez Resend (ou Brevo) ou l'ajout d'une connexion par mot de passe.
- Vidéo tuto « Se connecter à Carnet de route » (1 min 16, MP4 format téléphone, écrans du mode démonstration, adresse fictive papa@exemple.fr) fabriquée et remise à Mikael ; elle n'est pas dans le dépôt.

## Points ouverts

- Bug de date signalé plus tôt (date bloquée sur avril 2027 à la création) : jamais reproduit. Noter les étapes exactes (écran, dates tapées) s'il revient.
- Message « Calcul impossible : reconnecte-toi. » sur les trajets : pas un bug, session expirée ; se reconnecter dans Réglages.

## Points réglés le 22 novembre 2026

- Bouton « Créer ce voyage avec l'IA » de l'accueil : destination transmise (12bb278).
- Siège, porte et terminal masqués dans le roadbook partagé (5bfaa8e, migration 0010 appliquée).
- Adresse secrète du connecteur Carnet de route régénérée par Mikael et remplacée dans claude.ai.
- `npm run test:db` lancé dans Claude Code : tous les tests de la base passent (migrations 0001 à 0010).
- `setup-complet.sql` à jour (0001 à 0010).
