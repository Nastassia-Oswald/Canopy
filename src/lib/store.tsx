import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { FuelResult, FuelType, Place, PlacesResult, PoiKind, RouteResult, SavedStop } from '../../shared/types.ts';
import { api } from './api.ts';

export type LookingFor = 'fuel' | 'rest' | 'food' | 'stay';

export interface TripSettings {
  from: Place | null;
  to: Place | null;
  date: string; // yyyy-mm-dd
  fuel: FuelType;
  tankL: number;
  travellers: number;
  lookingFor: LookingFor[];
}

interface Async<T> { data?: T; loading: boolean; error?: string }

interface State {
  settings: TripSettings;
  route: RouteResult | null;
  saved: SavedStop[];
  /** km along the route for the overnight stop (Stay screen). */
  nightKm: number | null;
}

const today = () => new Date().toISOString().slice(0, 10);

const DEFAULT: State = {
  settings: { from: null, to: null, date: today(), fuel: 'diesel', tankL: 50, travellers: 2, lookingFor: ['fuel', 'rest', 'food', 'stay'] },
  route: null,
  saved: [],
  nightKm: null,
};

const KEY = 'canopy:v1';

function load(): State {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT;
    const s = JSON.parse(raw) as Partial<State>;
    return { ...DEFAULT, ...s, settings: { ...DEFAULT.settings, ...s.settings } };
  } catch {
    return DEFAULT;
  }
}

interface Store extends State {
  setSettings: (patch: Partial<TripSettings>) => void;
  planRoute: (demo?: boolean) => Promise<void>;
  planning: Async<RouteResult>;
  clearRoute: () => void;
  fuel: Async<FuelResult>;
  loadFuel: (force?: boolean) => void;
  places: Partial<Record<PoiKind, Async<PlacesResult>>>;
  loadPlaces: (kind: PoiKind, force?: boolean) => void;
  setNightKm: (km: number) => void;
  toggleSaved: (stop: SavedStop) => void;
  removeSaved: (id: string) => void;
  isSaved: (id: string) => boolean;
  totalSaving: number;
}

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>(load);
  const [planning, setPlanning] = useState<Async<RouteResult>>({ loading: false });
  const [fuel, setFuel] = useState<Async<FuelResult>>({ loading: false });
  const [places, setPlaces] = useState<Partial<Record<PoiKind, Async<PlacesResult>>>>({});
  const fuelKey = useRef('');
  const placesKey = useRef<Partial<Record<PoiKind, string>>>({});

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      /* storage full or disabled — the app still works for this session */
    }
  }, [state]);

  const setSettings = useCallback((patch: Partial<TripSettings>) => setState((s) => ({ ...s, settings: { ...s.settings, ...patch } })), []);

  const resetData = () => {
    setFuel({ loading: false });
    setPlaces({});
    fuelKey.current = '';
    placesKey.current = {};
  };

  const planRoute = useCallback(
    async (demo = false) => {
      const { from, to } = state.settings;
      if (!demo && (!from || !to)) return;
      setPlanning({ loading: true });
      try {
        const route = await api.route(from ?? { name: 'Lyon', lat: 45.764, lng: 4.8357 }, to ?? { name: 'Barcelona', lat: 41.3874, lng: 2.1686 }, demo);
        resetData();
        setState((s) => ({
          ...s,
          route,
          saved: s.route && sameRoute(s.route, route) ? s.saved : [],
          nightKm: null,
          settings: demo ? { ...s.settings, from: route.from, to: route.to } : s.settings,
        }));
        setPlanning({ loading: false, data: route });
      } catch (e) {
        setPlanning({ loading: false, error: (e as Error).message });
        throw e;
      }
    },
    [state.settings],
  );

  const clearRoute = useCallback(() => {
    resetData();
    setState((s) => ({ ...s, route: null, saved: [], nightKm: null }));
  }, []);

  const loadFuel = useCallback(
    (force = false) => {
      const route = state.route;
      if (!route) return;
      const key = `${route.geometry.length}:${route.distanceKm}:${state.settings.fuel}`;
      if (!force && fuelKey.current === key) return;
      fuelKey.current = key;
      setFuel((f) => ({ ...f, loading: true, error: undefined }));
      api.fuel(route, state.settings.fuel).then(
        (data) => {
          setFuel({ loading: false, data });
          // French station names come from OSM and may still be loading — refresh once, quietly.
          if (data.meta.warnings.some((w) => w.includes('still loading'))) {
            window.setTimeout(() => {
              if (fuelKey.current !== key) return;
              api.fuel(route, state.settings.fuel).then((d) => fuelKey.current === key && setFuel({ loading: false, data: d }), () => undefined);
            }, 20_000);
          }
        },
        (e: Error) => setFuel({ loading: false, error: e.message }),
      );
    },
    [state.route, state.settings.fuel],
  );

  const loadPlaces = useCallback(
    (kind: PoiKind, force = false) => {
      const route = state.route;
      if (!route) return;
      const nightKm = state.nightKm ?? route.distanceKm * 0.6;
      const key = `${route.distanceKm}:${route.geometry.length}:${kind === 'hotel' ? Math.round(nightKm) : ''}`;
      if (!force && placesKey.current[kind] === key) return;
      placesKey.current[kind] = key;
      setPlaces((p) => ({ ...p, [kind]: { ...p[kind], loading: true, error: undefined } }));
      api.places(route, kind, kind === 'hotel' ? nightKm : undefined).then(
        (data) => setPlaces((p) => ({ ...p, [kind]: { loading: false, data } })),
        (e: Error) => setPlaces((p) => ({ ...p, [kind]: { loading: false, error: e.message } })),
      );
    },
    [state.route, state.nightKm],
  );

  const setNightKm = useCallback((km: number) => setState((s) => ({ ...s, nightKm: km })), []);

  const toggleSaved = useCallback(
    (stop: SavedStop) =>
      setState((s) => ({
        ...s,
        saved: s.saved.some((x) => x.id === stop.id) ? s.saved.filter((x) => x.id !== stop.id) : [...s.saved, stop].sort((a, b) => a.kmAlong - b.kmAlong),
      })),
    [],
  );
  const removeSaved = useCallback((id: string) => setState((s) => ({ ...s, saved: s.saved.filter((x) => x.id !== id) })), []);
  const isSaved = useCallback((id: string) => state.saved.some((x) => x.id === id), [state.saved]);
  const totalSaving = useMemo(() => state.saved.reduce((sum, s) => sum + (s.saving ?? 0), 0), [state.saved]);

  const value: Store = {
    ...state,
    setSettings,
    planRoute,
    planning,
    clearRoute,
    fuel,
    loadFuel,
    places,
    loadPlaces,
    setNightKm,
    toggleSaved,
    removeSaved,
    isSaved,
    totalSaving,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

function sameRoute(a: RouteResult, b: RouteResult) {
  return a.from.lat === b.from.lat && a.from.lng === b.from.lng && a.to.lat === b.to.lat && a.to.lng === b.to.lng;
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error('useStore outside StoreProvider');
  return s;
}
