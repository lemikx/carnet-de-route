import { describe, expect, it } from 'vitest';
import { applyNow } from './pwaPolicy';

describe('applyNow (mise à jour automatique)', () => {
  it('juste après l’ouverture : appliquer tout de suite', () => {
    expect(applyNow({ hidden: false, msSinceLoad: 3000 })).toBe(true);
  });
  it('page cachée (autre onglet ou appli) : appliquer', () => {
    expect(applyNow({ hidden: true, msSinceLoad: 600000 })).toBe(true);
  });
  it('en pleine utilisation : attendre', () => {
    expect(applyNow({ hidden: false, msSinceLoad: 60000 })).toBe(false);
  });
});
