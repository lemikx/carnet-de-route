import { expenseCents } from './projection';
import type { Expense } from './types';

/** Parts d'une dépense : `⌊E/k⌋` chacun, le reste à raison de 1 centime aux premiers. */
export function shares(totalCents: number, participantIds: string[]): Map<string, number> {
  const k = participantIds.length;
  const out = new Map<string, number>();
  if (k === 0) return out;
  const base = Math.floor(totalCents / k);
  const rest = totalCents - base * k;
  participantIds.forEach((id, i) => out.set(id, base + (i < rest ? 1 : 0)));
  return out;
}

/** Participants dans l'ordre des voyageurs. */
function ordered(e: Expense, order: string[]): string[] {
  return order.filter((id) => e.participantIds.includes(id));
}

/** Solde par voyageur en centimes : positif = on lui doit de l'argent. */
export function balances(expenses: Expense[], order: string[]): Map<string, number> {
  const out = new Map(order.map((id) => [id, 0]));
  for (const e of expenses) {
    const total = expenseCents(e);
    out.set(e.paidBy, (out.get(e.paidBy) ?? 0) + total);
    for (const [id, cents] of shares(total, ordered(e, order))) out.set(id, (out.get(id) ?? 0) - cents);
  }
  return out;
}

export interface Transfer {
  from: string;
  to: string;
  cents: number;
}

/** Virements en rapprochant le plus gros créditeur du plus gros débiteur ; égalités selon l'ordre des voyageurs. */
export function transfers(bal: Map<string, number>, order: string[]): Transfer[] {
  const work = new Map(bal);
  const out: Transfer[] = [];
  const pick = (sign: 1 | -1) => {
    let best: string | null = null;
    for (const id of order) {
      const v = (work.get(id) ?? 0) * sign;
      if (v > 0 && (best === null || v > (work.get(best) ?? 0) * sign)) best = id;
    }
    return best;
  };
  for (;;) {
    const creditor = pick(1);
    const debtor = pick(-1);
    if (creditor === null || debtor === null) break;
    const cents = Math.min(work.get(creditor)!, -work.get(debtor)!);
    out.push({ from: debtor, to: creditor, cents });
    work.set(creditor, work.get(creditor)! - cents);
    work.set(debtor, work.get(debtor)! + cents);
  }
  return out;
}

/** Ce que chaque voyageur doit supporter au total (somme de ses parts). */
export function actualPerTraveler(expenses: Expense[], order: string[]): Map<string, number> {
  const out = new Map(order.map((id) => [id, 0]));
  for (const e of expenses) {
    for (const [id, cents] of shares(expenseCents(e), ordered(e, order))) out.set(id, (out.get(id) ?? 0) + cents);
  }
  return out;
}
