/** N'accepte que les liens web et téléphone ; tout autre schéma (javascript:, data:…) est refusé. */
export function safeHref(url: string): string | null {
  const u = url.trim();
  return /^(https?:\/\/|tel:)/i.test(u) ? u : null;
}
