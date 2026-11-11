import { NavLink, useParams } from 'react-router-dom';
import { useApp } from '../../app/AppContext';
import { formatDate } from '../../domain/format';
import { NotFoundError } from '../../data/TripRepository';
import { useAsync } from '../common/useAsync';
import { ChecklistTab } from '../trip/ChecklistTab';
import { ContactsTab } from '../trip/ContactsTab';
import { ItineraryTab } from '../trip/ItineraryTab';
import { ReservationsTab } from '../trip/ReservationsTab';
import { CalendarPanel } from '../calendar/CalendarPanel';
import { BudgetTab } from '../budget/BudgetTab';

const TABS = [
  { id: 'itineraire', label: 'Itinéraire', Component: ItineraryTab },
  { id: 'checklist', label: 'Checklist', Component: ChecklistTab },
  { id: 'reservations', label: 'Réservations', Component: ReservationsTab },
  { id: 'budget', label: 'Budget', Component: BudgetTab },
  { id: 'contacts', label: 'Contacts', Component: ContactsTab },
] as const;

export function TripPage() {
  const { id = '', onglet = 'itineraire' } = useParams();
  const { repo } = useApp();
  const { data: bundle, setData, error, loading, reload } = useAsync(() => repo.getBundle(id), [repo, id]);

  if (loading && !bundle) return <main className="page"><p className="muted">Chargement…</p></main>;
  if (error instanceof NotFoundError) return <main className="page"><p className="empty">Ce voyage n’existe plus.</p></main>;
  if (error || !bundle) return <main className="page"><p role="alert" className="save-error">Impossible de charger ce voyage.</p></main>;

  const tab = TABS.find((t) => t.id === onglet) ?? TABS[0];
  const { Component } = tab;
  return (
    <main className="page">
      <div className="page-head">
        <div>
          <h1>{bundle.trip.name}</h1>
          <p className="muted">{formatDate(bundle.trip.startDate)} → {formatDate(bundle.trip.endDate)}</p>
        </div>
        <div className="head-actions">
          <NavLink className="btn btn-primary" to={`/voyage/${id}/roadbook`}>Roadbook</NavLink>
          <CalendarPanel bundle={bundle} />
        </div>
      </div>
      <nav className="tabs" aria-label="Sections du voyage">
        {TABS.map((t) => (
          <NavLink key={t.id} to={`/voyage/${id}/${t.id}`} className={({ isActive }) => (isActive || (t.id === 'itineraire' && !onglet) ? 'tab active' : 'tab')}>
            {t.label}
          </NavLink>
        ))}
      </nav>
      <Component bundle={bundle} setBundle={setData} reload={reload} />
    </main>
  );
}
