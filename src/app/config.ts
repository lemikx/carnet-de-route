export type DataMode = 'memory' | 'supabase';

export type FxMode = 'frankfurter' | 'fake';

export function getFxMode(env: Record<string, string | undefined>): FxMode {
  return env.VITE_FX === 'fake' ? 'fake' : 'frankfurter';
}

export function getDataMode(env: Record<string, string | undefined>): DataMode {
  if (env.VITE_DATA === 'supabase' && env.VITE_SUPABASE_URL) return 'supabase';
  return 'memory';
}
