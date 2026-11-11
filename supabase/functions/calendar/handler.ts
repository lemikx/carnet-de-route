// Logique de l'abonnement calendrier, sans dépendance : testée avec Vitest, utilisée par index.ts (Deno).
// Aucun import : ce fichier est chargé tel quel par Deno.

export async function handleCalendar<B, O>(
  req: Request,
  getBundle: (token: string) => Promise<{ bundle: B; opts: O } | null>,
  build: (bundle: B, opts: O) => string,
): Promise<Response> {
  if (req.method !== 'GET' && req.method !== 'HEAD') return new Response(null, { status: 405, headers: { Allow: 'GET' } });
  const token = new URL(req.url).searchParams.get('token') ?? '';
  if (!/^[0-9a-f]{32}$/.test(token)) return new Response(null, { status: 404 });
  const found = await getBundle(token);
  if (!found) return new Response(null, { status: 404 });
  return new Response(build(found.bundle, found.opts), {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'inline; filename="carnet-de-route.ics"',
      'Cache-Control': 'private, max-age=900',
    },
  });
}
