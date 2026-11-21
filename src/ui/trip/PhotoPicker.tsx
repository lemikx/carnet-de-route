import { useState } from 'react';
import { searchFreePhotos, type CommonsPhoto } from '../../media/commonsPhotos';
import { PhotoCredit } from './PhotoCredit';

export interface PhotoChoice {
  photoUrl: string | null;
  photoCredit: string | null;
  photoLicense: string | null;
  photoLicenseUrl: string | null;
}

export function PhotoPicker({
  placeName, value, onChange, disabled,
}: {
  placeName: string;
  value: PhotoChoice;
  onChange(choice: PhotoChoice): void;
  disabled?: boolean;
}) {
  const [query, setQuery] = useState(placeName);
  const [results, setResults] = useState<CommonsPhoto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function search() {
    setBusy(true);
    setError(null);
    try {
      setResults(await searchFreePhotos(query));
    } catch {
      setError('Recherche de photos impossible : vérifie ta connexion.');
      setResults(null);
    } finally {
      setBusy(false);
    }
  }

  function pick(photo: CommonsPhoto) {
    onChange({ photoUrl: photo.thumbUrl, photoCredit: `${photo.author} (${photo.pageUrl})`, photoLicense: photo.license, photoLicenseUrl: photo.licenseUrl });
    setResults(null);
  }

  return (
    <fieldset className="photo-picker">
      <legend>Photo libre de droits</legend>
      {value.photoUrl && (
        <figure className="stop-photo-preview">
          <img src={value.photoUrl} alt="" loading="lazy" />
          <PhotoCredit credit={value.photoCredit} license={value.photoLicense} licenseUrl={value.photoLicenseUrl} />
          <button type="button" className="btn btn-small" onClick={() => onChange({ photoUrl: null, photoCredit: null, photoLicense: null, photoLicenseUrl: null })} disabled={disabled}>
            Retirer la photo
          </button>
        </figure>
      )}
      <div className="row">
        <label>
          Rechercher un lieu
          <input value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
        <button type="button" className="btn" onClick={search} disabled={disabled || busy || !query.trim()}>
          {busy ? 'Recherche…' : 'Chercher'}
        </button>
      </div>
      {error && <p role="alert" className="field-error">{error}</p>}
      {results && results.length === 0 && <p className="muted">Aucune photo libre trouvée pour ce nom.</p>}
      {results && results.length > 0 && (
        <ul className="photo-results">
          {results.map((p) => (
            <li key={p.imageUrl}>
              <button type="button" className="photo-option" onClick={() => pick(p)} aria-label={`Choisir la photo ${p.title}`}>
                <img src={p.thumbUrl} alt="" loading="lazy" />
              </button>
              <span className="muted">{p.author} · {p.license}</span>
            </li>
          ))}
        </ul>
      )}
    </fieldset>
  );
}
