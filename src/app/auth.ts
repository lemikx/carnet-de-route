export interface AppUser {
  email: string;
  /** Session expirée mais appareil hors ligne : consultation seule, reconnexion au retour du réseau. */
  offlineOnly?: boolean;
}

export const LAST_USER_KEY = 'carnet-de-route:last-user';

export function resolveUser(
  sessionEmail: string | null,
  ctx: { online: boolean; lastEmail: string | null; networkError: boolean },
): AppUser | null {
  if (sessionEmail) return { email: sessionEmail };
  if (ctx.lastEmail && (!ctx.online || ctx.networkError)) return { email: ctx.lastEmail, offlineOnly: true };
  return null;
}

/** Erreur due au réseau (et non à une session invalide) lors du renouvellement. */
export function isNetworkAuthError(error: unknown): boolean {
  const name = (error as { name?: string } | null)?.name ?? '';
  return name === 'AuthRetryableFetchError' || error instanceof TypeError;
}

export function readLastEmail(): string | null {
  try {
    return localStorage.getItem(LAST_USER_KEY);
  } catch {
    return null;
  }
}

export function writeLastEmail(email: string | null) {
  try {
    if (email) localStorage.setItem(LAST_USER_KEY, email);
    else localStorage.removeItem(LAST_USER_KEY);
  } catch {
    /* stockage indisponible */
  }
}
