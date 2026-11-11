import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createMemoryRepository } from '../data/memoryRepository';
import { createSupabaseRepository } from '../data/supabaseRepository';
import type { TripRepository } from '../data/TripRepository';
import { createCachedRepository } from '../offline/cachedRepository';
import { isOnlineNow } from '../offline/useOnline';
import { createEdgeRouting } from '../routing/edgeRouting';
import { createFakeRouting } from '../routing/fakeRouting';
import type { RoutingService } from '../routing/RoutingService';
import { createTripService, type TripService } from '../services/tripService';
import { DEFAULT_HEAVY_THRESHOLD_MIN } from '../domain/schedule';
import { getDataMode, type DataMode } from './config';
import { isNetworkAuthError, readLastEmail, resolveUser, writeLastEmail, type AppUser } from './auth';

export interface Settings {
  heavyThresholdMin: number;
}

export interface AppValue {
  mode: DataMode;
  repo: TripRepository;
  service: TripService;
  routing: RoutingService;
  user: AppUser | null;
  authReady: boolean;
  supabase: SupabaseClient | null;
  supabaseUrl: string;
  settings: Settings;
  setSettings(s: Settings): void;
  signIn(email: string): Promise<void>;
  signOut(): Promise<void>;
}

const SETTINGS_KEY = 'carnet-de-route:settings';
const AppContext = createContext<AppValue | null>(null);

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return { heavyThresholdMin: DEFAULT_HEAVY_THRESHOLD_MIN, ...JSON.parse(raw) };
  } catch {
    /* stockage indisponible */
  }
  return { heavyThresholdMin: DEFAULT_HEAVY_THRESHOLD_MIN };
}

function safeStorage() {
  try {
    localStorage.setItem('carnet-de-route:probe', '1');
    return localStorage;
  } catch {
    return undefined;
  }
}

export function useApp(): AppValue {
  const v = useContext(AppContext);
  if (!v) throw new Error('useApp hors de AppProvider');
  return v;
}

/** Fournisseur pour les tests : services injectés, utilisateur connecté. */
export function TestAppProvider({ repo, routing, children }: { repo: TripRepository; routing?: RoutingService; children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>({ heavyThresholdMin: DEFAULT_HEAVY_THRESHOLD_MIN });
  const r = routing ?? createFakeRouting();
  const value = useMemo<AppValue>(
    () => ({
      mode: 'memory', repo, routing: r, service: createTripService(repo, r), user: { email: 'test@example.com' }, authReady: true,
      supabase: null, supabaseUrl: '', settings, setSettings, signIn: async () => {}, signOut: async () => {},
    }),
    [repo, r, settings],
  );
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function AppProvider({ children }: { children: ReactNode }) {
  const env = import.meta.env as Record<string, string | undefined>;
  const mode = getDataMode(env);
  const supabaseUrl = env.VITE_SUPABASE_URL ?? '';
  const [settings, setSettingsState] = useState<Settings>(loadSettings);
  const [user, setUser] = useState<AppUser | null>(mode === 'memory' ? { email: 'démo' } : null);
  const [authReady, setAuthReady] = useState(mode === 'memory');

  const core = useMemo(() => {
    if (mode === 'supabase') {
      const supabase = createClient(supabaseUrl, env.VITE_SUPABASE_ANON_KEY ?? '');
      const routing = createEdgeRouting(`${supabaseUrl}/functions/v1/routes`, async () => (await supabase.auth.getSession()).data.session?.access_token ?? null);
      const repo = createCachedRepository(createSupabaseRepository(supabase), isOnlineNow);
      return { supabase, routing, repo };
    }
    const repo = createCachedRepository(createMemoryRepository({ storage: safeStorage() }), isOnlineNow);
    return { supabase: null, routing: createFakeRouting(), repo };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, supabaseUrl]);

  useEffect(() => {
    if (!core.supabase) return;
    const sb = core.supabase;
    const apply = (email: string | null, networkError = false) => {
      const u = resolveUser(email, { online: isOnlineNow(), lastEmail: readLastEmail(), networkError });
      if (u && !u.offlineOnly) writeLastEmail(u.email);
      setUser(u);
      setAuthReady(true);
    };
    const check = () =>
      sb.auth.getSession().then(
        ({ data, error }) => apply(data.session?.user.email ?? null, isNetworkAuthError(error)),
        (e) => apply(null, isNetworkAuthError(e)),
      );
    void check();
    const { data } = sb.auth.onAuthStateChange((_event, session) => {
      // Hors ligne, une session non renouvelable ne doit pas déconnecter l'utilisateur.
      if (!session && !isOnlineNow()) return apply(null, true);
      apply(session?.user.email ?? null);
    });
    window.addEventListener('online', check);
    return () => {
      data.subscription.unsubscribe();
      window.removeEventListener('online', check);
    };
  }, [core.supabase]);

  const value = useMemo<AppValue>(
    () => ({
      mode,
      ...core,
      service: createTripService(core.repo, core.routing),
      user,
      authReady,
      supabaseUrl,
      settings,
      setSettings(s) {
        setSettingsState(s);
        try {
          localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
        } catch {
          /* stockage indisponible */
        }
      },
      async signIn(email) {
        if (!core.supabase) return;
        const { error } = await core.supabase.auth.signInWithOtp({
          email,
          options: { emailRedirectTo: location.origin + location.pathname },
        });
        if (error) throw error;
      },
      async signOut() {
        writeLastEmail(null);
        await core.supabase?.auth.signOut();
        setUser(null);
      },
    }),
    [mode, core, user, authReady, supabaseUrl, settings],
  );
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
