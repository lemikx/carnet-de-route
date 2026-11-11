import { useEffect, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { DateTime } from 'luxon';
import { useApp } from '../../app/AppContext';
import { buildRoadbook } from '../../domain/roadbook';
import { useAsync } from '../common/useAsync';
import { Roadbook } from '../roadbook/Roadbook';

function useNoIndex() {
  useEffect(() => {
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex, nofollow';
    document.head.appendChild(meta);
    return () => meta.remove();
  }, []);
}

export function SharedRoadbookPage() {
  useNoIndex();
  const { token = '' } = useParams();
  const { repo } = useApp();
  const { data, loading, error } = useAsync(() => repo.getSharedRoadbook(token), [repo, token]);
  const roadbook = useMemo(() => (data ? buildRoadbook(data.bundle, { hideSensitive: data.hideSensitive }) : null), [data]);

  if (loading && !data) return <main className="page"><p className="muted">Chargement…</p></main>;
  if (error && !data) return <main className="page narrow"><p role="alert" className="save-error">Impossible d’ouvrir ce roadbook pour l’instant. Vérifie ta connexion.</p></main>;
  if (!data || !roadbook) return <main className="page narrow"><p className="empty">Ce roadbook n’est plus partagé.</p></main>;

  const updated = DateTime.fromISO(data.updatedAt).setLocale('fr');
  return (
    <main className="page roadbook-page">
      <div className="page-head no-print">
        <p className="shared-banner">
          Roadbook partagé par {data.ownerName}
          {updated.isValid && ` — mis à jour le ${updated.toFormat("dd/MM/yyyy 'à' HH:mm")}`}
        </p>
        <button className="btn btn-primary" onClick={() => window.print()}>Exporter en PDF</button>
      </div>
      <Roadbook roadbook={roadbook} />
    </main>
  );
}
