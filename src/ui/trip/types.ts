import type { TripBundle } from '../../domain/types';

export interface TripTabProps {
  bundle: TripBundle;
  setBundle(b: TripBundle): void;
  reload(): Promise<void>;
}
