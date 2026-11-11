import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TestAppProvider } from '../../app/AppContext';
import { createMemoryRepository } from '../../data/memoryRepository';
import { SharePanel, shareUrl } from './SharePanel';

async function setup() {
  const repo = createMemoryRepository();
  const trip = await repo.createTrip({ name: 'Japon', countries: [], startDate: '2026-12-01', endDate: '2026-12-02', localCurrency: '', homeTimezone: 'Europe/Paris', updatedAt: '' });
  render(<TestAppProvider repo={repo}><SharePanel tripId={trip.id} /></TestAppProvider>);
  return { repo, trip };
}

describe('SharePanel', () => {
  it('masque les infos sensibles par défaut et avertit', async () => {
    await setup();
    expect(await screen.findByLabelText('Masquer les infos sensibles')).toBeChecked();
    expect(screen.getByText('Toute personne qui a ce lien peut voir ton itinéraire, tes hébergements et tes dates.')).toBeInTheDocument();
  });

  it('crée un lien puis demande confirmation pour le désactiver', async () => {
    const { repo, trip } = await setup();
    const u = userEvent.setup();
    await u.click(await screen.findByRole('button', { name: 'Créer un lien' }));
    const link = await repo.getShareLink(trip.id);
    expect(await screen.findByDisplayValue(shareUrl(link!.token))).toBeInTheDocument();
    await u.click(screen.getByRole('button', { name: 'Désactiver le lien' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('Désactiver le lien de partage ?');
    await u.click(screen.getByRole('button', { name: 'Désactiver' }));
    expect(await screen.findByRole('button', { name: 'Créer un lien' })).toBeInTheDocument();
    expect(await repo.getShareLink(trip.id)).toBeNull();
  });
});
