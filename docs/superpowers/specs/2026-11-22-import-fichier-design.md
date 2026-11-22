# Import d'un fichier de voyage (option C) — conception courte

Demande de Mikael : importer directement un fichier (JSON ou autre) venant d'une autre IA ; le convertir au format de l'appli. Choix : C (bouton dans l'appli + relais par Claude via le connecteur quand le fichier n'est pas reconnu).

- Bouton « Importer un fichier » dans Mes voyages ; fichiers .json, .txt, .md (lus dans le navigateur, ≤ 200 000 caractères).
- Format v1 de l'appli : accepté tel quel. Autre JSON : conversion par reconnaissance de champs courants (FR/EN) — jours, étapes/activités, titre, heure, durée (« 2h », « 1h30 », « 90 min »), lieu/adresse, latitude/longitude, notes, nom du voyage, pays, devise. Texte libre non converti (trop ambigu sans IA).
- Dates : reprises du fichier si présentes, sinon demandées dans le formulaire d'import.
- Résultat : brouillon « itinéraire reçu » (brief = dernier questionnaire + dates + destination), ouvert sur l'écran de contrôle ; « Créer le voyage » comme d'habitude.
- Non reconnu : message + phrase à copier pour Claude avec le connecteur : « Avec Carnet de route, importe ce voyage » (le fichier joint à la conversation).
- Même validation que le copier-coller (plafonds, liens https, texte brut).
