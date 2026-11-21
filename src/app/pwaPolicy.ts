/** Délai après l'ouverture pendant lequel on peut recharger sans risquer de perdre une saisie. */
export const STARTUP_MS = 15000;

/** Appliquer une nouvelle version maintenant ? Oui au démarrage ou quand la page n'est pas visible. */
export function applyNow(s: { hidden: boolean; msSinceLoad: number }): boolean {
  return s.hidden || s.msSinceLoad < STARTUP_MS;
}
