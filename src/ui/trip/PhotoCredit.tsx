/** Crédit d'une photo : « Photo : Auteur · Licence », l'auteur renvoyant vers la page source si elle est connue. */
export function splitCredit(credit: string | null | undefined): { author: string; source: string | null } {
  const m = /^(.*?)\s*\((https?:\/\/\S+)\)\s*$/.exec(credit ?? '');
  return m ? { author: m[1] || 'Auteur inconnu', source: m[2] } : { author: credit ?? 'Auteur inconnu', source: null };
}

export function PhotoCredit({ credit, license, licenseUrl }: { credit?: string | null; license?: string | null; licenseUrl?: string | null }) {
  const { author, source } = splitCredit(credit);
  return (
    <figcaption className="muted photo-credit">
      Photo : {source ? <a href={source} target="_blank" rel="noreferrer">{author}</a> : author}
      {license && <> · {licenseUrl ? <a href={licenseUrl} target="_blank" rel="noreferrer">{license}</a> : license}</>}
    </figcaption>
  );
}
