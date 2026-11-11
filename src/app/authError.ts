/** Message clair (en français) pour une erreur de connexion, avec la cause d'origine à la fin. */
export function describeAuthError(e: unknown): string {
  const err = e as { message?: string; status?: number; name?: string } | null;
  const msg = err?.message ?? String(e);
  const detail = ` (${[err?.status, msg].filter(Boolean).join(' · ')})`;
  if (e instanceof TypeError || /failed to fetch|networkerror|load failed/i.test(msg)) {
    return 'Impossible de joindre le serveur : vérifie ta connexion.' + detail;
  }
  if (/rate limit|too many|429/i.test(msg) || err?.status === 429) {
    return 'Trop de demandes d’e-mails : attends une heure ou configure un envoi d’e-mails dans Supabase.' + detail;
  }
  if (/redirect/i.test(msg)) {
    return 'L’adresse de retour n’est pas autorisée dans Supabase (Authentication → URL Configuration).' + detail;
  }
  return 'Envoi impossible.' + detail;
}
