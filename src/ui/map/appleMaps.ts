import type { TravelMode } from '../../domain/types';

export function appleMapsUrl(address: string): string {
  return `https://maps.apple.com/?q=${encodeURIComponent(address)}`;
}

export function appleMapsDirectionsUrl(from: string, to: string, mode: TravelMode): string {
  const flag = mode === 'car' ? 'd' : mode === 'walk' ? 'w' : 'r';
  return `https://maps.apple.com/?saddr=${encodeURIComponent(from)}&daddr=${encodeURIComponent(to)}&dirflg=${flag}`;
}
