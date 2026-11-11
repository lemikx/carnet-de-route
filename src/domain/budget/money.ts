export function toCents(amount: number): number {
  return Math.round(amount * 100);
}

/** Convertit une saisie française (« 1 200,50 », « 40,5 », « 12.5 ») ; `null` si invalide (négatif, plus de 2 décimales, texte). */
export function parseAmount(input: string): number | null {
  const s = input.replace(/[\s  ]/g, '').replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  return Number(s);
}

export function convertToEurCents(amount: number, rateToEur: number): number {
  return Math.round(amount * rateToEur * 100);
}

/** Taux utilisé pour une prévision : l'euro n'est jamais majoré. */
export function effectiveRate(currency: string, rateToEur: number, marginPct: number): number {
  return currency === 'EUR' ? 1 : rateToEur * (1 + marginPct / 100);
}

export function formatEur(cents: number): string {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(cents / 100);
}
