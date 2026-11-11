import { useOnline } from '../../offline/useOnline';

export function OfflineBanner() {
  const online = useOnline();
  if (online) return null;
  return (
    <div role="status" className="offline-banner">
      Hors ligne — consultation seulement
    </div>
  );
}
