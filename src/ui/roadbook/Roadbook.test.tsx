import { render, screen } from '@testing-library/react';
import { Roadbook } from './Roadbook';
import { buildRoadbook } from '../../domain/roadbook';
import { sampleBundle } from '../../test/bundle';

describe('Roadbook', () => {
  it('affiche une section par jour', () => {
    render(<Roadbook roadbook={buildRoadbook(sampleBundle(), { hideSensitive: false })} />);
    expect(screen.getAllByTestId('roadbook-day')).toHaveLength(3);
  });
  it('indique un jour sans étape', () => {
    render(<Roadbook roadbook={buildRoadbook(sampleBundle(), { hideSensitive: false })} />);
    expect(screen.getAllByText('Aucune étape prévue')).toHaveLength(1);
  });
  it('affiche le n° de réservation seulement s’il n’est pas masqué', () => {
    const { unmount } = render(<Roadbook roadbook={buildRoadbook(sampleBundle(), { hideSensitive: false })} />);
    expect(screen.getAllByText(/SECRET-conf/).length).toBeGreaterThan(0);
    unmount();
    render(<Roadbook roadbook={buildRoadbook(sampleBundle(), { hideSensitive: true })} />);
    expect(screen.queryByText(/SECRET/)).toBeNull();
  });
  it('relie les adresses à Plans', () => {
    const b = sampleBundle();
    b.stops[0].address = 'Kinkaku-ji, Kyoto';
    render(<Roadbook roadbook={buildRoadbook(b, { hideSensitive: false })} />);
    expect(screen.getAllByRole('link', { name: 'Kinkaku-ji, Kyoto' })[0]).toHaveAttribute('href', expect.stringContaining('maps.apple.com'));
  });

  it('n’affiche jamais un lien dangereux comme lien cliquable', () => {
    const b = sampleBundle();
    b.stops[0].url = 'javascript:alert(1)';
    b.reservations[0].url = 'JavaScript:alert(2)';
    const { container } = render(<Roadbook roadbook={buildRoadbook(b, { hideSensitive: false })} />);
    expect(container.querySelector('a[href^="javascript" i]')).toBeNull();
  });
});
