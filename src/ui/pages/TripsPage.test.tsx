import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
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
  await u.clear(screen.getByLabelText('Date de retour'));
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

describe('TripsPage — dates liées', () => {
  it('le retour se remplit avec le départ', async () => {
    renderPage();
    const u = userEvent.setup();
    await u.click(await screen.findByRole('button', { name: 'Nouveau voyage' }));
    await u.type(screen.getByLabelText('Date de départ'), '2026-12-03');
    expect(screen.getByLabelText('Date de retour')).toHaveValue('2026-12-03');
  });
});

describe('TripsPage — modification d’un voyage', () => {
  it('décaler le départ ne recale pas le retour', async () => {
    const repo = createMemoryRepository();
    await repo.createTrip({ name: 'Japon', countries: ['JP'], startDate: '2026-12-01', endDate: '2026-12-10', localCurrency: 'JPY', homeTimezone: 'Europe/Paris', updatedAt: '' });
    renderPage(repo);
    const u = userEvent.setup();
    await u.click(await screen.findByRole('button', { name: 'Modifier' }));
    const dep = screen.getByLabelText('Date de départ');
    await u.clear(dep);
    await u.type(dep, '2026-12-12');
    expect(screen.getByLabelText('Date de retour')).toHaveValue('2026-12-10');
  });
});

describe('TripsPage — recherche', () => {
  it('filtre par nom ou pays et propose la création IA sans résultat', async () => {
    const repo = createMemoryRepository();
    await repo.createTrip({ name: 'Japon', countries: ['Japon'], startDate: '2026-12-01', endDate: '2026-12-10', localCurrency: 'JPY', homeTimezone: 'Europe/Paris', updatedAt: '' });
    await repo.createTrip({ name: 'Road trip', countries: ['Islande'], startDate: '2027-06-01', endDate: '2027-06-10', localCurrency: 'ISK', homeTimezone: 'Europe/Paris', updatedAt: '' });
    renderPage(repo);
    const u = userEvent.setup();
    const search = await screen.findByLabelText('Où voulez-vous aller ?');
    await u.type(search, 'ISLANDE');
    expect(screen.getByText('Road trip')).toBeInTheDocument();
    expect(screen.queryByText('Japon')).toBeNull();
    await u.clear(search);
    await u.type(search, 'Pérou');
    expect(screen.getByText('Aucun voyage ne correspond.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Créer ce voyage avec l’IA' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Mes voyages' })).toBeInTheDocument();
  });
});

describe('TripsPage : recherche sans résultat', () => {
  function Where() {
    const l = useLocation();
    return <p data-testid="where">{l.pathname + l.search}</p>;
  }
  async function renderWithTrip() {
    const repo = createMemoryRepository();
    await repo.createTrip({
      name: 'Japon', startDate: '2026-12-03', endDate: '2026-12-10', countries: ['JP'], localCurrency: 'JPY', homeTimezone: 'Europe/Paris', updatedAt: '',
    });
    render(
      <MemoryRouter initialEntries={['/']}>
        <TestAppProvider repo={repo}>
          <Routes>
            <Route path="/" element={<TripsPage />} />
            <Route path="*" element={<Where />} />
          </Routes>
        </TestAppProvider>
      </MemoryRouter>,
    );
    return userEvent.setup();
  }

  it('transmet la destination tapée au questionnaire IA', async () => {
    const u = await renderWithTrip();
    await screen.findByText('Japon');
    await u.type(screen.getByLabelText('Où voulez-vous aller ?'), 'Lisbonne & Porto');
    await u.click(await screen.findByRole('button', { name: 'Créer ce voyage avec l’IA' }));
    expect(screen.getByTestId('where')).toHaveTextContent('/ia/nouveau?destination=Lisbonne%20%26%20Porto');
  });

  it('sans destination tapée, le bouton d’en-tête ouvre le questionnaire sans paramètre', async () => {
    const u = await renderWithTrip();
    await screen.findByText('Japon');
    await u.click(screen.getByRole('button', { name: 'Créer avec l’IA' }));
    expect(screen.getByTestId('where').textContent).toBe('/ia/nouveau');
  });
});
