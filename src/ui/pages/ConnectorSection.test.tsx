import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRepository } from '../../data/memoryRepository';
import { ConnectorSection } from './ConnectorSection';

describe('ConnectorSection', () => {
  it('crée l’adresse, montre l’URL et le jeton une fois, puis révoque', async () => {
    const repo = createMemoryRepository();
    const u = userEvent.setup();
    render(<ConnectorSection repo={repo} serverUrl="https://abc.supabase.co/functions/v1/claude-connector" online />);
    await u.click(await screen.findByRole('button', { name: 'Créer l’adresse du connecteur' }));
    expect(((await screen.findByLabelText('Adresse à coller dans claude.ai')) as HTMLInputElement).value)
      .toMatch(/^https:\/\/abc\.supabase\.co\/functions\/v1\/claude-connector\?token=[0-9a-f]{64}$/);
    expect(screen.getByText(/ne sera plus affichée/)).toBeInTheDocument();
    await u.click(screen.getByRole('button', { name: 'Révoquer' }));
    await u.click(screen.getAllByRole('button', { name: 'Révoquer' }).pop()!);
    expect(await screen.findByRole('button', { name: 'Créer l’adresse du connecteur' })).toBeInTheDocument();
    expect(await repo.getConnectorLink()).toBeNull();
  });
  it('adresse déjà active : jeton non réaffiché, possibilité d’en recréer une', async () => {
    const repo = createMemoryRepository();
    await repo.createConnectorLink();
    render(<ConnectorSection repo={repo} serverUrl="https://x/functions/v1/claude-connector" online />);
    expect(await screen.findByText(/Connecteur actif depuis/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Adresse à coller dans claude.ai')).toBeNull();
    expect(screen.getByRole('button', { name: 'Créer une nouvelle adresse' })).toBeInTheDocument();
  });
  it('hors ligne : boutons désactivés', async () => {
    render(<ConnectorSection repo={createMemoryRepository()} serverUrl="https://x" online={false} />);
    expect(await screen.findByRole('button', { name: 'Créer l’adresse du connecteur' })).toBeDisabled();
  });
});
