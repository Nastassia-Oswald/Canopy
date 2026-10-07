import type {
  FuelResult, FuelType, LatLng, NearbyFuelResult, Place, PlacesResult, PoiKind, Report, ReportStatus, RouteResult, SourceInfo,
} from '../../shared/types.ts';
import { demoFuel, demoNearby, demoPlaces, demoRoute } from '../../shared/demo.ts';

export class ApiError extends Error {
  constructor(message: string, public offline = false) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, { ...init, headers: { 'Content-Type': 'application/json', ...init?.headers } });
  } catch {
    throw new ApiError('Canopy can’t reach its server. Check your connection.', true);
  }
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new ApiError(body.error ?? `Request failed (${res.status})`);
  return body;
}

/** Calls the server; in demo mode, falls back to the bundled demo data if the server is unreachable. */
async function withDemo<T>(demo: boolean, live: () => Promise<T>, local: () => T): Promise<T> {
  try {
    return await live();
  } catch (e) {
    if (demo) return local();
    throw e;
  }
}

const ll = (p: LatLng) => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`;

export const api = {
  geocode: (q: string) => request<Place[]>(`/api/geocode?q=${encodeURIComponent(q)}`),

  route: (from: Place, to: Place, demo: boolean) =>
    withDemo(
      demo,
      () => request<RouteResult>(`/api/route?from=${ll(from)}&to=${ll(to)}&fromName=${encodeURIComponent(from.name)}&toName=${encodeURIComponent(to.name)}${demo ? '&demo=1' : ''}`),
      demoRoute,
    ),

  fuel: (route: RouteResult, fuel: FuelType) =>
    withDemo(
      route.demo,
      () => request<FuelResult>('/api/fuel', { method: 'POST', body: JSON.stringify({ geometry: route.geometry, fuel, demo: route.demo }) }),
      () => demoFuel(fuel),
    ),

  nearby: (at: LatLng, fuel: FuelType, demo: boolean, radiusKm = 8) =>
    withDemo(
      demo,
      () => request<NearbyFuelResult>(`/api/fuel/nearby?at=${ll(at)}&fuel=${fuel}&radiusKm=${radiusKm}${demo ? '&demo=1' : ''}`),
      () => demoNearby(fuel, at),
    ),

  places: (route: RouteResult, kind: PoiKind, nightKm?: number) =>
    withDemo(
      route.demo,
      () => request<PlacesResult>('/api/places', { method: 'POST', body: JSON.stringify({ geometry: route.geometry, kind, nightKm, demo: route.demo }) }),
      () => demoPlaces(kind),
    ),

  reports: (ids: string[]) => (ids.length ? request<Record<string, Report>>(`/api/reports?ids=${ids.map(encodeURIComponent).join(',')}`) : Promise.resolve({})),

  report: (poiId: string, status: ReportStatus) => request<Report>('/api/reports', { method: 'POST', body: JSON.stringify({ poiId, status }) }),

  sources: () => request<SourceInfo[]>('/api/sources'),
};
