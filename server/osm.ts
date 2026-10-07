/**
 * OpenStreetMap data via the Overpass API. © OpenStreetMap contributors, ODbL 1.0.
 * The public Overpass servers are for light use — set OVERPASS_URL to your own instance in production.
 */
import type { FuelStation, LatLng, Poi, PoiKind } from '../shared/types.ts';
import { haversineKm, locateOnLine, resample, type IndexedLine } from '../shared/geo.ts';
import { cached, config, fetchWithTimeout, hashKey, mapLimit, rateLimiter } from './util.ts';

interface OsmElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  geometry?: { lat: number; lon: number }[];
  tags?: Record<string, string>;
}

const limit = rateLimiter(1100); // be polite: at most ~1 query per second
/** Instances that failed recently are skipped for 10 minutes. */
const benchedUntil = new Map<string, number>();

async function overpass(query: string, timeoutMs = 90_000): Promise<OsmElement[]> {
  return limit(async () => {
    const errors: string[] = [];
    const now = Date.now();
    const urls = config.overpassUrls.filter((u) => (benchedUntil.get(u) ?? 0) < now);
    for (const url of urls.length ? urls : config.overpassUrls) {
      try {
        const res = await fetchWithTimeout(url, {
          method: 'POST',
          timeoutMs,
          headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
          body: 'data=' + encodeURIComponent(query),
        });
        const json = (await res.json()) as { elements?: OsmElement[]; remark?: string };
        if (json.remark && /runtime error|timed out|out of memory/i.test(json.remark)) throw new Error(json.remark);
        return json.elements ?? [];
      } catch (e) {
        benchedUntil.set(url, Date.now() + 10 * 60_000);
        errors.push(`${new URL(url).host}: ${(e as Error).message.split(' — ')[0]}`);
      }
    }
    throw new Error(`Overpass unavailable (${errors.join('; ')})`);
  });
}

const pos = (e: OsmElement): LatLng | undefined =>
  e.lat !== undefined && e.lon !== undefined ? { lat: e.lat, lng: e.lon } : e.center ? { lat: e.center.lat, lng: e.center.lon } : undefined;

const around = (pts: LatLng[]) => pts.map((p) => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`).join(',');

/**
 * Long "around a polyline" queries are too heavy for public Overpass servers, so we split
 * the route into ~60 km pieces and query them a few at a time. Failed pieces are reported,
 * the rest is still returned.
 */
async function chunkedAround(
  il: IndexedLine,
  stepKm: number,
  body: (coords: string) => string,
): Promise<{ elements: OsmElement[]; failed: number; total: number }> {
  const pts = resample(il, stepKm);
  const per = Math.max(2, Math.round(60 / stepKm));
  const chunks: LatLng[][] = [];
  for (let i = 0; i < pts.length - 1; i += per) chunks.push(pts.slice(i, i + per + 1));
  const results = await mapLimit(chunks, 3, (c) => overpass(`[out:json][timeout:40];\n${body(around(c))}`, 50_000));
  const seen = new Set<string>();
  const elements: OsmElement[] = [];
  let failed = 0;
  for (const r of results) {
    if (r.status === 'rejected') { failed++; continue; }
    for (const e of r.value) {
      const k = `${e.type}${e.id}`;
      if (!seen.has(k)) { seen.add(k); elements.push(e); }
    }
  }
  if (failed === results.length) throw new Error((results[0] as PromiseRejectedResult).reason?.message ?? 'Overpass failed');
  return { elements, failed, total: results.length };
}

export interface PartialPois { pois: Poi[]; warning?: string }

const yes = (v?: string) => v === 'yes' || v === 'designated';

// ── Places along a route ──────────────────────────────────
export async function placesAlongRoute(il: IndexedLine, kind: Exclude<PoiKind, 'hotel'>): Promise<PartialPois> {
  const key = `places:${kind}:${hashKey(il.line)}`;
  return cached(key, 6 * 3600_000, async () => {
    if (kind === 'rest') return restAreas(il);
    return food(il);
  });
}

async function restAreas(il: IndexedLine): Promise<PartialPois> {
  const { elements: els, failed, total } = await chunkedAround(
    il,
    4,
    // exact tag matches use Overpass's tag index and are much cheaper than regexes
    (c) => `(nwr["highway"="rest_area"](around:350,${c});nwr["highway"="services"](around:350,${c});node["amenity"="toilets"](around:350,${c}););out center tags;`,
  );
  const areas = els.filter((e) => e.tags?.highway === 'rest_area' || e.tags?.highway === 'services');
  const toilets = els.filter((e) => e.tags?.amenity === 'toilets');

  const pois: Poi[] = [];
  for (const a of areas) {
    const p = pos(a);
    if (!p) continue;
    const t = a.tags ?? {};
    // toilets inside/near this area
    const near = toilets.filter((x) => {
      const q2 = pos(x);
      return q2 && haversineKm(p, q2) < 0.35;
    });
    const tt = near[0]?.tags ?? {};
    pois.push({
      id: `osm-${a.type}-${a.id}`,
      kind: 'rest',
      name: t.name || (t.highway === 'services' ? 'Service area' : 'Rest area'),
      ...p,
      ...locateOnLine(p, il),
      facts: {
        toilets: near.length > 0 || yes(t.toilets),
        toiletsFee: tt.fee === 'yes' ? true : tt.fee === 'no' ? false : undefined,
        wheelchair: yes(tt.wheelchair) || yes(t['toilets:wheelchair']),
        openingHours: tt.opening_hours,
      },
    });
  }
  // standalone public toilets very close to the route
  for (const x of toilets) {
    const p = pos(x);
    if (!p) continue;
    if (pois.some((a) => haversineKm(a, p) < 0.35)) continue;
    const t = x.tags ?? {};
    if (t.access === 'private' || t.access === 'customers') continue;
    pois.push({
      id: `osm-${x.type}-${x.id}`,
      kind: 'rest',
      name: t.name || 'Public toilets',
      ...p,
      ...locateOnLine(p, il),
      facts: { toilets: true, toiletsFee: t.fee === 'yes' ? true : t.fee === 'no' ? false : undefined, wheelchair: yes(t.wheelchair), openingHours: t.opening_hours },
    });
  }
  // de-duplicate the two sides of a motorway area that share a name
  const seen = new Set<string>();
  const out = pois
    .sort((a, b) => a.kmAlong - b.kmAlong)
    .filter((p) => {
      const k = `${p.name}:${Math.round(p.kmAlong / 2)}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  return { pois: out, warning: failed ? `${failed} of ${total} route sections could not be loaded.` : undefined };
}

async function food(il: IndexedLine): Promise<PartialPois> {
  const { elements: els, failed, total } = await chunkedAround(
    il,
    6,
    (c) => `(nwr["amenity"="restaurant"]["name"](around:1000,${c});nwr["amenity"="cafe"]["name"](around:1000,${c});nwr["amenity"="fast_food"]["name"](around:1000,${c}););out center tags 400;`,
  );
  const all: Poi[] = [];
  for (const e of els) {
    const p = pos(e);
    if (!p) continue;
    const t = e.tags ?? {};
    all.push({
      id: `osm-${e.type}-${e.id}`,
      kind: 'food',
      name: t.name!,
      ...p,
      ...locateOnLine(p, il),
      facts: {
        cuisine: t.cuisine?.split(';').map((c) => c.trim()).filter(Boolean),
        vegetarian: yes(t['diet:vegetarian']) || t['diet:vegetarian'] === 'only',
        openingHours: t.opening_hours,
        city: t['addr:city'],
        website: t.website || t['contact:website'],
        wheelchair: yes(t.wheelchair),
      },
    });
  }
  // Spread results along the route: at most 4 per 20 km, closest to the route first.
  const buckets = new Map<number, Poi[]>();
  for (const p of all.sort((a, b) => a.offRouteKm - b.offRouteKm)) {
    const b = Math.floor(p.kmAlong / 20);
    const list = buckets.get(b) ?? [];
    if (list.length < 4) list.push(p);
    buckets.set(b, list);
  }
  const pois = [...buckets.values()].flat().sort((a, b) => a.kmAlong - b.kmAlong);
  return { pois, warning: failed ? `${failed} of ${total} route sections could not be loaded.` : undefined };
}

// ── Hotels around an overnight point ──────────────────────
export async function hotelsNear(at: LatLng, radiusKm: number, il?: IndexedLine): Promise<Poi[]> {
  const key = `hotels:${at.lat.toFixed(3)},${at.lng.toFixed(3)}:${radiusKm}`;
  const els = await cached(key, 6 * 3600_000, () =>
    overpass(`[out:json][timeout:60];
(nwr["tourism"="hotel"]["name"](around:${Math.round(radiusKm * 1000)},${at.lat},${at.lng});nwr["tourism"="motel"]["name"](around:${Math.round(radiusKm * 1000)},${at.lat},${at.lng});nwr["tourism"="guest_house"]["name"](around:${Math.round(radiusKm * 1000)},${at.lat},${at.lng}););
out center tags 300;`),
  );
  return els
    .map((e): Poi | undefined => {
      const p = pos(e);
      if (!p) return undefined;
      const t = e.tags ?? {};
      const stars = Number.parseFloat(t.stars ?? '');
      return {
        id: `osm-${e.type}-${e.id}`,
        kind: 'hotel',
        name: t.name!,
        ...p,
        ...(il ? locateOnLine(p, il) : { kmAlong: 0, offRouteKm: haversineKm(at, p) }),
        facts: {
          stars: Number.isFinite(stars) ? stars : undefined,
          parking: Boolean(t.parking) || t['parking:fee'] === 'no' || yes(t['amenity:parking']),
          wifi: t.internet_access === 'wlan' || t.internet_access === 'yes' || yes(t.wifi),
          city: t['addr:city'],
          website: t.website || t['contact:website'],
          wheelchair: yes(t.wheelchair),
        },
      };
    })
    .filter((x): x is Poi => Boolean(x))
    .sort((a, b) => a.offRouteKm - b.offRouteKm)
    .slice(0, 60);
}

// ── Station names for France (the official feed has none) ──
export async function enrichFuelNames(il: IndexedLine, stations: FuelStation[]): Promise<void> {
  const fr = stations.filter((s) => s.country === 'FR');
  if (!fr.length) return;
  const key = `fuelnames:${hashKey(il.line)}`;
  const els = await cached(key, 24 * 3600_000, async () =>
    (await chunkedAround(il, 5, (c) => `nwr["amenity"="fuel"](around:2500,${c});out center tags;`)).elements,
  );
  applyNames(els, fr);
}

/** Same as enrichFuelNames, for a radius around a point (map screen). */
export async function enrichFuelNamesNear(at: LatLng, radiusKm: number, stations: FuelStation[]): Promise<void> {
  const fr = stations.filter((s) => s.country === 'FR');
  if (!fr.length) return;
  const key = `fuelnames-near:${at.lat.toFixed(2)},${at.lng.toFixed(2)}:${radiusKm}`;
  const els = await cached(key, 24 * 3600_000, () =>
    overpass(`[out:json][timeout:25];nwr["amenity"="fuel"](around:${Math.round(radiusKm * 1000) + 500},${at.lat},${at.lng});out center tags;`, 30_000),
  );
  applyNames(els, fr);
}

function applyNames(els: OsmElement[], fr: FuelStation[]) {
  const osm = els.map((e) => ({ p: pos(e), t: e.tags ?? {} })).filter((x): x is { p: LatLng; t: Record<string, string> } => Boolean(x.p));
  for (const s of fr) {
    let best: { d: number; t: Record<string, string> } | undefined;
    for (const o of osm) {
      const d = haversineKm(s, o.p);
      if (d < 0.25 && (!best || d < best.d)) best = { d, t: o.t };
    }
    if (best) {
      const brand = best.t.brand || best.t.operator;
      const name = brand || best.t.name;
      if (name) s.name = name;
      if (brand) s.brand = brand;
    }
  }
}

// ── Roads around a point, for drawing the map ─────────────
export async function roadsNear(at: LatLng, radiusKm: number) {
  const key = `roads:${at.lat.toFixed(2)},${at.lng.toFixed(2)}:${radiusKm}`;
  const els = await cached(key, 24 * 3600_000, () =>
    overpass(`[out:json][timeout:60];
way["highway"~"^(motorway|trunk|primary|secondary|tertiary)$"](around:${Math.round(radiusKm * 1000)},${at.lat},${at.lng});
out geom 600;`),
  );
  return els
    .filter((e) => e.geometry?.length)
    .map((e) => {
      const h = e.tags?.highway ?? '';
      const kind: 'motorway' | 'major' | 'minor' = h === 'motorway' || h === 'trunk' ? 'motorway' : h === 'primary' || h === 'secondary' ? 'major' : 'minor';
      return { kind, ref: e.tags?.ref, coords: e.geometry!.map((g) => [g.lon, g.lat] as [number, number]) };
    });
}
