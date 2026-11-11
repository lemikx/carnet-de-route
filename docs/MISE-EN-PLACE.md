# Mise en place de Carnet de route

Ce guide te fait passer de l'appli en mode démonstration à ta propre appli, synchronisée entre ton Mac et ton iPhone.
Compte environ 30 minutes la première fois. Tout est gratuit.

> **Mode démonstration** : sans configuration, l'appli fonctionne déjà, mais les données restent dans le navigateur
> (pas de synchronisation, pas de lien de partage utilisable par d'autres, pas d'abonnement calendrier, trajets simulés).

---

## 1. Créer le projet Supabase (base de données + connexion)

1. Va sur <https://supabase.com>, crée un compte gratuit puis **New project**.
   - Nom : `carnet-de-route` ; région : **Europe (Paris ou Frankfurt)** ; note bien le mot de passe de la base.
2. Dans **Project Settings → API**, note :
   - **Project URL** (ex. `https://abcd1234.supabase.co`)
   - la clé **anon public** (elle n'est pas secrète : elle est faite pour être dans l'appli).
   - ⚠️ Ne copie **jamais** la clé `service_role` nulle part : elle reste chez Supabase.

## 2. Installer les outils sur ton Mac (une seule fois)

Dans le Terminal :

```bash
brew install supabase/tap/supabase
```

(Si tu n'as pas Homebrew : <https://brew.sh>.)

Puis récupère le projet :

```bash
git clone https://github.com/lemikx/carnet-de-route.git
```

```bash
cd carnet-de-route && npm install
```

## 3. Créer les tables et les règles de sécurité

```bash
supabase login
```

```bash
supabase link --project-ref TON_REF_DE_PROJET
```

(`TON_REF_DE_PROJET` = la partie `abcd1234` de l'URL du projet.)

```bash
supabase db push
```

Cela crée les tables, les règles d'accès (chacun ne voit que ses données), le partage et l'abonnement calendrier.

## 4. Activer la connexion par e-mail

Dans Supabase → **Authentication** :

1. **Providers → Email** : activé (c'est le cas par défaut). Garde « Confirm email » activé.
2. **URL Configuration** :
   - **Site URL** : `https://lemikx.github.io/carnet-de-route/`
   - **Redirect URLs** : ajoute `https://lemikx.github.io/carnet-de-route/**`

## 5. Clé OpenRouteService (calcul des trajets)

1. Crée un compte gratuit sur <https://openrouteservice.org/dev/#/signup> puis une clé (**Request a token**, offre *Standard*).
2. Enregistre-la **toi-même** comme secret Supabase — ne la colle jamais dans une conversation ni dans un fichier du projet :

```bash
supabase secrets set ORS_API_KEY=colle-ta-cle-ici
```

## 6. Déployer les deux fonctions serveur

```bash
npm run sync:domain
```

```bash
supabase functions deploy routes
```

```bash
supabase functions deploy calendar --no-verify-jwt
```

- `routes` : calcule les trajets (réservée aux utilisateurs connectés).
- `calendar` : sert l'abonnement calendrier ; protégée par l'adresse secrète, car Calendrier d'Apple ne sait pas se connecter.

## 7. Publier l'appli sur GitHub Pages

Sur GitHub, dans le dépôt `carnet-de-route` :

1. **Settings → Secrets and variables → Actions → onglet Variables → New repository variable**, crée :
   - `VITE_DATA` = `supabase`
   - `VITE_SUPABASE_URL` = l'URL du projet (étape 1)
   - `VITE_SUPABASE_ANON_KEY` = la clé anon public (étape 1)
2. **Settings → Pages → Build and deployment → Source** : **GitHub Actions**.
3. Fusionne la branche de travail dans `main` : le déploiement se lance tout seul (onglet **Actions**).
4. L'appli est alors à l'adresse : <https://lemikx.github.io/carnet-de-route/>

## 8. Installer l'appli

- **Mac** : ouvre l'adresse dans **Safari** → menu **Fichier → Ajouter au Dock**.
- **iPhone** : ouvre l'adresse dans **Safari** → bouton **Partager** → **Sur l'écran d'accueil**.

Connecte-toi avec ton e-mail sur chaque appareil (lien reçu par e-mail, à ouvrir **sur l'appareil où tu te connectes**).

Puis dans **Réglages → Nom affiché sur les roadbooks partagés**, saisis `lemikxfamily` et enregistre : c'est le nom que verra ta famille.

## 9. Vérifications à faire une fois (5 minutes)

- [ ] Créer un voyage sur le Mac → il apparaît sur l'iPhone.
- [ ] Ajouter deux étapes avec une adresse → la durée du trajet s'affiche.
- [ ] Roadbook → **Exporter en PDF** → sur iPhone : Partager → **Enregistrer dans Fichiers**.
- [ ] Roadbook → **Créer un lien** → l'ouvrir sur un autre téléphone (sans compte) : visible, sans numéros de réservation.
- [ ] Calendrier → **Télécharger (.ics)** → s'ouvre dans Calendrier.
- [ ] Calendrier → **S'abonner** → Calendrier propose l'abonnement ; une modification du voyage apparaît après la mise à jour (environ 1 h).
- [ ] Mode avion sur l'iPhone → le voyage déjà ouvert reste consultable.

## En cas de problème

| Symptôme | Cause probable | Solution |
|---|---|---|
| Le lien de connexion ouvre une page d'erreur | URL de redirection absente | Étape 4 |
| « Calcul impossible : reconnecte-toi » | Session expirée | Se déconnecter / reconnecter |
| « Calcul indisponible pour aujourd'hui » | Limite gratuite OpenRouteService atteinte | Saisir la durée à la main, ça repart le lendemain |
| L'abonnement calendrier ne se met pas à jour | Calendrier vérifie environ toutes les heures | Patienter ou forcer : Calendrier → Actualiser |
