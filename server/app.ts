import express, { type NextFunction, type Request, type Response } from 'express';
import type {
  ApiMeta, Country, FuelResult, FuelStationOnRoute, FuelType, LatLng, NearbyFuelResult, Place, PlacesResult, PoiKind,
} from '../shared/types.ts';
import { haversineKm, indexLine, locateOnLine, nearBbox, pointAtKm, type Line } from '../shared/geo.ts';
import { demoFuel, demoNearby, demoPlaces, demoRoute } from '../shared/demo.ts';
import { enrichFuelNames, enrichFuelNamesNear, hotelsNear, placesAlongRoute, roadsNear } from './osm.ts';
import { PROVIDERS, countriesFor, nearbySnapshot, snapshot } from './providers/index.ts';
import { addReport, latestReports } from './reports.ts';
import { geocode, route } from './routing.ts';
import { sources } from './sources.ts';

/** The API as an Express app. Used by server/index.ts (Node) and server/vercel.ts (Vercel function). */
export const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));

// ── helpers ────────────────────────────────────────────────
const FUELS: FuelType[] = ['diesel', 'e10', 'sp95', 'sp98', 'lpg'];
const KINDS: PoiKind[] = ['rest', 'food', 'hotel'];

class BadRequest extends Error {}

function parseFuel(v: unknown): FuelType {
  if (typeof v === 'string' && (FUELS as string[]).includes(v)) return v as FuelType;
  return 'diesel';
}

function parseLatLng(v: unknown, name: string): LatLng {
  const m = typeof v === 'string' ? v.match(/^(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/) : null;
  if (!m) throw new BadRequest(`${name} must be "lat,lng"`);
  const lat = Number(m[1]), lng = Number(m[2]);
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) throw new BadRequest(`${name} out of range`);
  return { lat, lng };
}

function parseGeometry(v: unknown): Line {
  if (!Array.isArray(v) || v.length < 2 || v.length > 6000) throw new BadRequest('geometry must be 2–6000 [lng,lat] pairs');
  return v.map((p) => {
    if (!Array.isArray(p) || p.length !== 2 || !p.every((n) => typeof n === 'number' && Number.isFinite(n))) {
      throw new BadRequest('geometry must be [lng,lat] number pairs');
    }
    return [p[0], p[1]] as [number, number];
  });
}

const isDemo = (req: Request) => req.query.demo === '1' || req.body?.demo === true;

const wrap = (fn: (req: Request, res: Response) => Promise<unknown>) => (req: Request, res: Response, next: NextFunction) =>
  fn(req, res).catch(next);

// ── API ────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => res.json({ ok: true, time: new Date().toISOString() }));

app.get('/api/sources', (_req, res) => res.json(sources()));

app.get('/api/geocode', wrap(async (req, res) => {
  const q = String(req.query.q ?? '');
  try {
    res.json(await geocode(q));
  } catch (e) {
    res.status(502).json({ error: (e as Error).message });
  }
}));

app.get('/api/route', wrap(async (req, res) => {
  if (isDemo(req)) return res.json(demoRoute());
  const from: Place = { ...parseLatLng(req.query.from, 'from'), name: String(req.query.fromName ?? 'Start') };
  const to: Place = { ...parseLatLng(req.query.to, 'to'), name: String(req.query.toName ?? 'Destination') };
  try {
    res.json(await route(from, to));
  } catch (e) {
    res.status(502).json({ error: (e as Error).message });
  }
}));

/** Fuel stations along a route (POST because the route line can be long). */
app.post('/api/fuel', wrap(async (req, res) => {
  const fuel = parseFuel(req.body?.fuel);
  if (isDemo(req)) return res.json(demoFuel(fuel));
  const line = parseGeometry(req.body?.geometry);
  const maxOffKm = Math.min(10, Math.max(0.2, Number(req.body?.maxOffKm ?? 2)));
  const il = indexLine(line);
  const countries = countriesFor(il.bbox);

  const meta: ApiMeta = { demo: false, sources: [], warnings: [] };
  const averages: Partial<Record<Country, number>> = {};
  const stations: FuelStationOnRoute[] = [];

  const results = await Promise.allSettled(
    PROVIDERS.filter((p) => countries.includes(p.country) && p.load && p.configured()).map(async (p) => ({ p, snap: await snapshot(p) })),
  );
  for (const r of results) {
    if (r.status === 'rejected') {
      meta.warnings.push(String((r.reason as Error).message));
      continue;
    }
    const { p, snap } = r.value;
    meta.sources.push(p.source);
    const avg = snap.averages[fuel];
    if (avg !== undefined) averages[p.country] = avg;
    for (const s of snap.stations) {
      if (s.prices[fuel] === undefined || !nearBbox(s, il, maxOffKm)) continue;
      const loc = locateOnLine(s, il);
      if (loc.offRouteKm <= maxOffKm) stations.push({ ...s, ...loc });
    }
  }
  for (const c of countries) {
    const p = PROVIDERS.find((x) => x.country === c);
    if (p && !p.configured()) meta.warnings.push(`${c}: not configured — prices not shown.`);
    else if (p && !p.load) meta.warnings.push(`${c}: the free API only supports nearby search, so route prices aren't shown.`);
  }

  // France has no station names in the official feed — add them from OSM, but don't make
  // the user wait more than ~12 s for it (the lookup keeps running and is cached for next time).
  if (stations.some((s) => s.country === 'FR')) {
    const enrich = enrichFuelNames(il, stations).then(() => 'ok' as const);
    enrich.catch(() => undefined);
    const outcome = await Promise.race([enrich, new Promise<'timeout'>((r) => setTimeout(() => r('timeout'), 12_000))]).catch(
      (e: Error) => e,
    );
    if (outcome === 'ok') meta.sources.push('osm');
    else if (outcome === 'timeout') meta.warnings.push('Some French station names are still loading — refresh in a moment.');
    else meta.warnings.push(`Station names: ${(outcome as Error).message}`);
  }

  stations.sort((a, b) => (a.prices[fuel] ?? 9) - (b.prices[fuel] ?? 9));
  const out: FuelResult = { fuel, stations: stations.slice(0, 400), averages, meta };
  res.json(out);
}));

/** Fuel near a point (map screen). */
app.get('/api/fuel/nearby', wrap(async (req, res) => {
  const fuel = parseFuel(req.query.fuel);
  const at = parseLatLng(req.query.at, 'at');
  const radiusKm = Math.min(25, Math.max(1, Number(req.query.radiusKm ?? 8)));
  if (isDemo(req)) return res.json(demoNearby(fuel, at));

  const bbox: [number, number, number, number] = [at.lng - 0.3, at.lat - 0.3, at.lng + 0.3, at.lat + 0.3];
  const countries = countriesFor(bbox);
  const meta: ApiMeta = { demo: false, sources: [], warnings: [] };
  const averages: Partial<Record<Country, number>> = {};
  const stations: NearbyFuelResult['stations'] = [];

  // Roads are only decoration for the map: fetch them in parallel and never wait more than 8 s.
  const roadsP = Promise.race([
    roadsNear(at, Math.min(radiusKm, 8)).then((r) => ({ ok: true as const, r })),
    new Promise<{ ok: false; msg: string }>((res) => setTimeout(() => res({ ok: false, msg: 'Map roads are still loading.' }), 8_000)),
  ]).catch((e: Error) => ({ ok: false as const, msg: `Map roads: ${e.message}` }));

  const results = await Promise.allSettled(
    PROVIDERS.filter((p) => countries.includes(p.country) && p.configured()).map(async (p) => ({ p, snap: await nearbySnapshot(p, at, radiusKm) })),
  );
  for (const r of results) {
    if (r.status === 'rejected') { meta.warnings.push(String((r.reason as Error).message)); continue; }
    const { p, snap } = r.value;
    meta.sources.push(p.source);
    const avg = snap.averages[fuel];
    if (avg !== undefined) averages[p.country] = avg;
    for (const s of snap.stations) {
      if (s.prices[fuel] === undefined) continue;
      const d = haversineKm(at, s);
      if (d <= radiusKm) stations.push({ ...s, distanceKm: d });
    }
  }
  if (stations.some((s) => s.country === 'FR')) {
    const named = await Promise.race([
      enrichFuelNamesNear(at, radiusKm, stations).then(() => true),
      new Promise<boolean>((r) => setTimeout(() => r(false), 6_000)),
    ]).catch(() => false);
    if (!named) meta.warnings.push('Some station names are still loading.');
  }
  let roads: NearbyFuelResult['roads'] = [];
  const rr = await roadsP;
  if (rr.ok) { roads = rr.r; meta.sources.push('osm'); } else meta.warnings.push(rr.msg);
  stations.sort((a, b) => a.distanceKm - b.distanceKm);
  res.json({ fuel, stations: stations.slice(0, 40), averages, roads, meta } satisfies NearbyFuelResult);
}));

/** Rest areas / food along the route, hotels around an overnight point. */
app.post('/api/places', wrap(async (req, res) => {
  const kind = req.body?.kind as PoiKind;
  if (!KINDS.includes(kind)) throw new BadRequest('kind must be rest | food | hotel');
  if (isDemo(req)) return res.json(demoPlaces(kind));
  const il = indexLine(parseGeometry(req.body?.geometry));
  const meta: ApiMeta = { demo: false, sources: ['osm'], warnings: [] };
  try {
    let pois;
    if (kind === 'hotel') {
      const km = Number(req.body?.nightKm);
      const at = pointAtKm(il, Number.isFinite(km) ? km : il.totalKm / 2);
      pois = await hotelsNear(at, Math.min(15, Math.max(1, Number(req.body?.radiusKm ?? 12))), il);
    } else {
      const r = await placesAlongRoute(il, kind);
      pois = r.pois;
      if (r.warning) meta.warnings.push(r.warning);
    }
    res.json({ kind, pois, meta } satisfies PlacesResult);
  } catch (e) {
    meta.warnings.push((e as Error).message);
    res.status(502).json({ kind, pois: [], meta, error: (e as Error).message });
  }
}));

app.get('/api/reports', (req, res) => {
  const ids = String(req.query.ids ?? '').split(',').filter(Boolean).slice(0, 300);
  res.json(latestReports(ids));
});

app.post('/api/reports', (req, res) => {
  try {
    res.status(201).json(addReport(String(req.body?.poiId ?? ''), String(req.body?.status ?? ''), req.ip ?? 'unknown'));
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));

// ── errors ─────────────────────────────────────────────────
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  const status = err instanceof BadRequest ? 400 : 500;
  if (status === 500) console.error(err);
  res.status(status).json({ error: err.message });
});

