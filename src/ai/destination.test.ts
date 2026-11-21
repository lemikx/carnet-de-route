import { describe, expect, it } from 'vitest';
import { normalizeDestination } from './destination';

describe('normalizeDestination', () => {
  it.each(['surprend moi', 'Surprends-moi', 'surprends moi !', 'SURPRISE', 'peu importe', "n'importe où", 'je ne sais pas', 'je sais pas', 'aucune idée', '?', '  ', ''])(
    '« %s » → surprise (null)',
    (s) => expect(normalizeDestination(s)).toBeNull(),
  );
  it('null reste null', () => expect(normalizeDestination(null)).toBeNull());
  it.each([['Kyoto', 'Kyoto'], ['  Lisbonne ', 'Lisbonne'], ['Surprise Island, Canada', 'Surprise Island, Canada']])(
    'vraie destination « %s » conservée',
    (s, out) => expect(normalizeDestination(s)).toBe(out),
  );
});
