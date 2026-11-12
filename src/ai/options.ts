export interface Option { id: string; label: string }

export const TRAVELER_TYPES: Option[] = [
  { id: 'adventurer', label: 'Aventurier' }, { id: 'cultural', label: 'Culturel' }, { id: 'relaxed', label: 'Détente' },
  { id: 'foodie', label: 'Gourmand' }, { id: 'sporty', label: 'Sportif' }, { id: 'nature', label: 'Nature' },
  { id: 'romantic', label: 'Romantique' }, { id: 'family', label: 'Famille' }, { id: 'party', label: 'Fêtard' },
];
export const TRIP_TYPES: Option[] = [
  { id: 'city_stay', label: 'Séjour dans une ville' }, { id: 'circuit', label: 'Circuit itinérant' },
  { id: 'beach', label: 'Séjour balnéaire' }, { id: 'trek', label: 'Randonnée ou trek' },
  { id: 'road_trip', label: 'Road trip' }, { id: 'long_weekend', label: 'Week-end prolongé' },
];
export const WISHES: Option[] = [
  { id: 'beaches', label: 'Plages' }, { id: 'history', label: 'Histoire et musées' },
  { id: 'landscapes', label: 'Paysages et nature' }, { id: 'food', label: 'Gastronomie' },
  { id: 'local', label: 'Vie locale et hors des sentiers battus' }, { id: 'shopping', label: 'Shopping' },
  { id: 'nightlife', label: 'Vie nocturne' }, { id: 'sports', label: 'Activités sportives' },
  { id: 'wellness', label: 'Bien-être et spa' }, { id: 'photo', label: 'Photographie' },
  { id: 'parks', label: "Parcs d'attractions" },
];
export const LODGINGS: Option[] = [
  { id: 'hotel', label: 'Hôtel' }, { id: 'apartment', label: 'Appartement' }, { id: 'hostel', label: 'Auberge de jeunesse' },
  { id: 'guesthouse', label: "Chambre d'hôtes" }, { id: 'camping', label: 'Camping' },
  { id: 'resort', label: 'Resort tout compris' }, { id: 'ecolodge', label: 'Écolodge' },
];
export const PACES: Option[] = [
  { id: 'calm', label: 'Tranquille' }, { id: 'balanced', label: 'Équilibré' }, { id: 'intense', label: 'Intense' },
];

export function labelsOf(list: Option[], ids: string[]): string[] {
  return ids.map((id) => list.find((o) => o.id === id)?.label ?? id);
}
