import { registerSW } from 'virtual:pwa-register';
import { applyNow } from './pwaPolicy';

const CHECK_EVERY_MS = 30 * 60 * 1000;

/** Mise à jour automatique : rechargement au démarrage ou en arrière-plan, jamais en pleine saisie. */
export function setupAutoUpdate(): void {
  const loadedAt = Date.now();
  let pending = false;
  const updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      pending = true;
      if (applyNow({ hidden: document.hidden, msSinceLoad: Date.now() - loadedAt })) void updateSW(true);
    },
    onRegisteredSW(_url, registration) {
      if (!registration) return;
      const check = () => { void registration.update().catch(() => {}); };
      setInterval(check, CHECK_EVERY_MS);
      document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
    },
  });
  document.addEventListener('visibilitychange', () => {
    if (pending && document.hidden) void updateSW(true);
  });
}
