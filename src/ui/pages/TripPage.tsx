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

const ICONS: Record<string, string> = {
  itineraire: 'M12 21s-6-5.6-6-10a6 6 0 1 1 12 0c0 4.4-6 10-6 10zM12 11.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z',
  checklist: 'M9 6h11M9 12h11M9 18h11M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2',
  reservations: 'M4 8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4zM14 6v12',
  budget: 'M4 7h16v12H4zM4 7l2-3h12l2 3M16 13h.01',
  contacts: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0',
};

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
    <main className="page with-tabbar">
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
            <svg className="tab-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d={ICONS[t.id]} /></svg>
            <span>{t.label}</span>
          </NavLink>
        ))}
      </nav>
      <Component bundle={bundle} setBundle={setData} reload={reload} />
    </main>
  );
}
