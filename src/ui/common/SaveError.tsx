export function SaveError({ error, onRetry }: { error: string | null; onRetry: () => void }) {
  if (!error) return null;
  return (
    <div role="alert" className="save-error">
      <span>{error}</span>
      <button type="button" className="btn btn-small" onClick={onRetry}>
        Réessayer
      </button>
    </div>
  );
}
