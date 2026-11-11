import { useEffect } from 'react';
import L from 'leaflet';
import { MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap } from 'react-leaflet';

export interface MapPoint {
  lat: number | null;
  lon: number | null;
  label: string;
}

function icon(n: number) {
  return L.divIcon({ className: 'map-marker', html: `<span>${n}</span>`, iconSize: [26, 26], iconAnchor: [13, 13] });
}

function Fit({ bounds }: { bounds: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (bounds.length === 1) map.setView(bounds[0], 13);
    else if (bounds.length > 1) map.fitBounds(bounds, { padding: [24, 24] });
  }, [map, bounds]);
  return null;
}

export function MapView({
  points, lines, height = 240, onTilesLoaded,
}: {
  points: MapPoint[];
  lines: [number, number][][];
  height?: number;
  onTilesLoaded?(): void;
}) {
  const located = points.filter((p): p is MapPoint & { lat: number; lon: number } => p.lat !== null && p.lon !== null);
  if (located.length === 0) return null;
  const bounds = located.map((p) => [p.lat, p.lon] as [number, number]);
  return (
    <div className="map" style={{ height }}>
      <MapContainer center={bounds[0]} zoom={11} style={{ height: '100%' }} scrollWheelZoom={false} attributionControl>
        <TileLayer
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          eventHandlers={onTilesLoaded ? { load: onTilesLoaded } : undefined}
        />
        <Fit bounds={bounds} />
        {lines.filter((l) => l.length > 1).map((l, i) => (
          <Polyline key={i} positions={l} pathOptions={{ color: '#1f4e79', weight: 4, opacity: 0.75 }} />
        ))}
        {located.map((p, i) => (
          <Marker key={i} position={[p.lat, p.lon]} icon={icon(i + 1)}>
            <Tooltip>{p.label}</Tooltip>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
