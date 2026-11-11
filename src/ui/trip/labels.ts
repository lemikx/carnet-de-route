import type { ContactKind, ReservationType, StopKind, TravelMode } from '../../domain/types';

export const MODE_LABELS: Record<TravelMode, string> = {
  car: 'Voiture', walk: 'À pied', bike: 'Vélo', train: 'Train', bus: 'Bus', plane: 'Avion', ferry: 'Ferry', other: 'Autre',
};
export const KIND_LABELS: Record<StopKind, string> = { activity: 'Activité', lodging: 'Hébergement', point: 'Point de passage' };
export const RESERVATION_LABELS: Record<ReservationType, string> = {
  flight: 'Vol', lodging: 'Hébergement', car_rental: 'Location de voiture', train: 'Train', activity: 'Activité ou billet', other: 'Autre',
};
export const CONTACT_LABELS: Record<ContactKind, string> = {
  embassy: 'Ambassade / consulat', emergency: 'Urgences', lodging: 'Hébergement', other: 'Autre',
};
