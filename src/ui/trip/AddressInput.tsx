import { useEffect, useRef, useState } from 'react';
import type { GeocodeResult, RoutingService } from '../../routing/RoutingService';

export function AddressInput({
  routing, value, onChange, onPick, label = 'Adresse',
}: {
  routing: RoutingService;
  value: string;
  onChange(text: string): void;
  onPick(r: GeocodeResult): void;
  label?: string;
}) {
  const [query, setQuery] = useState(value);
  const [results, setResults] = useState<GeocodeResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const picked = useRef(false);

  useEffect(() => {
    if (picked.current) {
      picked.current = false;
      return;
    }
    const q = query.trim();
    if (q.length < 3) {
      setResults(null);
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const r = await routing.geocode(q);
        if (!cancelled) {
          setResults(r);
          setError(null);
        }
      } catch {
        if (!cancelled) setError('Recherche d’adresse indisponible.');
      }
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query, routing]);

  return (
    <div className="field">
      <label className="field">
        {label}
        <input value={query} autoComplete="off" placeholder="Ex. Kinkaku-ji, Kyoto"
          onChange={(e) => {
            setQuery(e.target.value);
            onChange(e.target.value);
          }} />
      </label>
      {error && <p className="field-error">{error}</p>}
      {results && results.length === 0 && <p className="field-error">Adresse introuvable</p>}
      {results && results.length > 0 && (
        <ul className="suggestions">
          {results.map((r, i) => (
            <li key={i}>
              <button type="button" onClick={() => {
                picked.current = true;
                setQuery(r.label);
                setResults(null);
                onChange(r.label);
                onPick(r);
              }}>
                {r.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
