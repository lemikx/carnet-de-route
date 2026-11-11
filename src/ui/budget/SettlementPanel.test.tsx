import { render, screen } from '@testing-library/react';
import type { BudgetData, Expense } from '../../domain/budget/types';
import { SettlementPanel } from './SettlementPanel';

const travelers = [
  { id: 'a', tripId: 't', name: 'Alice', position: 0 },
  { id: 'b', tripId: 't', name: 'Bob', position: 1 },
  { id: 'c', tripId: 't', name: 'Chloé', position: 2 },
];
const exp = (paidBy: string, cents: number, participantIds: string[]): Expense => ({
  id: 'e' + Math.random(), tripId: 't', date: '2026-12-01', category: 'food', label: 'x', amount: cents / 100, currency: 'EUR', rateToEur: 1,
  rateManual: false, paidBy, participantIds, lineId: null, reservationId: null,
});
const data = (expenses: Expense[]): BudgetData => ({ travelers, lines: [], expenses });

describe('SettlementPanel', () => {
  it('dit qui doit combien à qui', () => {
    render(<SettlementPanel data={data([exp('a', 3000, ['a', 'b', 'c'])])} />);
    expect(screen.getByText('Bob doit 10,00 € à Alice')).toBeInTheDocument();
    expect(screen.getByText('Chloé doit 10,00 € à Alice')).toBeInTheDocument();
  });
  it('affiche le coût par personne', () => {
    render(<SettlementPanel data={data([exp('a', 1000, ['a', 'b', 'c'])])} />);
    expect(screen.getByText('Alice : 3,34 €')).toBeInTheDocument();
    expect(screen.getByText('Bob : 3,33 €')).toBeInTheDocument();
  });
  it('annonce que tout est équilibré', () => {
    render(<SettlementPanel data={data([])} />);
    expect(screen.getByText('Tout est équilibré.')).toBeInTheDocument();
  });
});
