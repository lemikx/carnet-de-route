import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { TestAppProvider } from '../../app/AppContext';
import { createMemoryRepository } from '../../data/memoryRepository';
import type { TripBundle } from '../../domain/types';
import { BudgetTab } from './BudgetTab';

async function setup(opts: { travelers?: string[] } = {}) {
  const repo = createMemoryRepository();
  const trip = await repo.createTrip({ name: 'Japon', countries: [], startDate: '2026-12-01', endDate: '2026-12-05', localCurrency: 'JPY', homeTimezone: 'Europe/Paris', updatedAt: '' });
  const created = [];
  for (const [i, name] of (opts.travelers ?? []).entries()) created.push(await repo.saveTraveler({ tripId: trip.id, name, position: i }));
  function Harness({ initial }: { initial: TripBundle }) {
    const [bundle, setBundle] = useState(initial);
    return <BudgetTab bundle={bundle} setBundle={setBundle} reload={async () => setBundle(await repo.getBundle(trip.id))} />;
  }
  render(
    <TestAppProvider repo={repo}>
      <Harness initial={await repo.getBundle(trip.id)} />
    </TestAppProvider>,
  );
  return { repo, trip, created, user: userEvent.setup() };
}

describe('BudgetTab — voyageurs', () => {
  it('demande d’abord qui voyage, sans montrer le reste', async () => {
    const { repo, trip, user } = await setup();
    expect(await screen.findByText('Combien êtes-vous ?')).toBeInTheDocument();
    expect(screen.queryByText('Enveloppe maximale')).toBeNull();
    await user.clear(screen.getByLabelText('Nombre de voyageurs'));
    await user.type(screen.getByLabelText('Nombre de voyageurs'), '2');
    await user.type(screen.getByLabelText('Prénom 1'), 'Alice');
    await user.type(screen.getByLabelText('Prénom 2'), 'Bob');
    await user.click(screen.getByRole('button', { name: 'Commencer' }));
    expect(await screen.findByText('Enveloppe maximale')).toBeInTheDocument();
    expect((await repo.getBudget(trip.id)).travelers.map((t) => t.name)).toEqual(['Alice', 'Bob']);
  });

  it('refuse de continuer sans aucun prénom', async () => {
    const { repo, trip, user } = await setup();
    await user.click(await screen.findByRole('button', { name: 'Commencer' }));
    expect(screen.getByText('Indique au moins un voyageur.')).toBeInTheDocument();
    expect((await repo.getBudget(trip.id)).travelers).toEqual([]);
  });

  it('refuse de supprimer un voyageur qui a des dépenses, puis le dernier', async () => {
    const { repo, trip, created, user } = await setup({ travelers: ['Alice', 'Bob'] });
    await repo.saveExpense({ tripId: trip.id, date: '2026-12-01', category: 'food', label: 'x', amount: 10, currency: 'EUR', rateToEur: 1, rateManual: false, paidBy: created[0].id, participantIds: [created[0].id], lineId: null, reservationId: null });
    const alice = (await screen.findByDisplayValue('Alice')).closest('li')!;
    await user.click(within(alice).getByRole('button', { name: 'Supprimer' }));
    expect(await screen.findByText('Ce voyageur a des dépenses : réaffecte-les d’abord.')).toBeInTheDocument();
    const bob = screen.getByDisplayValue('Bob').closest('li')!;
    await user.click(within(bob).getByRole('button', { name: 'Supprimer' }));
    await waitFor(async () => expect((await repo.getBudget(trip.id)).travelers).toHaveLength(1));
    const last = screen.getByDisplayValue('Alice').closest('li')!;
    await user.click(within(last).getByRole('button', { name: 'Supprimer' }));
    expect(await screen.findByText('Il faut au moins un voyageur.')).toBeInTheDocument();
  });

  it('ajoute et renomme un voyageur', async () => {
    const { repo, trip, user } = await setup({ travelers: ['Alice'] });
    await user.type(await screen.findByLabelText('Nouveau voyageur'), 'Chloé');
    await user.click(screen.getByRole('button', { name: 'Ajouter' }));
    await waitFor(async () => expect((await repo.getBudget(trip.id)).travelers.map((t) => t.name)).toEqual(['Alice', 'Chloé']));
    const field = screen.getByDisplayValue('Chloé');
    await user.clear(field);
    await user.type(field, 'Chloë{Tab}');
    await waitFor(async () => expect((await repo.getBudget(trip.id)).travelers[1].name).toBe('Chloë'));
  });
});

describe('BudgetTab — enveloppe', () => {
  it('enregistre une enveloppe par personne et une marge, puis la retire', async () => {
    const { repo, trip, user } = await setup({ travelers: ['Alice'] });
    await user.type(await screen.findByLabelText('Enveloppe maximale (€)'), '3000');
    await user.selectOptions(screen.getByLabelText('Mode de l’enveloppe'), 'per_person');
    await user.clear(screen.getByLabelText('Marge de sécurité sur les devises (%)'));
    await user.type(screen.getByLabelText('Marge de sécurité sur les devises (%)'), '5');
    await user.click(screen.getByRole('button', { name: 'Enregistrer l’enveloppe' }));
    await waitFor(async () => expect((await repo.getBundle(trip.id)).trip).toMatchObject({ budgetCap: 3000, budgetCapMode: 'per_person', fxMarginPct: 5 }));
    await user.clear(screen.getByLabelText('Enveloppe maximale (€)'));
    await user.click(screen.getByRole('button', { name: 'Enregistrer l’enveloppe' }));
    await waitFor(async () => expect((await repo.getBundle(trip.id)).trip.budgetCap ?? null).toBeNull());
  });

  it('refuse une marge hors de 0 à 20 % et un montant invalide', async () => {
    const { repo, trip, user } = await setup({ travelers: ['Alice'] });
    await user.clear(await screen.findByLabelText('Marge de sécurité sur les devises (%)'));
    await user.type(screen.getByLabelText('Marge de sécurité sur les devises (%)'), '25');
    await user.click(screen.getByRole('button', { name: 'Enregistrer l’enveloppe' }));
    expect(screen.getByText('La marge doit être entre 0 et 20 %.')).toBeInTheDocument();
    await user.clear(screen.getByLabelText('Marge de sécurité sur les devises (%)'));
    await user.type(screen.getByLabelText('Marge de sécurité sur les devises (%)'), '3');
    await user.type(screen.getByLabelText('Enveloppe maximale (€)'), '12,345');
    await user.click(screen.getByRole('button', { name: 'Enregistrer l’enveloppe' }));
    expect(screen.getByText('Montant invalide (2 décimales au plus).')).toBeInTheDocument();
    expect((await repo.getBundle(trip.id)).trip.budgetCap ?? null).toBeNull();
  });
});

describe('BudgetTab — recalcul automatique', () => {
  it('recalcule les lignes « par personne et par jour » quand le groupe ou les dates changent', async () => {
    const { repo, trip, user } = await setup({ travelers: ['Alice', 'Bob', 'Chloé'] });
    await repo.saveBudgetLine({ tripId: trip.id, category: 'food', label: 'Repas', amount: 30, currency: 'EUR', mode: 'per_person_per_day', position: 0, rateToEur: 1, rateManual: false, rateDate: new Date().toISOString().slice(0, 10) });
    await user.type(await screen.findByLabelText('Nouveau voyageur'), 'Dan');
    await user.click(screen.getByRole('button', { name: 'Ajouter' }));
    await waitFor(() => expect(screen.getByTestId('planned-total')).toHaveTextContent(/600,00/));
  });
});
