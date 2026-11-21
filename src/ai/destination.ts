/** Réponses qui veulent dire « je n'ai pas de destination » : elles déclenchent le mode « Surprends-moi ». */
const NO_DESTINATION = [
  'surprends moi', 'surprend moi', 'surprenez moi', 'surprise', 'peu importe', 'n importe ou', 'nimporte ou',
  'je ne sais pas', 'je sais pas', 'sais pas', 'aucune idee', 'pas d idee', 'aucune', 'rien',
];

const plain = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ').trim();

/** Destination nettoyée, ou null si l'utilisateur n'en a pas (champ vide ou « surprends-moi »). */
export function normalizeDestination(s: string | null): string | null {
  const t = s?.trim() ?? '';
  if (!t) return null;
  const p = plain(t);
  if (!p || NO_DESTINATION.includes(p)) return null;
  return t;
}
