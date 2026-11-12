# Meilleure période pour partir + saisie des dates — conception courte

Demande de Mikael : aider à **choisir la destination** en affichant la meilleure période pour y aller, et simplifier la saisie des dates.

## Intention
- En « Surprends-moi », voir pour chaque idée quand le pays est agréable ou à éviter (météo, affluence), pour choisir en connaissance de cause.
- Choisir un départ ne doit plus obliger à rechercher à nouveau l'année et le mois du retour.

## Décisions (validées par Mikael)
1. **Période conseillée** : nouveau champ `bestPeriod` dans chaque idée de la réponse de Claude (protocole v1, champ facultatif) :
   `{ "text": "…", "goodMonths": [11,12,1,2], "avoidMonths": [3,4] }` (mois 1 à 12 ; texte ≤ 500 caractères).
2. **Affichage** : sur chaque carte d'idée, le texte, puis une phrase **calculée par l'appli** comparant les dates du voyage : bonne période (vert), période moyenne (neutre), à éviter (orange). Toujours « Information donnée par l'IA : à vérifier ».
3. **« Je sais où aller »** : pas d'écran d'idées ; le même bloc s'affiche sur l'écran de contrôle, à partir de `trip.bestPeriod` (même champ facultatif dans la réponse « itinéraire »).
4. **Aucune conservation** : rien dans le voyage, le roadbook, ni la base de données (pas de migration). Les brouillons gardent la réponse brute (déjà en jsonb).
5. **Réponse sans ce champ** : acceptée, le bloc est simplement absent. Mois invalides (hors 1 à 12, non entiers) : ignorés avec avertissement.
6. **Dates** : dans le questionnaire et le formulaire « Nouveau voyage », choisir le départ remplit le retour avec la même date si le retour est vide ou antérieur au départ.

## Hors périmètre
Conservation dans le roadbook, météo détaillée par mois, calcul d'après une base de données externe.

## Approches
Texte seul de Claude (écarté : moins utile pour choisir) ; texte + mois structurés avec phrase calculée (retenu) ; conservation dans le voyage (écartée par Mikael).
