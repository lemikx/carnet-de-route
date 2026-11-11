export type RoutingErrorCode = 'NOT_FOUND' | 'NO_ROUTE' | 'QUOTA' | 'NETWORK' | 'UNAUTHORIZED';
export type AutoMode = 'car' | 'walk' | 'bike';

export class RoutingError extends Error {
  constructor(public code: RoutingErrorCode, message: string) {
    super(message);
    this.name = 'RoutingError';
  }
}

export interface GeocodeResult {
  label: string;
  lat: number;
  lon: number;
  country: string;
  timezone: string;
}

export interface RouteResult {
  durationMin: number;
  distanceKm: number;
  geometry: [number, number][];
}

export interface LatLon {
  lat: number;
  lon: number;
}

export interface RoutingService {
  geocode(query: string): Promise<GeocodeResult[]>;
  route(from: LatLon, to: LatLon, mode: AutoMode): Promise<RouteResult>;
}
