import { useEffect, useState, type FormEvent } from 'react';
import { useApp } from '../../app/AppContext';
import { parseAmount } from '../../domain/budget/money';
import { BUDGET_CATEGORIES, type BudgetCategory, type BudgetLine, type LineMode } from '../../domain/budget/types';
import { FALLBACK_CURRENCIES } from '../../fx/frankfurterFx';
import type { New } from '../../data/TripRepository';
import { CATEGORY_LABELS, MODE_LABELS } from './labels';

const today = () => new Date().toISOString().slice(0, 10);
const RATE_ERROR = 'Impossible d’obtenir le taux : saisis-le à la main.';

export function LineForm({
  tripId, initial, position, disabled, onSave, onCancel,
}: {
  tripId: string;
  initial?: BudgetLine;
  position: number;
  disabled: boolean;
  onSave(l: New<BudgetLine> & { id?: string }): void;
  onCancel(): void;
}) {
  const { fx } = useApp();
  const [category, setCategory] = useState<BudgetCategory>(initial?.category ?? 'food');
  const [label, setLabel] = useState(initial?.label ?? '');
  const [amount, setAmount] = useState(initial ? String(initial.amount).replace('.', ',') : '');
  const [currency, setCurrency] = useState(initial?.currency ?? 'EUR');
  const [mode, setMode] = useState<LineMode>(initial?.mode ?? 'fixed');
  const [rate, setRate] = useState(initial ? String(initial.rateToEur) : '1');
  const [manual, setManual] = useState(initial?.rateManual ?? false);
  const [currencies, setCurrencies] = useState<string[]>(FALLBACK_CURRENCIES);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fx.listCurrencies().then(setCurrencies, () => {});
  }, [fx]);

  // Taux automatique quand on choisit une devise étrangère (sauf s'il a été saisi à la main).
  useEffect(() => {
    if (currency === 'EUR') {
      setRate('1');
      return;
    }
    if (initial && initial.currency === currency) return;
    let cancelled = false;
    fx.getRate(currency).then(
      (r) => {
        if (cancelled) return;
        setRate(String(r.rate));
        setManual(false);
        setError(null);
      },
      () => !cancelled && (setRate(''), setError(RATE_ERROR)),
    );
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currency, fx]);

  function submit(e: FormEvent) {
    e.preventDefault();
    const value = parseAmount(amount);
    if (value === null) return setError('Montant invalide (2 décimales au plus).');
    const r = currency === 'EUR' ? 1 : Number(rate.replace(',', '.'));
    if (!(r > 0)) return setError(RATE_ERROR);
    setError(null);
    onSave({
      ...(initial ? { id: initial.id } : {}),
      tripId, category, label: label.trim() || CATEGORY_LABELS[category], amount: value, currency, mode,
      position: initial?.position ?? position, rateToEur: r, rateManual: currency === 'EUR' ? false : manual, rateDate: manual ? (initial?.rateDate ?? today()) : today(),
    });
  }

  return (
    <form className="card form" onSubmit={submit}>
      <div className="row">
        <label>
          Catégorie
          <select value={category} onChange={(e) => setCategory(e.target.value as BudgetCategory)}>
            {BUDGET_CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
          </select>
        </label>
        <label>
          Libellé
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Ex. Dîners" />
        </label>
      </div>
      <div className="row">
        <label>
          Montant
          <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </label>
        <label>
          Devise
          <select value={currency} onChange={(e) => setCurrency(e.target.value)}>
            {[...new Set(['EUR', ...currencies, currency])].sort().map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <label>
          Mode de calcul
          <select value={mode} onChange={(e) => setMode(e.target.value as LineMode)}>
            {Object.entries(MODE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
      </div>
      {currency !== 'EUR' && (
        <label>
          Taux (€ pour 1 {currency})
          <input inputMode="decimal" value={rate} onChange={(e) => { setRate(e.target.value); setManual(true); }} />
        </label>
      )}
      {error && <p role="alert" className="field-error">{error}</p>}
      <div className="form-actions">
        <button type="button" className="btn" onClick={onCancel}>Annuler</button>
        <button className="btn btn-primary" disabled={disabled}>Enregistrer</button>
      </div>
    </form>
  );
}
