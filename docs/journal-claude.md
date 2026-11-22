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

Migrations Supabase appliquées à la main par Mikael : `0008_stop_photos.sql`, `0009_reservation_flight_fields.sql`.
`supabase/setup-complet.sql` n'est pas régénéré automatiquement : il ne contient ni 0008 ni 0009.

## Maquettes (artefacts Claude Design)

- Refonte design (directions A à F) : https://claude.ai/artifact/5W4p4LdMkaX9boxmjEFMZ8
- Style de référence vert sauge (accueil, itinéraire, réservations) : https://claude.ai/artifact/UWjpZLkCmGtKURZzwhH2Bw
- Logo, 3 propositions (choix : n° 3, monogramme) : https://claude.ai/artifact/K5FhXLRobvgAAZ2Ljsb2aN

## Points ouverts

- Le bouton « Créer ce voyage avec l'IA » de l'accueil n'envoie pas la destination saisie au questionnaire.
- Dans un roadbook partagé, siège, porte et terminal restent visibles (le numéro de confirmation et le prix sont masqués) : à masquer si Mikael le souhaite.
- Message « Calcul impossible : reconnecte-toi. » sur les trajets : session expirée, se reconnecter dans Réglages.
- Bug de date signalé plus tôt (date bloquée sur avril 2027 à la création) : jamais reproduit ni corrigé.
- L'adresse secrète du connecteur Carnet de route a été collée dans la conversation : la régénérer dans les Réglages.
- `npm run test:db` n'a pas été lancé (pas de PostgreSQL local dans l'environnement de travail).
