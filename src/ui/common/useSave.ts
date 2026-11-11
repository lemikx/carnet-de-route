import { useCallback, useRef, useState } from 'react';
import { OfflineError } from '../../data/TripRepository';

export function errorMessage(e: unknown): string {
  if (e instanceof OfflineError) return 'Hors ligne — modification impossible.';
  return 'Enregistrement impossible.';
}

/** Exécute une action d'enregistrement, garde l'erreur et permet de réessayer. */
export function useSave<A extends unknown[], R>(fn: (...args: A) => Promise<R>) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const last = useRef<A | null>(null);

  const run = useCallback(
    async (...args: A): Promise<R | undefined> => {
      last.current = args;
      setSaving(true);
      setError(null);
      try {
        return await fn(...args);
      } catch (e) {
        setError(errorMessage(e));
        return undefined;
      } finally {
        setSaving(false);
      }
    },
    [fn],
  );
  const retry = useCallback(() => (last.current ? run(...last.current) : Promise.resolve(undefined)), [run]);
  return { run, retry, saving, error, clearError: () => setError(null) };
}
