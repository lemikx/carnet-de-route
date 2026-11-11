import type { BudgetData, Expense } from '../domain/budget/types';
import type { TripBundle } from '../domain/types';

type Row = Record<string, unknown>;
const DROP_ON_READ = new Set(['user_id', 'created_at', 'revoked_at']);
const DROP_ON_WRITE = new Set(['updatedAt', 'createdAt']);

const toCamel = (k: string) => k.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
const toSnake = (k: string) => k.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);

/** Ligne de la base → objet de l'appli (clés de premier niveau seulement). */
export function fromRow<T = Record<string, unknown>>(row: Row): T {
  const out: Row = {};
  for (const [k, v] of Object.entries(row)) if (!DROP_ON_READ.has(k)) out[toCamel(k)] = v;
  return out as T;
}

/** Objet de l'appli → ligne de la base. */
export function toRow(obj: object): Row {
  const out: Row = {};
  for (const [k, v] of Object.entries(obj)) if (!DROP_ON_WRITE.has(k) && v !== undefined) out[toSnake(k)] = v;
  return out;
}

export function rowsToBundle(json: Row): TripBundle {
  const list = (k: string) => ((json[k] as Row[] | null) ?? []).map((r) => fromRow(r));
  return {
    trip: fromRow(json.trip as Row),
    days: list('days'),
    stops: list('stops'),
    legs: list('legs'),
    reservations: list('reservations'),
    checklist: list('checklist'),
    contacts: list('contacts'),
  } as unknown as TripBundle;
}

/** JSON renvoyé par `get_my_budget` → données du budget. */
export function budgetFromJson(json: Row): BudgetData {
  const list = (k: string) => ((json[k] as Row[] | null) ?? []).map((r) => fromRow(r));
  return { travelers: list('travelers'), lines: list('lines'), expenses: list('expenses') } as unknown as BudgetData;
}

/** Dépense de l'appli → arguments de la fonction `save_expense`. */
export function expenseToRpc(e: Omit<Expense, 'id'> & { id?: string }): { expense: Row; participants: string[] } {
  const { participantIds, ...rest } = e;
  return { expense: toRow(rest), participants: participantIds };
}
