import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useCallback, useEffect, useState } from 'react';
import { TestAppProvider, useApp } from '../../app/AppContext';
import { createMemoryRepository } from '../../data/memoryRepository';
import { plannedItems, tripDays } from '../../domain/budget/planned';
import type { BudgetData } from '../../domain/budget/types';
import type { Reservation } from '../../domain/types';
import { makeReservation } from '../../test/factories';
import { LinesPanel } from './LinesPanel';

async function setup(reservations: Reservation[] = [], seedLine = false) {
  const repo = createMemoryRepository();
  const trip = await repo.createTrip({ name: 'Japon', countries: [], startDate: '2026-12-01', endDate: '2026-12-05', localCurrency: 'JPY', homeTimezone: 'Europe/Paris', updatedAt: '' });
  for (const [i, n] of ['A', 'B', 'C', 'D'].entries()) await repo.saveTraveler({ tripId: trip.id, name: n, position: i });
  if (seedLine) {
    await repo.saveBudgetLine({ tripId: trip.id, category: 'food', label: 'Ramen', amount: 1000, currency: 'JPY', mode: 'fixed', position: 0, rateToEur: 0.005, rateManual: true, rateDate: '2026-11-11' });
  }
  function Harness() {
    const { repo: r } = useApp();
    const [data, setData] = useState<BudgetData | null>(null);
    const reload = useCallback(async () => setData(await r.getBudget(trip.id)), [r]);
    useEffect(() => void reload(), [reload]);
    if (!data) return null;
    const items = plannedItems({ lines: data.lines, reservations, travelers: data.travelers.length, days: tripDays(trip), marginPct: 3, reservationRates: { USD: 0.92 } });
    return <LinesPanel tripId={trip.id} data={data} items={items} reservations={reservations} disabled={false} onChange={reload} />;
  }
  render(<TestAppProvider repo={repo}><Harness /></TestAppProvider>);
  return { repo, trip, user: userEvent.setup() };
}

async function fillLine(user: ReturnType<typeof userEvent.setup>, fields: { label: string; amount: string; mode?: string; currency?: string }) {
  await user.click(await screen.findByRole('button', { name: 'Ajouter une ligne' }));
  await user.selectOptions(screen.getByLabelText('Catégorie'), 'food');
  await user.type(screen.getByLabelText('Libellé'), fields.label);
  if (fields.currency) await user.selectOptions(screen.getByLabelText('Devise'), fields.currency);
  await user.type(screen.getByLabelText('Montant'), fields.amount);
  if (fields.mode) await user.selectOptions(screen.getByLabelText('Mode de calcul'), fields.mode);
}

describe('LinesPanel', () => {
  it('ajoute les postes habituels', async () => {
    const { repo, trip, user } = await setup();
    await user.click(await screen.findByRole('button', { name: 'Ajouter les postes habituels' }));
    await waitFor(async () => expect((await repo.getBudget(trip.id)).lines).toHaveLength(4));
    for (const label of ['Repas', 'Transports sur place', 'Activités', 'Imprévus']) expect(await screen.findAllByText(label)).not.toHaveLength(0);
  });

  it('calcule le prévu d’une ligne par personne et par jour', async () => {
    const { user } = await setup();
    await fillLine(user, { label: 'Dîners', amount: '40', mode: 'per_person_per_day', currency: 'EUR' });
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(await screen.findByText('800,00 €', { exact: false })).toBeInTheDocument();
  });

  it('accepte « 40,5 » et refuse trop de décimales', async () => {
    const { repo, trip, user } = await setup();
    await fillLine(user, { label: 'Café', amount: '12,345', currency: 'EUR' });
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(screen.getByText('Montant invalide (2 décimales au plus).')).toBeInTheDocument();
    expect((await repo.getBudget(trip.id)).lines).toHaveLength(0);
    await user.clear(screen.getByLabelText('Montant'));
    await user.type(screen.getByLabelText('Montant'), '40,5');
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));
    await waitFor(async () => expect((await repo.getBudget(trip.id)).lines[0].amount).toBe(40.5));
  });

  it('remplit le taux d’une devise étrangère et le marque manuel quand on le modifie', async () => {
    const { repo, trip, user } = await setup();
    await fillLine(user, { label: 'Ramen', amount: '1000', currency: 'JPY' });
    const rate = await screen.findByLabelText(/^Taux/);
    await waitFor(() => expect(rate).toHaveValue('0.0061'));
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));
    await waitFor(async () => expect((await repo.getBudget(trip.id)).lines[0]).toMatchObject({ rateToEur: 0.0061, rateManual: false }));
    await user.click(screen.getByRole('button', { name: 'Modifier' }));
    const edit = await screen.findByLabelText(/^Taux/);
    await user.clear(edit);
    await user.type(edit, '0,006');
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));
    await waitFor(async () => expect((await repo.getBudget(trip.id)).lines[0]).toMatchObject({ rateToEur: 0.006, rateManual: true }));
  });

  it('refuse une devise étrangère sans taux utilisable', async () => {
    const { repo, trip, user } = await setup();
    await fillLine(user, { label: 'Ramen', amount: '1000', currency: 'JPY' });
    const rate = await screen.findByLabelText(/^Taux/);
    await waitFor(() => expect(rate).toHaveValue('0.0061'));
    await user.clear(rate);
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(screen.getByText('Impossible d’obtenir le taux : saisis-le à la main.')).toBeInTheDocument();
    expect((await repo.getBudget(trip.id)).lines).toHaveLength(0);
  });

  it('repère les lignes de réservation et celles sans taux', async () => {
    await setup([
      makeReservation({ id: 'R1', type: 'flight', title: 'AF276', price: 800, currency: 'EUR' }),
      makeReservation({ id: 'R2', type: 'activity', title: 'Visite', price: 50, currency: 'CAD' }),
    ]);
    const vol = (await screen.findByText('AF276')).closest('li')!;
    expect(within(vol).getByText('réservation')).toBeInTheDocument();
    expect(within(vol).queryByRole('button', { name: 'Modifier' })).toBeNull();
    const visite = screen.getByText('Visite').closest('li')!;
    expect(within(visite).getByText('taux manquant')).toBeInTheDocument();
  });
});

describe('LinesPanel — taux de change sûrs', () => {
  it('revient au taux d’origine quand on repasse à la devise de la ligne', async () => {
    const { user } = await setup([], true);
    await user.click(await screen.findByRole('button', { name: 'Modifier' }));
    await user.selectOptions(screen.getByLabelText('Devise'), 'USD');
    await waitFor(() => expect(screen.getByLabelText(/^Taux/)).toHaveValue('0.92'));
    await user.selectOptions(screen.getByLabelText('Devise'), 'JPY');
    await waitFor(() => expect(screen.getByLabelText(/^Taux/)).toHaveValue('0.005'));
  });
});
