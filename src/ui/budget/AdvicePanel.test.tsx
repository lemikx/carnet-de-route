import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Advice } from '../../domain/budget/advice';
import type { BudgetLine } from '../../domain/budget/types';
import { AdvicePanel } from './AdvicePanel';

const lines: BudgetLine[] = [
  { id: 'L1', tripId: 't', category: 'food', label: 'Repas', amount: 40, currency: 'EUR', mode: 'per_person_per_day', position: 0, rateToEur: 1, rateManual: false, rateDate: '2026-11-11' },
  { id: 'L2', tripId: 't', category: 'activity', label: 'Excursion', amount: 120, currency: 'EUR', mode: 'fixed', position: 1, rateToEur: 1, rateManual: false, rateDate: '2026-11-11' },
];

describe('AdvicePanel', () => {
  it('propose une baisse proportionnelle avec son économie, et l’applique', async () => {
    const advice: Advice = { kind: 'proportional', savingCents: 4003, suffices: true, changes: [{ lineId: 'L1', newAmount: 32 }, { lineId: 'L2', newAmount: 100 }] };
    const onApply = vi.fn();
    render(<AdvicePanel advice={[advice]} lines={lines} onApply={onApply} disabled={false} />);
    expect(screen.getByText(/Économie : 40,03 €/)).toBeInTheDocument();
    expect(screen.getByText(/suffit à revenir dans l’enveloppe/)).toBeInTheDocument();
    expect(screen.getByText(/Repas : 32,00 au lieu de 40,00/)).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Appliquer' }));
    expect(onApply).toHaveBeenCalledWith(advice);
  });

  it('dit quand une piste ne suffit pas', () => {
    render(<AdvicePanel advice={[{ kind: 'drop_largest', lineId: 'L2', savingCents: 12000, suffices: false }]} lines={lines} onApply={() => {}} disabled={false} />);
    expect(screen.getByText(/Retirer « Excursion »/)).toBeInTheDocument();
    expect(screen.getByText(/ne suffit pas/)).toBeInTheDocument();
  });

  it('propose de réduire la marge de change', () => {
    render(<AdvicePanel advice={[{ kind: 'reduce_margin', savingCents: 184, suffices: false, newMarginPct: 1 }]} lines={lines} onApply={() => {}} disabled={false} />);
    expect(screen.getByText(/Réduire la marge de sécurité à 1 %/)).toBeInTheDocument();
  });

  it('n’affiche rien sans piste', () => {
    const { container } = render(<AdvicePanel advice={[]} lines={lines} onApply={() => {}} disabled={false} />);
    expect(container).toBeEmptyDOMElement();
  });
});
