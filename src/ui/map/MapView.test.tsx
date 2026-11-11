import { render } from '@testing-library/react';
import { MapView } from './MapView';
import { appleMapsDirectionsUrl, appleMapsUrl } from './appleMaps';

describe('MapView', () => {
  it('ignore les points sans coordonnées', () => {
    const { container } = render(
      <MapView
        points={[{ lat: 35, lon: 135, label: 'A' }, { lat: null, lon: null, label: 'B' }, { lat: 34.7, lon: 135.5, label: 'C' }]}
        lines={[]}
      />,
    );
    expect(container.querySelectorAll('.map-marker')).toHaveLength(2);
  });
  it('n’affiche rien sans aucun point localisé', () => {
    const { container } = render(<MapView points={[{ lat: null, lon: null, label: 'B' }]} lines={[]} />);
    expect(container.querySelector('.map')).toBeNull();
  });
});

describe('liens Plans', () => {
  it('ouvre une adresse', () => expect(appleMapsUrl('Kyoto, Japon')).toBe('https://maps.apple.com/?q=Kyoto%2C%20Japon'));
  it('ouvre un itinéraire', () =>
    expect(appleMapsDirectionsUrl('A', 'B', 'walk')).toBe('https://maps.apple.com/?saddr=A&daddr=B&dirflg=w'));
});
