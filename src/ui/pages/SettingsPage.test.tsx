import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TestAppProvider } from '../../app/AppContext';
import { createMemoryRepository } from '../../data/memoryRepository';
import { SettingsPage } from './SettingsPage';

describe('SettingsPage', () => {
  it('enregistre le nom affiché sur les roadbooks partagés', async () => {
    const repo = createMemoryRepository();
    render(<TestAppProvider repo={repo}><SettingsPage /></TestAppProvider>);
    const u = userEvent.setup();
    const field = await screen.findByLabelText('Nom affiché sur les roadbooks partagés');
    await u.clear(field);
    await u.type(field, 'lemikxfamily');
    await u.click(screen.getByRole('button', { name: 'Enregistrer le nom' }));
    await waitFor(async () => expect(await repo.getDisplayName()).toBe('lemikxfamily'));
    expect(await screen.findByText('Nom enregistré.')).toBeInTheDocument();
  });
});
