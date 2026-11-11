import { formatEur } from '../../domain/budget/money';
import { actualPerTraveler, balances, transfers } from '../../domain/budget/settlement';
import type { BudgetData } from '../../domain/budget/types';

export function SettlementPanel({ data }: { data: BudgetData }) {
  const order = data.travelers.map((t) => t.id);
  const name = new Map(data.travelers.map((t) => [t.id, t.name]));
  const due = transfers(balances(data.expenses, order), order);
  const perTraveler = actualPerTraveler(data.expenses, order);
  return (
    <section className="card">
      <h2>Soldes</h2>
      {due.length === 0 ? (
        <p>Tout est équilibré.</p>
      ) : (
        <ul className="list">
          {due.map((t, i) => (
            <li key={i}>{name.get(t.from)} doit {formatEur(t.cents)} à {name.get(t.to)}</li>
          ))}
        </ul>
      )}
      {data.expenses.length > 0 && (
        <>
          <h3>Coût réel par personne</h3>
          <ul className="list">
            {order.map((id) => (
              <li key={id}>{name.get(id)} : {formatEur(perTraveler.get(id) ?? 0)}</li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
