import { getDataMode } from './config';

describe('getDataMode', () => {
  it('vaut memory par défaut', () => {
    expect(getDataMode({})).toBe('memory');
  });
  it('vaut supabase si demandé et configuré', () => {
    expect(getDataMode({ VITE_DATA: 'supabase', VITE_SUPABASE_URL: 'x' })).toBe('supabase');
  });
  it('respecte memory même si Supabase est configuré', () => {
    expect(getDataMode({ VITE_DATA: 'memory', VITE_SUPABASE_URL: 'x' })).toBe('memory');
  });
});
