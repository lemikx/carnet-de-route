export type DataMode = 'memory' | 'supabase';

export function getDataMode(env: Record<string, string | undefined>): DataMode {
  if (env.VITE_DATA === 'supabase' && env.VITE_SUPABASE_URL) return 'supabase';
  return 'memory';
}
