import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AddressInput } from './AddressInput';
import { createFakeRouting } from '../../routing/fakeRouting';
import { RoutingError, type RoutingErrorCode, type RoutingService } from '../../routing/RoutingService';

describe('AddressInput', () => {
  it('propose les résultats et renvoie le choix', async () => {
    const routing = createFakeRouting({
      kyoto: [
        { label: 'Kyoto, Japon', lat: 35.01, lon: 135.77, country: 'JPN', timezone: 'Asia/Tokyo' },
        { label: 'Kyoto Station', lat: 34.98, lon: 135.76, country: 'JPN', timezone: 'Asia/Tokyo' },
      ],
    });
    const onPick = vi.fn();
    render(<AddressInput routing={routing} value="" onChange={() => {}} onPick={onPick} />);
    const u = userEvent.setup();
    await u.type(screen.getByLabelText('Adresse'), 'Kyoto');
    expect(await screen.findByRole('button', { name: 'Kyoto Station' })).toBeInTheDocument();
    await u.click(screen.getByRole('button', { name: 'Kyoto, Japon' }));
    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ lat: 35.01, lon: 135.77, timezone: 'Asia/Tokyo' }));
  });

  it('signale une adresse introuvable', async () => {
    render(<AddressInput routing={createFakeRouting()} value="" onChange={() => {}} onPick={() => {}} />);
    await userEvent.setup().type(screen.getByLabelText('Adresse'), 'rue introuvable');
    expect(await screen.findByText('Adresse introuvable')).toBeInTheDocument();
  });

  it.each([
    ['QUOTA', /Limite de recherche atteinte/],
    ['UNAUTHORIZED', /Reconnecte-toi/],
    ['NETWORK', /Vérifie ta connexion/],
  ] as [RoutingErrorCode, RegExp][])('explique la cause : %s', async (code, text) => {
    const routing: RoutingService = { ...createFakeRouting(), geocode: async () => { throw new RoutingError(code, 'x'); } };
    render(<AddressInput routing={routing} value="" onChange={() => {}} onPick={() => {}} />);
    await userEvent.setup().type(screen.getByLabelText('Adresse'), 'Essaouira');
    expect(await screen.findByText(text)).toBeInTheDocument();
  });
});
