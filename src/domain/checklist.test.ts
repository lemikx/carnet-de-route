import { checklistProgress, DEFAULT_CHECKLIST, isOverdue } from './checklist';
import type { ChecklistItem } from './types';

const item = (over: Partial<ChecklistItem>): ChecklistItem => ({
  id: 'c', tripId: 't', category: 'documents', label: 'Passeport', done: false, dueDate: null, position: 0, ...over,
});

describe('checklist', () => {
  it('contient 15 éléments par défaut dans les 4 catégories', () => {
    expect(DEFAULT_CHECKLIST).toHaveLength(15);
    expect(new Set(DEFAULT_CHECKLIST.map((i) => i.category))).toEqual(new Set(['documents', 'health', 'luggage', 'before_departure']));
  });
  it('calcule la progression', () => {
    expect(checklistProgress([item({ done: true }), item({ done: true }), item({})])).toEqual({ done: 2, total: 3 });
  });
  it('détecte une échéance dépassée', () => {
    expect(isOverdue(item({ dueDate: '2026-11-10' }), '2026-11-11')).toBe(true);
    expect(isOverdue(item({ dueDate: '2026-11-10', done: true }), '2026-11-11')).toBe(false);
    expect(isOverdue(item({}), '2026-11-11')).toBe(false);
    expect(isOverdue(item({ dueDate: '2026-11-11' }), '2026-11-11')).toBe(false);
  });
});
