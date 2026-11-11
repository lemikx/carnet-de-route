import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { TestAppProvider } from '../../app/AppContext';
import { createMemoryRepository } from '../../data/memoryRepository';
import type { TripBundle } from '../../domain/types';
import { ReservationsTab } from './ReservationsTab';

function Harness({ initial }: { initial: TripBundle }) {
  const [bundle, setBundle] = useState(initial);
  return <ReservationsTab bundle={bundle} setBundle={setBundle} reload={async () => {}} />;
}

describe('ReservationsTab', () => {
  it('garde la saisie et réessaie vraiment après une erreur d’enregistrement', async () => {
    const repo = createMemoryRepository();
    const trip = await repo.createTrip({ name: 'Japon', countries: [], startDate: '2026-12-01', endDate: '2026-12-02', localCurrency: '', homeTimezone: 'Europe/Paris', updatedAt: '' });
    await repo.createDays(trip.id, ['2026-12-01', '2026-12-02']);
    const real = repo.saveReservation.bind(repo);
    let failures = 1;
    repo.saveReservation = async (r) => {
      if (failures-- > 0) throw new Error('réseau');
      return real(r);
    };
    render(<TestAppProvider repo={repo}><Harness initial={await repo.getBundle(trip.id)} /></TestAppProvider>);
    const u = userEvent.setup();
    await u.click(screen.getByRole('button', { name: 'Ajouter une réservation' }));
    await u.type(screen.getByLabelText('Titre'), 'Musée');
    await u.type(screen.getByLabelText('Date de départ'), '2026-12-01');
    await u.type(screen.getByLabelText('Heure de départ'), '10:00');
    await u.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(await screen.findByText('Enregistrement impossible.')).toBeInTheDocument();
    expect(screen.getByLabelText('Titre')).toHaveValue('Musée');
    await u.click(screen.getByRole('button', { name: 'Réessayer' }));
    await waitFor(() => expect(screen.getByTestId('reservation')).toHaveTextContent('Musée'));
    expect(screen.queryByLabelText('Titre')).toBeNull();
  });
});
