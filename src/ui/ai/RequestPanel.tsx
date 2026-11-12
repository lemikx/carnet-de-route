import { useState } from 'react';
import { buildContinuePrompt } from '../../ai/promptBuilder';
import type { ParseResult } from '../../ai/responseParser';
import { CopyButton } from '../common/CopyButton';

export function RequestPanel({
  kind, prompt, openUrl, onPaste,
}: {
  kind: 'ideas' | 'itinerary';
  prompt: string;
  openUrl: string | null;
  onPaste(text: string): Promise<ParseResult<unknown>>;
}) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ParseResult<unknown> | null>(null);
  const cont = buildContinuePrompt();

  async function analyse() {
    setBusy(true);
    try {
      setResult(await onPaste(text));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <h2>{kind === 'ideas' ? 'Étape 1 : demande les idées à Claude' : 'Étape 2 : demande l’itinéraire à Claude'}</h2>
      <p>Copie cette demande dans Claude, puis colle sa réponse ci-dessous. <strong>Active la recherche web dans Claude</strong> pour des visas et des prix à jour.</p>
      <textarea readOnly rows={8} aria-label="Demande à copier" value={prompt} />
      <div className="form-actions">
        <CopyButton value={prompt} />
        {openUrl && <a className="btn btn-small" href={openUrl} target="_blank" rel="noreferrer noopener">Ouvrir dans Claude</a>}
      </div>

      <label className="field">Réponse de Claude
        <textarea rows={8} value={text} onChange={(e) => setText(e.target.value)} />
      </label>
      <button type="button" className="btn btn-primary" disabled={busy || !text.trim()} onClick={() => void analyse()}>Analyser la réponse</button>

      {result && !result.ok && (
        <div role="alert" className="save-error">
          <ul>{result.errors.map((e, i) => <li key={i}>{e}</li>)}</ul>
          {result.truncated && (
            <div>
              <p><strong>La réponse semble coupée.</strong> Envoie cette demande à Claude dans la même conversation, puis colle toute la réponse :</p>
              <p><em>{cont}</em></p>
              <CopyButton value={cont} />
            </div>
          )}
        </div>
      )}
      {result?.ok && result.warnings.length > 0 && (
        <ul className="muted">{result.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
      )}
    </section>
  );
}
