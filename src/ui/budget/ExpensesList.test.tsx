import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useCallback, useEffect, useState } from 'react';
import { TestAppProvider, useApp } from '../../app/AppContext';
import { createMemoryRepository } from '../../data/memoryRepository';
import type { BudgetData } from '../../domain/budget/types';
import { ExpensesList } from './ExpensesList';

async function setup(failures = 0, withExpense = false) {
  const repo = createMemoryRepository();
  const trip = await repo.createTrip({ name: 'Japon', countries: [], startDate: '2026-12-01', endDate: '2026-12-05', localCurrency: 'EUR', homeTimezone: 'Europe/Paris', updatedAt: '' });
  await repo.saveTraveler({ tripId: trip.id, name: 'Alice', position: 0 });
  await repo.saveTraveler({ tripId: trip.id, name: 'Bob', position: 1 });
  if (withExpense) {
    const [alice] = (await repo.getBudget(trip.id)).travelers;
    await repo.saveExpense({ tripId: trip.id, date: '2026-12-01', category: 'food', label: 'Ramen', amount: 12, currency: 'EUR', rateToEur: 1, rateManual: false, paidBy: alice.id, participantIds: [alice.id], lineId: null, reservationId: null });
  }
  const real = repo.saveExpense.bind(repo);
  let left = failures;
  repo.saveExpense = async (e) => {
    if (left-- > 0) throw new Error('réseau');
    return real(e);
  };
  function Harness() {
    const { repo: r } = useApp();
    const [data, setData] = useState<BudgetData | null>(null);
    const reload = useCallback(async () => setData(await r.getBudget(trip.id)), [r]);
    useEffect(() => void reload(), [reload]);
    if (!data) return null;
    return <ExpensesList tripId={trip.id} data={data} reservations={[]} localCurrency="EUR" disabled={false} onChange={reload} />;
  }
  render(<TestAppProvider repo={repo}><Harness /></TestAppProvider>);
  return { repo, trip, user: userEvent.setup() };
}

describe('ExpensesList', () => {
  it('ajoute puis affiche une dépense', async () => {
    const { repo, trip, user } = await setup();
    await user.click(await screen.findByRole('button', { name: 'Ajouter une dépense' }));
    await user.type(screen.getByLabelText('Libellé'), 'Dîner');
    await user.type(screen.getByLabelText('Montant'), '60');
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(await screen.findByText('Dîner')).toBeInTheDocument();
    expect((await repo.getBudget(trip.id)).expenses[0]).toMatchObject({ amount: 60, paidBy: expect.any(String) });
  });

  it('garde la saisie et réessaie vraiment après un échec', async () => {
    const { repo, trip, user } = await setup(1);
    await user.click(await screen.findByRole('button', { name: 'Ajouter une dépense' }));
    await user.type(screen.getByLabelText('Libellé'), 'Taxi');
    await user.type(screen.getByLabelText('Montant'), '25');
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(await screen.findByText('Enregistrement impossible.')).toBeInTheDocument();
    expect(screen.getByLabelText('Libellé')).toHaveValue('Taxi');
    await user.click(screen.getByRole('button', { name: 'Réessayer' }));
    await waitFor(async () => expect((await repo.getBudget(trip.id)).expenses).toHaveLength(1));
    expect(await screen.findByText('Taxi')).toBeInTheDocument();
    expect(screen.queryByLabelText('Libellé')).toBeNull();
  });

  it('supprime une dépense après confirmation', async () => {
    const { repo, trip, user } = await setup(0, true);
    await user.click(await screen.findByRole('button', { name: 'Supprimer' }));
    await user.click(screen.getByRole('dialog').querySelector('button.btn-danger') as HTMLButtonElement);
    await waitFor(async () => expect((await repo.getBudget(trip.id)).expenses).toHaveLength(0));
  });
});
