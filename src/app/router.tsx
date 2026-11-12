import { createHashRouter, Link, Navigate, Outlet, useLocation } from 'react-router-dom';
import { useApp } from './AppContext';
import { QuestionnairePage } from '../ui/ai/QuestionnairePage';
import { OfflineBanner } from '../ui/common/OfflineBanner';
import { LoginPage } from '../ui/pages/LoginPage';
import { RoadbookPage } from '../ui/pages/RoadbookPage';
import { SettingsPage } from '../ui/pages/SettingsPage';
import { SharedRoadbookPage } from '../ui/pages/SharedRoadbookPage';
import { TripPage } from '../ui/pages/TripPage';
import { TripsPage } from '../ui/pages/TripsPage';

const HAD_SESSION = 'carnet-de-route:had-session';

function Shell() {
  return (
    <>
      <header className="app-header">
        <Link to="/" className="brand">Carnet de route</Link>
        <Link to="/reglages" className="header-link" aria-label="Réglages">Réglages</Link>
      </header>
      <OfflineBanner />
      <Outlet />
    </>
  );
}

function RequireAuth() {
  const { user, authReady } = useApp();
  const location = useLocation();
  if (!authReady) return <main className="page"><p className="muted">Chargement…</p></main>;
  if (!user) {
    let expired = false;
    try {
      expired = localStorage.getItem(HAD_SESSION) === '1';
    } catch {
      /* ignore */
    }
    return <Navigate to="/connexion" replace state={{ expired, from: location.pathname }} />;
  }
  try {
    localStorage.setItem(HAD_SESSION, '1');
  } catch {
    /* ignore */
  }
  return <Shell />;
}

export const router = createHashRouter([
  { path: '/connexion', element: <LoginPage /> },
  { path: '/r/:token', element: <SharedRoadbookPage /> },
  {
    element: <RequireAuth />,
    children: [
      { path: '/', element: <TripsPage /> },
      { path: '/reglages', element: <SettingsPage /> },
      { path: '/ia/nouveau', element: <QuestionnairePage /> },
      { path: '/voyage/:id/roadbook', element: <RoadbookPage /> },
      { path: '/voyage/:id/:onglet?', element: <TripPage /> },
    ],
  },
]);
