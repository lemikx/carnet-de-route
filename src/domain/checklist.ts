import type { ChecklistCategory, ChecklistItem } from './types';

export const CHECKLIST_CATEGORIES: { id: ChecklistCategory; label: string }[] = [
  { id: 'documents', label: 'Documents' },
  { id: 'health', label: 'Santé' },
  { id: 'luggage', label: 'Valise' },
  { id: 'before_departure', label: 'Avant le départ' },
];

export const DEFAULT_CHECKLIST: { category: ChecklistCategory; label: string }[] = [
  { category: 'documents', label: 'Passeport valide (6 mois après le retour)' },
  { category: 'documents', label: 'Visa / autorisation d’entrée' },
  { category: 'documents', label: 'Assurance voyage' },
  { category: 'documents', label: 'Permis de conduire international' },
  { category: 'documents', label: 'Copies des documents' },
  { category: 'health', label: 'Vaccins recommandés' },
  { category: 'health', label: 'Trousse à pharmacie' },
  { category: 'health', label: 'Ordonnances' },
  { category: 'luggage', label: 'Adaptateur de prise' },
  { category: 'luggage', label: 'Chargeurs' },
  { category: 'luggage', label: 'Vêtements adaptés à la météo' },
  { category: 'before_departure', label: 'Prévenir la banque' },
  { category: 'before_departure', label: 'Forfait téléphone à l’étranger' },
  { category: 'before_departure', label: 'Télécharger les cartes hors ligne' },
  { category: 'before_departure', label: 'Générer et partager le roadbook' },
];

export function checklistProgress(items: ChecklistItem[]): { done: number; total: number } {
  return { done: items.filter((i) => i.done).length, total: items.length };
}

export function isOverdue(item: ChecklistItem, today: string): boolean {
  return !item.done && item.dueDate !== null && item.dueDate < today;
}
