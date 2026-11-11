import { render, screen } from '@testing-library/react';
import { LegRow } from './LegRow';
import { makeLeg, makeStop } from '../../test/factories';

const a = makeStop({ title: 'Kyoto', address: 'Kyoto' });
const b = makeStop({ title: 'Nara', address: 'Nara' });
const noop = () => {};

describe('LegRow', () => {
  it('affiche durée et distance d’un trajet calculé', () => {
    render(<LegRow leg={makeLeg(a, b, { durationMin: 65, distanceKm: 42.4 })} from={a} to={b} disabled={false} onMode={noop} onDuration={noop} />);
    expect(screen.getByText('1 h 05 · 42,4 km')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Itinéraire' })).toHaveAttribute('href', expect.stringContaining('saddr=Kyoto'));
  });
  it('affiche l’erreur et propose la saisie manuelle', () => {
    render(<LegRow leg={makeLeg(a, b, { error: 'Aucun trajet routier possible (mer ?)' })} from={a} to={b} disabled={false} onMode={noop} onDuration={noop} />);
    expect(screen.getByText(/Aucun trajet routier possible/)).toBeInTheDocument();
    expect(screen.getByLabelText('Durée du trajet (min)')).toBeInTheDocument();
  });
  it('propose la saisie manuelle pour un trajet en avion', () => {
    render(<LegRow leg={makeLeg(a, b, { mode: 'plane', source: 'manual' })} from={a} to={b} disabled={false} onMode={noop} onDuration={noop} />);
    expect(screen.getByLabelText('Mode de transport')).toHaveValue('plane');
    expect(screen.getByLabelText('Durée du trajet (min)')).toHaveValue(null);
  });
});
