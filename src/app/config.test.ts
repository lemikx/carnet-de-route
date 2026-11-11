import { getDataMode, getFxMode } from './config';

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

describe('getFxMode', () => {
  it('utilise Frankfurter par défaut', () => expect(getFxMode({})).toBe('frankfurter'));
  it('utilise les taux factices pour les tests', () => expect(getFxMode({ VITE_FX: 'fake' })).toBe('fake'));
});
