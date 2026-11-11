import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TestAppProvider } from '../../app/AppContext';
import { createMemoryRepository } from '../../data/memoryRepository';
import type { BudgetData } from '../../domain/budget/types';
import { createFakeFx } from '../../fx/fakeFx';
import { FxError, type FxService } from '../../fx/FxService';
import { makeReservation } from '../../test/factories';
import { ExpenseForm } from './ExpenseForm';

const data: BudgetData = {
  travelers: [
    { id: 'a', tripId: 't', name: 'Alice', position: 0 },
    { id: 'b', tripId: 't', name: 'Bob', position: 1 },
  ],
  lines: [{ id: 'L1', tripId: 't', category: 'food', label: 'Repas', amount: 40, currency: 'EUR', mode: 'fixed', position: 0, rateToEur: 1, rateManual: false, rateDate: '2026-11-11' }],
  expenses: [],
};
const reservations = [makeReservation({ id: 'R1', type: 'lodging', title: 'Hôtel', price: 500, currency: 'EUR' })];
const downFx: FxService = { getRate: async () => { throw new FxError('UNAVAILABLE'); }, listCurrencies: async () => ['EUR', 'JPY'] };

function setup(fx: FxService = createFakeFx(), localCurrency = 'JPY') {
  const onSave = vi.fn();
  render(
    <TestAppProvider repo={createMemoryRepository()} fx={fx}>
      <ExpenseForm tripId="t" data={data} reservations={reservations} localCurrency={localCurrency} disabled={false} onSave={onSave} onCancel={() => {}} />
    </TestAppProvider>,
  );
  return { onSave, user: userEvent.setup() };
}
async function fill(user: ReturnType<typeof userEvent.setup>, amount: string, date = '2026-12-01') {
  await user.clear(screen.getByLabelText('Date'));
  await user.type(screen.getByLabelText('Date'), date);
  await user.type(screen.getByLabelText('Montant'), amount);
}

describe('ExpenseForm', () => {
  it('convertit une dépense en yens au taux figé du jour', async () => {
    const { onSave, user } = setup();
    await fill(user, '10 000');
    await waitFor(() => expect(screen.getByLabelText(/^Taux/)).toHaveValue('0.0061'));
    expect(screen.getByText('≈ 61,00 €')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      tripId: 't', amount: 10000, currency: 'JPY', rateToEur: 0.0061, rateManual: false, paidBy: 'a', participantIds: ['a', 'b'], lineId: null, reservationId: null, date: '2026-12-01',
    }));
  });

  it.each([['-3'], [''], ['12,345'], ['abc']])('refuse le montant « %s »', async (value) => {
    const { onSave, user } = setup(createFakeFx(), 'EUR');
    if (value) await user.type(screen.getByLabelText('Montant'), value);
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(screen.getByText('Montant invalide (2 décimales au plus).')).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('refuse un montant nul', async () => {
    const { onSave, user } = setup(createFakeFx(), 'EUR');
    await user.type(screen.getByLabelText('Montant'), '0');
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(screen.getByText('Le montant doit être supérieur à 0.')).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('exige au moins une personne concernée', async () => {
    const { onSave, user } = setup(createFakeFx(), 'EUR');
    await user.type(screen.getByLabelText('Montant'), '20');
    await user.click(screen.getByRole('checkbox', { name: 'Alice' }));
    await user.click(screen.getByRole('checkbox', { name: 'Bob' }));
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(screen.getByText('Choisis au moins une personne concernée.')).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('refuse l’enregistrement sans taux, puis accepte un taux saisi à la main', async () => {
    const { onSave, user } = setup(downFx);
    await fill(user, '1000');
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(await screen.findByText('Impossible d’obtenir le taux : saisis-le à la main.')).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
    await user.type(screen.getByLabelText(/^Taux/), '0,006');
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ rateToEur: 0.006, rateManual: true }));
  });

  it('rattache à une ligne ou à une réservation, jamais aux deux', async () => {
    const { onSave, user } = setup(createFakeFx(), 'EUR');
    await user.type(screen.getByLabelText('Montant'), '30');
    await user.selectOptions(screen.getByLabelText('Rattachée à'), 'line:L1');
    await user.selectOptions(screen.getByLabelText('Rattachée à'), 'res:R1');
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ lineId: null, reservationId: 'R1' }));
  });
});
