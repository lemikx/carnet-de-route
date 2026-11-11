import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { TestAppProvider } from '../../app/AppContext';
import { createMemoryRepository } from '../../data/memoryRepository';
import type { TripRepository } from '../../data/TripRepository';
import { TripsPage } from './TripsPage';

function renderPage(repo: TripRepository = createMemoryRepository()) {
  render(
    <MemoryRouter>
      <TestAppProvider repo={repo}>
        <TripsPage />
      </TestAppProvider>
    </MemoryRouter>,
  );
  return repo;
}

async function fillNewTrip() {
  const u = userEvent.setup();
  await u.click(await screen.findByRole('button', { name: 'Nouveau voyage' }));
  await u.type(screen.getByLabelText('Nom du voyage'), 'Japon');
  await u.type(screen.getByLabelText('Date de départ'), '2026-12-03');
  await u.type(screen.getByLabelText('Date de retour'), '2026-12-10');
  await u.click(screen.getByRole('button', { name: 'Créer le voyage' }));
  return u;
}

describe('TripsPage', () => {
  it('affiche un message quand il n’y a aucun voyage', async () => {
    renderPage();
    expect(await screen.findByText('Aucun voyage pour l’instant')).toBeInTheDocument();
  });

  it('crée un voyage et l’affiche avec ses dates', async () => {
    renderPage();
    await fillNewTrip();
    expect(await screen.findByText('Japon')).toBeInTheDocument();
    expect(screen.getByText('03/12/2026 → 10/12/2026')).toBeInTheDocument();
  });

  it('propose de réessayer si l’enregistrement échoue, sans perdre la saisie', async () => {
    const repo = createMemoryRepository();
    const real = repo.createTrip.bind(repo);
    let fail = true;
    repo.createTrip = async (t) => {
      if (fail) throw new Error('réseau');
      return real(t);
    };
    renderPage(repo);
    const u = await fillNewTrip();
    expect(await screen.findByText('Enregistrement impossible.')).toBeInTheDocument();
    expect(screen.getByLabelText('Nom du voyage')).toHaveValue('Japon');
    fail = false;
    await u.click(screen.getByRole('button', { name: 'Réessayer' }));
    await waitFor(() => expect(screen.getByText('03/12/2026 → 10/12/2026')).toBeInTheDocument());
  });
});
