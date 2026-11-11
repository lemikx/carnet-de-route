import { render, screen } from '@testing-library/react';
import { SummaryPanel } from './SummaryPanel';
import { computeBudget } from '../../domain/budget/projection';
import type { PlannedItem } from '../../domain/budget/planned';
import type { BudgetSettings, Expense } from '../../domain/budget/types';

const item = (key: string, plannedCents: number): PlannedItem => ({ key, source: 'line', category: 'food', label: key, currency: 'EUR', plannedCents, baseCents: plannedCents, missingRate: false });
const exp = (cents: number, lineId: string | null): Expense => ({
  id: 'e' + Math.random(), tripId: 't', date: '2026-12-01', category: 'food', label: 'x', amount: cents / 100, currency: 'EUR', rateToEur: 1,
  rateManual: false, paidBy: 'a', participantIds: ['a'], lineId, reservationId: null,
});
const settings = (cap: number | null): BudgetSettings => ({ cap, capMode: 'total', fxMarginPct: 3 });
const summary = (cap: number | null, expenses: Expense[] = []) =>
  computeBudget({ items: [item('L1', 10000), item('L2', 5000)], expenses, settings: settings(cap), travelers: 2 });

describe('SummaryPanel', () => {
  it('affiche prévu, projection et réel', () => {
    render(<SummaryPanel summary={summary(null, [exp(3000, null)])} travelers={2} />);
    expect(screen.getByTestId('planned-total')).toHaveTextContent('150,00 €');
    expect(screen.getByTestId('projection-total')).toHaveTextContent('180,00 €');
    expect(screen.getByTestId('actual-total')).toHaveTextContent('30,00 €');
    expect(screen.getByText(/Par personne/)).toHaveTextContent('90,00 €');
  });

  it('prévient en orange quand la projection dépasse l’enveloppe', () => {
    render(<SummaryPanel summary={summary(130, [])} travelers={2} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Tu dépasses l’enveloppe de 20,00 €');
    expect(screen.getByRole('alert')).toHaveClass('alert-warning');
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  it('prévient en rouge quand le réel dépasse déjà l’enveloppe', () => {
    render(<SummaryPanel summary={summary(100, [exp(12000, 'L1')])} travelers={2} />);
    const alerts = screen.getAllByRole('alert').map((a) => a.textContent?.replace(/\s/g, ' '));
    expect(alerts.some((t) => t?.includes('Le réel dépasse déjà l’enveloppe de 20,00 €'))).toBe(true);
    expect(screen.getByText(/Le réel dépasse déjà/).closest('[role="alert"]')).toHaveClass('alert-danger');
  });

  it('n’affiche aucune alerte sans enveloppe', () => {
    render(<SummaryPanel summary={summary(null, [exp(20000, 'L1')])} travelers={2} />);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByRole('progressbar')).toBeNull();
  });

  it('nomme la ligne qui dépasse son prévu', () => {
    render(<SummaryPanel summary={summary(1000, [exp(12000, 'L1')])} travelers={2} labelOf={(k) => (k === 'L1' ? 'Repas' : k)} />);
    expect(screen.getByText(/« Repas » dépasse son prévu de 20,00 €/)).toBeInTheDocument();
  });

  it('n’affiche pas de coût par personne sans voyageur', () => {
    render(<SummaryPanel summary={summary(null)} travelers={0} />);
    expect(screen.getByText(/Par personne/)).toHaveTextContent('—');
  });
});
