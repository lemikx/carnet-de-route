import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useApp } from '../../app/AppContext';
import { parseImportedFile, type ImportedFile } from '../../ai/importConverter';
import { useOnline } from '../../offline/useOnline';
import { CopyButton } from '../common/CopyButton';
import { SaveError } from '../common/SaveError';
import { useSave } from '../common/useSave';
import { briefFromPrevious, emptyBrief } from './questionnaireSteps';

const MAX_FILE_BYTES = 2_000_000;
const RELAY_PHRASE = 'Avec Carnet de route, importe ce voyage (fichier joint) du JJ/MM au JJ/MM.';
const today = () => new Date().toISOString().slice(0, 10);

type Recognized = Exclude<ImportedFile, { kind: 'unknown' }>;

function Recognized({ file }: { file: Recognized }) {
  const { ai, repo } = useApp();
  const online = useOnline();
  const navigate = useNavigate();
  const [startDate, setStartDate] = useState(file.startDate ?? '');
  const [endDate, setEndDate] = useState(file.endDate ?? '');
  const [destination, setDestination] = useState(file.destination ?? '');
  const [problems, setProblems] = useState<string[]>([]);

  const create = useSave(async () => {
    const last = await repo.listDrafts().then((d) => d[0], () => undefined);
    const base = last ? briefFromPrevious(last.brief, today()) : emptyBrief();
    const r = await ai.importItinerary({ brief: { ...base, startDate, endDate, destination: destination.trim() || null }, text: file.text });
    if (!r.ok) {
      setProblems(r.errors);
      return;
    }
    navigate(`/ia/${r.value.id}`);
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    setProblems([]);
    if (!startDate || !endDate) return setProblems(['Indique les dates de départ et de retour.']);
    if (endDate < startDate) return setProblems(['La date de retour doit être après le départ.']);
    void create.run();
  }

  return (
    <form className="card form" onSubmit={submit}>
      <p>
        <strong>{file.name || 'Voyage importé'}</strong><br />
        <span className="muted">{file.dayCount} jours, {file.stopCount} étapes{file.kind === 'converted' ? ' (converti depuis un autre format)' : ''}</span>
      </p>
      <div className="row">
        <label>
          Date de départ
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </label>
        <label>
          Date de retour
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </label>
      </div>
      <label>
        Destination
        <input value={destination} onChange={(e) => setDestination(e.target.value)} placeholder="Ex. Lisbonne" />
      </label>
      {problems.length > 0 && (
        <div role="alert" className="save-error">
          <ul>{problems.map((p, i) => <li key={i}>{p}</li>)}</ul>
        </div>
      )}
      <SaveError error={create.error} onRetry={create.retry} />
      <div className="form-actions">
        <button type="submit" className="btn btn-primary" disabled={create.saving || !online}>Créer le brouillon</button>
      </div>
    </form>
  );
}

export function ImportPanel() {
  const [result, setResult] = useState<ImportedFile | null>(null);
  const [readError, setReadError] = useState(false);
  const [key, setKey] = useState(0);

  async function onFile(f: File | undefined) {
    setResult(null);
    setReadError(false);
    if (!f) return;
    if (f.size > MAX_FILE_BYTES) {
      setResult({ kind: 'unknown', reason: 'Le fichier est trop volumineux.' });
      return;
    }
    try {
      setResult(parseImportedFile(await f.text()));
      setKey((k) => k + 1);
    } catch {
      setReadError(true);
    }
  }

  return (
    <main className="page">
      <div className="page-head">
        <h1>Importer un fichier</h1>
        <Link to="/">Mes voyages</Link>
      </div>
      <p className="muted">Choisis un itinéraire (.json, .txt ou .md) venant de Claude ou d’une autre IA. Je le convertis quand je le reconnais.</p>
      <label className="field">Fichier à importer
        <input type="file" accept=".json,.txt,.md,application/json,text/plain" onChange={(e) => void onFile(e.target.files?.[0])} />
      </label>
      {readError && <p role="alert" className="save-error">Impossible de lire ce fichier.</p>}
      {result && result.kind !== 'unknown' && <Recognized key={key} file={result} />}
      {result?.kind === 'unknown' && (
        <section className="card notice" role="status">
          <h2>Je ne reconnais pas ce fichier.</h2>
          <p className="muted">{result.reason}</p>
          <p>
            Ouvre <a href="https://claude.ai/new" target="_blank" rel="noreferrer noopener">claude.ai</a> avec le connecteur Carnet de route,
            joins ce fichier à la conversation et écris cette phrase (remplace JJ/MM par tes dates) :
          </p>
          <p><em>{RELAY_PHRASE}</em></p>
          <div className="form-actions"><CopyButton value={RELAY_PHRASE} /></div>
        </section>
      )}
    </main>
  );
}
