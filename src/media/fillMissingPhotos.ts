import type { Stop } from '../domain/types';
import { isBadPhotoUrl, isTransportStop, type StopPhoto } from './autoPhoto';

export interface FillMissingPhotosOptions {
  /** Identifiants des étapes à traiter, dans l'ordre. */
  stopIds: string[];
  /** Relit l'étape à jour (null si elle a été supprimée). */
  getStop(id: string): Promise<Stop | null>;
  /** Cherche une photo pour une étape (null si aucune). */
  find(stop: Stop): Promise<StopPhoto | null>;
  /** Enregistre la photo trouvée sur l'étape à jour ; `null` = effacer la photo (photoUrl, crédit, licence à null). */
  save(stop: Stop, photo: StopPhoto | null): Promise<void>;
  /** Vrai quand il faut s'arrêter (démontage, modification en cours...). */
  isCancelled(): boolean;
  /** Appelé une fois par étape traitée (trouvée ou non, même en erreur) : à marquer comme essayée. */
  onAttempt?(id: string): void;
}

/**
 * Remplit les photos manquantes (et nettoie les mauvaises : PDF/DjVu, ou photo sur une étape de transport), une étape à la fois, jusqu'à la fin de la liste :
 * une étape sans photo trouvée ou en erreur n'empêche pas les suivantes.
 */
export async function fillMissingPhotos(o: FillMissingPhotosOptions): Promise<void> {
  for (const id of o.stopIds) {
    if (o.isCancelled()) return;
    let attempted = false;
    const attempt = () => { if (!attempted) { attempted = true; o.onAttempt?.(id); } };
    try {
      const stop = await o.getStop(id);
      if (!stop || stop.kind === 'lodging' || !stop.title.trim()) {
        attempt();
        continue;
      }
      const transport = isTransportStop(stop.title);
      if (stop.photoUrl) {
        if (!isBadPhotoUrl(stop.photoUrl) && !transport) {
          attempt();
          continue;
        }
        await o.save(stop, null);
        if (transport) {
          attempt();
          continue;
        }
      } else if (transport) {
        attempt();
        continue;
      }
      const photo = await o.find(stop);
      if (o.isCancelled()) return;
      attempt();
      if (!photo) continue;
      // Relecture juste avant l'écriture : l'étape a pu changer pendant la recherche.
      const latest = await o.getStop(id);
      if (latest && (!latest.photoUrl || isBadPhotoUrl(latest.photoUrl))) await o.save(latest, photo);
    } catch {
      attempt();
    }
  }
}
