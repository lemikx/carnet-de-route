# Connecteur Claude « Carnet de route » — conception

Date : 2026-11-21 · Validée par Mikael : approche B (connecteur sur mesure), accès par adresse secrète, résultat en brouillon à valider.

## Intention
Supprimer le copier-coller entre claude.ai et l'appli. Mikael dit à Claude (claude.ai web/mobile ou Claude Code) « crée-moi un voyage à Madère du 8 au 22 mars » ; Claude fait ses recherches puis envoie l'itinéraire à l'appli, qui le range en **brouillon à valider**.

## Non-objectifs / anti-objectifs
- Pas d'accès général à la base (pas le connecteur officiel Supabase : il exécute du SQL en administrateur).
- Claude ne peut ni lire, ni modifier, ni supprimer les voyages existants.
- Rien n'est créé dans « Mes voyages » sans le clic de Mikael.

## Approches
- A. Connecteur officiel Supabase (MCP) : écarté — SQL administrateur, contourne les règles d'accès, déconseillé par Supabase sur des données réelles, risque d'injection d'instructions depuis les pages web lues.
- **B. Connecteur sur mesure (retenu)** : un serveur MCP minimal dans une fonction Supabase, qui n'expose que deux outils.
- C. Garder le copier-coller : écarté (c'est ce qu'on veut supprimer).

## Conception
1. **Adresse secrète** (comme le calendrier) : table `connector_links` (utilisateur, jeton aléatoire de 32 octets stocké **haché** SHA-256, actif, date). Dans **Réglages → Connecteur Claude** : créer, copier l'adresse, révoquer. Une seule adresse active par utilisateur ; la révocation est immédiate.
2. **Fonction Supabase `claude-connector`** (sans connexion Supabase ; jeton envoyé dans l'en-tête `Authorization: Bearer <jeton>`, réglé dans claude.ai via « Request headers » avec l'option « No sign in » ; repli accepté : `?token=` dans l'adresse) : serveur MCP (HTTP « streamable ») avec deux outils :
   - `get_itinerary_format` : renvoie les consignes et le format JSON v1 de l'itinéraire (même texte que la demande actuelle de l'appli, avec coordonnées GPS, fuseau, transports, meilleure période, checklist, budget), plus les dernières réponses du questionnaire de Mikael (voyageurs, ville de départ, budget, profil) pour que Claude en tienne compte.
   - `create_trip_draft` : paramètres `startDate`, `endDate` (obligatoires, AAAA-MM-JJ), `destination`, `itinerary` (l'objet JSON v1). L'itinéraire passe par **la même validation que l'appli** (plafonds, liens https, texte brut, dates). Résultat : un brouillon `ai_drafts` au stade « itinéraire reçu », pour le seul utilisateur du jeton, avec le brief repris du dernier questionnaire et les dates données. Réponse à Claude : nombre de jours/étapes, avertissements éventuels et lien direct `…/#/ia/<id>`.
3. **Garde-fous** : réponse 401 sans jeton valide ; corps limité à 200 000 caractères ; au plus 20 brouillons par jour et par utilisateur ; aucun autre accès à la base ; le texte reçu n'est jamais interprété (mêmes règles que le copier-coller).
4. **Brouillon à valider** : l'appli l'affiche dans « Brouillons IA » ; l'écran de contrôle habituel permet de vérifier puis « Créer le voyage » (placement GPS, trajets, checklist, budget comme aujourd'hui).
5. **Mise en service par Mikael** : coller la migration `0007` dans Supabase, déployer la fonction (`supabase functions deploy claude-connector --no-verify-jwt`), créer l'adresse dans Réglages, l'ajouter dans claude.ai → Personnaliser → Connecteurs → Ajouter un connecteur personnalisé.

## Contraintes
- Code de validation partagé avec l'appli (copie automatique `npm run sync:domain`, étendue à `src/ai`).
- Tests : SQL (accès propriétaire, jeton haché, révocation), logique de la fonction testée sans serveur (comme `routes/ors.ts`), interface Réglages.

## Laissé au constructeur
Détails du protocole MCP (version, en-têtes), message exact des consignes, mise en page de la section Réglages.

## Vérifié (support Claude, 2026-11-21)
- claude.ai accepte un connecteur personnalisé « No sign in » avec un en-tête de requête fixe ; offres Free (1 connecteur) à Max ; disponible ensuite sur mobile et dans Claude Code.

## À vérifier pendant la construction
- Transport « Streamable HTTP » et version du protocole MCP acceptés par claude.ai (essai réel par Mikael après déploiement).
