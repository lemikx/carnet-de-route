import { RoutingError, type GeocodeResult, type RouteResult, type RoutingErrorCode, type RoutingService } from './RoutingService';

export function createEdgeRouting(
  url: string,
  getToken: () => Promise<string | null>,
  fetchImpl: typeof fetch = (...a) => fetch(...a),
): RoutingService {
  async function call<T>(body: unknown): Promise<T> {
    let res: Response;
    try {
      const token = await getToken();
      res = await fetchImpl(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(body),
      });
    } catch {
      throw new RoutingError('NETWORK', 'Calcul impossible : vérifie ta connexion.');
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const code: RoutingErrorCode = (data as { code?: RoutingErrorCode }).code ?? (res.status === 401 ? 'UNAUTHORIZED' : 'NETWORK');
      throw new RoutingError(code, (data as { message?: string }).message ?? 'Erreur du service de calcul');
    }
    return data as T;
  }
  return {
    geocode: (query, focus) => call<GeocodeResult[]>({ action: 'geocode', query, ...(focus ? { focus } : {}) }),
    route: (from, to, mode) => call<RouteResult>({ action: 'route', from, to, mode }),
  };
}
