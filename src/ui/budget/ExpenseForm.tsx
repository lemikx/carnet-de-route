import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useApp } from '../../app/AppContext';
import { convertToEurCents, formatEur, parseAmount } from '../../domain/budget/money';
import { BUDGET_CATEGORIES, type BudgetCategory, type BudgetData, type Expense } from '../../domain/budget/types';
import type { Reservation } from '../../domain/types';
import { formatDate } from '../../domain/format';
import { FALLBACK_CURRENCIES } from '../../fx/frankfurterFx';
import { createBudgetService } from '../../services/budgetService';
import type { New } from '../../data/TripRepository';
import { CATEGORY_LABELS } from './labels';

const RATE_ERROR = 'Impossible d’obtenir le taux : saisis-le à la main.';
const RATE_LOADING = 'Taux en cours de récupération, patiente un instant ou saisis-le à la main.';
const localToday = () => new Date().toLocaleDateString('sv-SE');

export function ExpenseForm({
  tripId, data, reservations, localCurrency, initial, disabled, onSave, onCancel,
}: {
  tripId: string;
  data: BudgetData;
  reservations: Reservation[];
  localCurrency: string;
  initial?: Expense;
  disabled: boolean;
  onSave(e: New<Expense> & { id?: string }): void;
  onCancel(): void;
}) {
  const { repo, fx } = useApp();
  const service = useRef(createBudgetService(repo, fx)).current;
  const [date, setDate] = useState(initial?.date ?? localToday());
  const [category, setCategory] = useState<BudgetCategory>(initial?.category ?? 'food');
  const [label, setLabel] = useState(initial?.label ?? '');
  const [amount, setAmount] = useState(initial ? String(initial.amount).replace('.', ',') : '');
  const [currency, setCurrency] = useState(initial?.currency ?? (localCurrency || 'EUR'));
  const startCurrency = initial?.currency ?? (localCurrency || 'EUR');
  // Jamais « 1 » par défaut pour une devise étrangère : 1 000 yens ne valent pas 1 000 €.
  const [rate, setRate] = useState(initial ? String(initial.rateToEur) : startCurrency === 'EUR' ? '1' : '');
  const [rateLoading, setRateLoading] = useState(false);
  const [staleDate, setStaleDate] = useState<string | null>(null);
  const [manual, setManual] = useState(initial?.rateManual ?? false);
  const [paidBy, setPaidBy] = useState(initial?.paidBy ?? data.travelers[0]?.id ?? '');
  const [participants, setParticipants] = useState<string[]>(initial?.participantIds ?? data.travelers.map((t) => t.id));
  const [link, setLink] = useState(initial?.lineId ? `line:${initial.lineId}` : initial?.reservationId ? `res:${initial.reservationId}` : '');
  const [currencies, setCurrencies] = useState<string[]>(FALLBACK_CURRENCIES);
  const [error, setError] = useState<string | null>(null);
  const manualRef = useRef(manual);
  manualRef.current = manual;

  useEffect(() => {
    fx.listCurrencies().then(setCurrencies, () => {});
  }, [fx]);

  // Taux du jour de la dépense, sauf s'il a été saisi à la main (ou s'il s'agit d'une dépense déjà enregistrée à la même date et devise).
  useEffect(() => {
    setStaleDate(null);
    if (currency === 'EUR') {
      setRate('1');
      setManual(false);
      setRateLoading(false);
      return;
    }
    if (initial && initial.currency === currency && initial.date === date) {
      // Retour à la devise d'origine : on restaure son taux enregistré.
      setRate(String(initial.rateToEur));
      setManual(initial.rateManual);
      setRateLoading(false);
      return;
    }
    if (manualRef.current) return;
    setRate('');
    setRateLoading(true);
    let cancelled = false;
    service.newExpenseRate(currency, date).then((r) => {
      if (cancelled || manualRef.current) return;
      setRateLoading(false);
      if ('error' in r) {
        setRate('');
        setError(RATE_ERROR);
      } else {
        setRate(String(r.rateToEur));
        if (r.stale && r.date) setStaleDate(r.date);
        setError((e) => (e === RATE_ERROR || e === RATE_LOADING ? null : e));
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currency, date]);

  const value = parseAmount(amount);
  const rateNumber = currency === 'EUR' ? 1 : Number(rate.replace(',', '.'));
  const preview = value !== null && rateNumber > 0 ? formatEur(convertToEurCents(value, rateNumber)) : null;

  function submit(e: FormEvent) {
    e.preventDefault();
    if (value === null) return setError('Montant invalide (2 décimales au plus).');
    if (value <= 0) return setError('Le montant doit être supérieur à 0.');
    if (!(rateNumber > 0)) return setError(rateLoading ? RATE_LOADING : RATE_ERROR);
    if (!paidBy) return setError('Choisis qui a payé.');
    if (participants.length === 0) return setError('Choisis au moins une personne concernée.');
    setError(null);
    onSave({
      ...(initial ? { id: initial.id } : {}),
      tripId, date, category, label: label.trim() || CATEGORY_LABELS[category], amount: value, currency, rateToEur: rateNumber,
      rateManual: currency === 'EUR' ? false : manual, paidBy,
      participantIds: data.travelers.filter((t) => participants.includes(t.id)).map((t) => t.id),
      lineId: link.startsWith('line:') ? link.slice(5) : null,
      reservationId: link.startsWith('res:') ? link.slice(4) : null,
    });
  }

  const toggle = (id: string) => setParticipants((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  return (
    <form className="card form" onSubmit={submit}>
      <div className="row">
        <label>
          Date
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label>
          Catégorie
          <select value={category} onChange={(e) => setCategory(e.target.value as BudgetCategory)}>
            {BUDGET_CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
          </select>
        </label>
        <label>
          Libellé
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Ex. Dîner" />
        </label>
      </div>
      <div className="row">
        <label>
          Montant
          <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </label>
        <label>
          Devise
          <select value={currency} onChange={(e) => { setCurrency(e.target.value); setManual(false); }}>
            {[...new Set(['EUR', ...currencies, currency])].sort().map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        {currency !== 'EUR' && (
          <label>
            Taux (€ pour 1 {currency})
            <input inputMode="decimal" value={rate} onChange={(e) => { setRate(e.target.value); setManual(true); setRateLoading(false); }} />
          </label>
        )}
      </div>
      {preview && currency !== 'EUR' && <p className="muted">≈ {preview}</p>}
      {staleDate && currency !== 'EUR' && <p className="muted">Dernier taux connu ({formatDate(staleDate)}) : le service de taux est injoignable.</p>}
      <div className="row">
        <label>
          Payé par
          <select value={paidBy} onChange={(e) => setPaidBy(e.target.value)}>
            {data.travelers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </label>
        <label>
          Rattachée à
          <select value={link} onChange={(e) => setLink(e.target.value)}>
            <option value="">Hors prévu</option>
            {data.lines.length > 0 && (
              <optgroup label="Lignes prévues">
                {data.lines.map((l) => <option key={l.id} value={`line:${l.id}`}>{l.label}</option>)}
              </optgroup>
            )}
            {reservations.some((r) => r.price !== null) && (
              <optgroup label="Réservations">
                {reservations.filter((r) => r.price !== null).map((r) => <option key={r.id} value={`res:${r.id}`}>{r.title}</option>)}
              </optgroup>
            )}
          </select>
        </label>
      </div>
      <fieldset className="field">
        <legend className="muted">Personnes concernées</legend>
        {data.travelers.map((t) => (
          <label key={t.id} className="checkbox">
            <input type="checkbox" checked={participants.includes(t.id)} onChange={() => toggle(t.id)} />
            {t.name}
          </label>
        ))}
      </fieldset>
      {error && <p role="alert" className="field-error">{error}</p>}
      <div className="form-actions">
        <button type="button" className="btn" onClick={onCancel}>Annuler</button>
        <button className="btn btn-primary" disabled={disabled}>Enregistrer</button>
      </div>
    </form>
  );
}
