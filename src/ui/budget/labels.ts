import type { BudgetCategory, LineMode } from '../../domain/budget/types';

export const CATEGORY_LABELS: Record<BudgetCategory, string> = {
  flight: 'Vols', lodging: 'Hébergement', local_transport: 'Transports sur place', food: 'Repas',
  activity: 'Activités', shopping: 'Achats', contingency: 'Imprévus', other: 'Autre',
};

export const MODE_LABELS: Record<LineMode, string> = {
  fixed: 'Montant fixe', per_person: 'Par personne', per_day: 'Par jour', per_person_per_day: 'Par personne et par jour',
};
