/**
 * Routing (OSRM) and place search (Nominatim). Both use OpenStreetMap data (ODbL).
 * The public demo servers are for light use only — self-host or use a provider in production:
 *   OSRM:      https://github.com/Project-OSRM/osrm-backend/wiki/Demo-server
 *   Nominatim: https://operations.osmfoundation.org/policies/nominatim/ (max 1 req/s, cache results)
 */
import type { Place, RouteResult } from '../shared/types.ts';
import { indexLine, simplify, type Line } from '../shared/geo.ts';
import { countriesFor } from './providers/index.ts';
import { cached, config, fetchWithTimeout, rateLimiter } from './util.ts';

const nominatimLimit = rateLimiter(1100);

interface NominatimHit {
  lat: string; lon: string; name?: string; display_name: string;
  address?: { city?: string; town?: string; village?: string; country_code?: string };
}

export async function geocode(q: string): Promise<Place[]> {
  const query = q.trim().toLowerCase();
  if (query.length < 2) return [];
  return cached(`geo:${query}`, 7 * 24 * 3600_000, () =>
    nominatimLimit(async () => {
      const url = `${config.nominatimUrl}/search?format=jsonv2&addressdetails=1&limit=5&accept-language=en&q=${encodeURIComponent(query)}`;
      const hits = (await (await fetchWithTimeout(url, { timeoutMs: 15_000 })).json()) as NominatimHit[];
      return hits.map((h) => ({
        name: h.name || h.address?.city || h.address?.town || h.address?.village || h.display_name.split(',')[0]!,
        label: h.display_name,
        lat: Number(h.lat),
        lng: Number(h.lon),
        countryCode: h.address?.country_code,
      }));
    }),
  );
}

export async function route(from: Place, to: Place): Promise<RouteResult> {
  const key = `route:${from.lat.toFixed(4)},${from.lng.toFixed(4)}>${to.lat.toFixed(4)},${to.lng.toFixed(4)}`;
  return cached(key, 24 * 3600_000, async () => {
    const url = `${config.osrmUrl}/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`;
    const json = (await (await fetchWithTimeout(url, { timeoutMs: 30_000 })).json()) as {
      code: string;
      message?: string;
      routes?: { distance: number; duration: number; geometry: { coordinates: Line } }[];
    };
    const r = json.routes?.[0];
    if (json.code !== 'Ok' || !r) throw new Error(`Routing failed: ${json.message ?? json.code}`);
    const line = simplify(r.geometry.coordinates, 0.08);
    const il = indexLine(line);
    return {
      from,
      to,
      distanceKm: Math.round(r.distance / 1000),
      durationMin: Math.round(r.duration / 60),
      geometry: line.map(([x, y]) => [Math.round(x * 1e5) / 1e5, Math.round(y * 1e5) / 1e5] as [number, number]),
      countries: countriesFor(il.bbox),
      demo: false,
    };
  });
}
