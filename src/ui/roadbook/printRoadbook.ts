/** Lance l'impression (PDF) après le chargement des cartes, 3 s au maximum. */
export function printWhenReady(waitForTiles: Promise<void>, maxWaitMs = 3000): Promise<void> {
  return Promise.race([waitForTiles, new Promise<void>((r) => setTimeout(r, maxWaitMs))]).then(() => window.print());
}
