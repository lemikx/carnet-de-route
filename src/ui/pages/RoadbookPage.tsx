import { useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useApp } from '../../app/AppContext';
import { buildRoadbook } from '../../domain/roadbook';
import { useAsync } from '../common/useAsync';
import { Roadbook } from '../roadbook/Roadbook';
import { printWhenReady } from '../roadbook/printRoadbook';
import { SharePanel } from '../roadbook/SharePanel';

export function RoadbookPage() {
  const { id = '' } = useParams();
  const { repo, settings } = useApp();
  const { data: bundle, error, loading } = useAsync(() => repo.getBundle(id), [repo, id]);
  const roadbook = useMemo(() => (bundle ? buildRoadbook(bundle, { hideSensitive: false, heavyThresholdMin: settings.heavyThresholdMin }) : null), [bundle, settings]);
  const tiles = useRef<() => void>(() => {});
  const [printing, setPrinting] = useState(false);

  if (loading && !roadbook) return <main className="page"><p className="muted">Chargement…</p></main>;
  if (error || !roadbook) return <main className="page"><p role="alert" className="save-error">Impossible de charger le roadbook.</p></main>;

  async function exportPdf() {
    setPrinting(true);
    const ready = new Promise<void>((r) => (tiles.current = r));
    await printWhenReady(ready);
    setPrinting(false);
  }

  return (
    <main className="page roadbook-page">
      <div className="page-head no-print">
        <Link to={`/voyage/${id}/itineraire`} className="btn">← Retour au voyage</Link>
        <div className="head-actions">
          <button className="btn btn-primary" onClick={exportPdf} disabled={printing}>
            {printing ? 'Préparation…' : 'Exporter en PDF'}
          </button>
        </div>
      </div>
      <div className="no-print">
        <SharePanel tripId={id} />
        <p className="muted">Sur iPhone : Exporter en PDF → Partager → Enregistrer dans Fichiers.</p>
      </div>
      <Roadbook roadbook={roadbook} onTilesLoaded={() => tiles.current()} />
    </main>
  );
}
