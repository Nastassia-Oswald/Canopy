import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Fuel, LoaderCircle, LocateFixed, Minus, Plus, Search } from 'lucide-react';
import { FUEL_LABELS, type LatLng, type NearbyFuelResult } from '../../shared/types.ts';
import { indexLine, locateOnLine, pointAtKm } from '../../shared/geo.ts';
import { AddButton, IconCircle, NavBar } from '../components/ui.tsx';
import { api } from '../lib/api.ts';
import { ago, offRoute, perL, vsAverage } from '../lib/format.ts';
import { useStore } from '../lib/store.tsx';

const SPANS = [3, 6, 12, 20]; // visible width in km

interface Pos extends LatLng { simulated: boolean }

export function MapScreen() {
  const { route, settings, toggleSaved, isSaved } = useStore();
  const il = useMemo(() => (route ? indexLine(route.geometry) : null), [route]);
  const box = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 390, h: 760 });
  const [gps, setGps] = useState<LatLng | null>(null);
  const [gpsError, setGpsError] = useState('');
  const [spanIdx, setSpanIdx] = useState(1);
  const [data, setData] = useState<NearbyFuelResult>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<string | null>(null);

  // container size
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => e && setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // live location
  useEffect(() => {
    if (!navigator.geolocation) { setGpsError('Location not available'); return; }
    const id = navigator.geolocation.watchPosition(
      (p) => { setGps({ lat: p.coords.latitude, lng: p.coords.longitude }); setGpsError(''); },
      (e) => setGpsError(e.code === 1 ? 'Location is off' : 'Couldn’t get your location'),
      { enableHighAccuracy: true, maximumAge: 30_000, timeout: 15_000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);

  // Where to centre: real GPS if it's on/near the route (or there is no route), else a simulated point on the route.
  const pos: Pos | null = useMemo(() => {
    if (gps && (!il || locateOnLine(gps, il).offRouteKm < 40)) return { ...gps, simulated: false };
    if (il) return { ...pointAtKm(il, il.totalKm * 0.24), simulated: true };
    return null;
  }, [gps, il]);

  const key = pos ? `${pos.lat.toFixed(2)},${pos.lng.toFixed(2)}:${settings.fuel}` : '';
  useEffect(() => {
    if (!pos) return;
    let cancelled = false;
    setLoading(true);
    setError('');
    api.nearby(pos, settings.fuel, Boolean(route?.demo), 10).then(
      (d) => {
        if (cancelled) return;
        setData(d);
        setLoading(false);
        setSelected(null);
        // zoom so the cheapest nearby station is on screen
        const near = d.stations.filter((s) => s.distanceKm <= 5 && s.prices[settings.fuel] !== undefined);
        const best = [...(near.length ? near : d.stations)].sort((a, b) => (a.prices[settings.fuel] ?? 9) - (b.prices[settings.fuel] ?? 9))[0];
        if (best) {
          const need = best.distanceKm * 2.3;
          const idx = SPANS.findIndex((x) => x >= need);
          setSpanIdx(idx === -1 ? SPANS.length - 1 : idx);
        }
      },
      (e: Error) => { if (!cancelled) { setError(e.message); setLoading(false); } },
    );
    return () => { cancelled = true; };
  }, [key]);

  const spanKm = SPANS[spanIdx]!;
  const project = useMemo(() => {
    if (!pos) return null;
    const pxPerKm = size.w / spanKm;
    const kx = 111.32 * Math.cos((pos.lat * Math.PI) / 180), ky = 110.574;
    const cy = size.h * 0.4;
    return (lng: number, lat: number): [number, number] => [size.w / 2 + (lng - pos.lng) * kx * pxPerKm, cy - (lat - pos.lat) * ky * pxPerKm];
  }, [pos, size, spanKm]);

  const fuel = settings.fuel;
  const stations = useMemo(() => (data?.stations ?? []).filter((s) => s.prices[fuel] !== undefined), [data, fuel]);
  const cheapest = useMemo(() => Math.min(...stations.map((s) => s.prices[fuel]!)), [stations, fuel]);

  // "Closest cheap fuel": cheapest within 5 km; if none, cheapest overall; ties → nearest.
  const pick = useMemo(() => {
    if (selected) return stations.find((s) => s.id === selected);
    const near = stations.filter((s) => s.distanceKm <= 5);
    const pool = near.length ? near : stations;
    return [...pool].sort((a, b) => a.prices[fuel]! - b.prices[fuel]! || a.distanceKm - b.distanceKm)[0];
  }, [stations, selected, fuel]);

  // Price pins: cheapest first, skip any that would overlap one already placed.
  const pins = useMemo(() => {
    if (!project) return [];
    const placed: { s: (typeof stations)[number]; x: number; y: number; cls: string }[] = [];
    const order = [...stations].sort((a, b) => (a.id === pick?.id ? -1 : b.id === pick?.id ? 1 : a.prices[fuel]! - b.prices[fuel]!));
    for (const s of order) {
      const [x, y] = project(s.lng, s.lat);
      if (x < 30 || y < 110 || x > size.w - 30 || y > size.h - 40) continue;
      if (placed.some((p) => Math.abs(p.x - x) < 64 && Math.abs(p.y - y) < 28)) continue;
      const price = s.prices[fuel]!;
      const a = data?.averages[s.country];
      placed.push({ s, x, y, cls: price === cheapest ? 'best' : a !== undefined && price > a + 0.02 ? 'dim' : '' });
      if (placed.length >= 12) break;
    }
    return placed;
  }, [project, stations, pick, fuel, size, data, cheapest]);

  const path = (coords: [number, number][]) => (project ? coords.map(([x, y], i) => `${i ? 'L' : 'M'}${project(x, y).map((n) => n.toFixed(1)).join(' ')}`).join('') : '');

  const city = pick?.city ?? stations[0]?.city;
  const pickOn = pick && il ? locateOnLine(pick, il) : null;
  const avg = pick ? data?.averages[pick.country] : undefined;
  const vs = pick ? vsAverage(pick.prices[fuel]!, avg, pick.country) : null;

  return (
    <div className="map-screen" ref={box}>
      <svg className="map-svg" viewBox={`0 0 ${size.w} ${size.h}`} aria-label="Map of nearby fuel prices" role="img">
        <rect width={size.w} height={size.h} fill="#D8DAD6" />
        {data?.roads.map((r, i) => (
          <path key={i} d={path(r.coords)} fill="none" stroke="#fff" strokeWidth={r.kind === 'motorway' ? 9 : r.kind === 'major' ? 4 : 2.5} strokeLinecap="round" strokeLinejoin="round" />
        ))}
        {route && <path d={path(route.geometry)} fill="none" stroke="#221C21" strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round" />}
      </svg>

      {pins.map(({ s, x, y, cls }) => (
        <button key={s.id} className={`price-pin ${cls}${pick?.id === s.id ? ' sel' : ''}`} style={{ left: x, top: y }} onClick={() => setSelected(s.id)} aria-label={`${s.name}, ${perL(s.prices[fuel]!)} per litre`}>
          <b>{cls === 'best' && <Fuel size={11} />}{perL(s.prices[fuel]!)}</b><i />
        </button>
      ))}
      {project && pos && <div className="me" style={{ left: size.w / 2, top: size.h * 0.4 }} aria-label={pos.simulated ? 'Simulated position' : 'You are here'} />}

      <div className="map-top">
        <div className="map-search">
          {loading ? <LoaderCircle size={14} className="spin" /> : <Search size={14} />}
          <span>{city ? `Near ${city}` : pos ? 'Nearby fuel' : 'Turn on location or plan a trip'}</span>
          <span className="t-meta" style={{ marginLeft: 'auto', overflow: 'visible' }}>{FUEL_LABELS[fuel]}</span>
        </div>
        <button className="map-btn" onClick={() => setSelected(null)} aria-label="Centre on me"><LocateFixed size={16} /></button>
      </div>
      <div className="map-zoom">
        <button className="map-btn" onClick={() => setSpanIdx((i) => Math.max(0, i - 1))} aria-label="Zoom in"><Plus size={16} /></button>
        <button className="map-btn" onClick={() => setSpanIdx((i) => Math.min(SPANS.length - 1, i + 1))} aria-label="Zoom out"><Minus size={16} /></button>
      </div>
      {(pos?.simulated || data?.meta.demo) && (
        <div className="sim pill sm" style={{ textTransform: 'none' }}>
          {pos?.simulated ? `${gpsError || 'You’re away from the route'} — showing km ${Math.round((il?.totalKm ?? 0) * 0.24)}` : 'Demo data'}
        </div>
      )}

      <div className="map-bottom">
        <span className="t-meta" style={{ alignSelf: 'flex-end', background: 'rgba(255,255,255,.7)', padding: '1px 6px', borderRadius: 4, fontSize: 8, marginBottom: -4 }}>
          Map data © OpenStreetMap contributors
        </span>
        {pick ? (
          <article className="card">
            <div className="card-head">
              <IconCircle icon={Fuel} />
              <div>
                <div className="t-name">{pick.name}</div>
                <div className="t-meta">
                  {[`${pick.distanceKm.toFixed(1)} km`, `${Math.max(1, Math.round((pick.distanceKm / 45) * 60))} min`, pickOn ? offRoute(pickOn.offRouteKm) : pick.city].filter(Boolean).join(' · ')}
                </div>
              </div>
            </div>
            <div className="card-price" style={{ margin: '14px 0 10px' }}>
              <div className="t-price">{perL(pick.prices[fuel]!)}<span className="t-unit">/L</span></div>
              {route && pickOn && (
                <AddButton
                  saved={isSaved(pick.id)}
                  label={pick.name}
                  onClick={() => toggleSaved({
                    id: pick.id, kind: 'fuel', name: pick.name, subtitle: `Fuel · ${perL(pick.prices[fuel]!)}/L`, lat: pick.lat, lng: pick.lng,
                    kmAlong: pickOn.kmAlong, offRouteKm: pickOn.offRouteKm, pricePerL: pick.prices[fuel],
                    saving: avg !== undefined ? Math.max(0, (avg - pick.prices[fuel]!) * settings.tankL) : 0,
                  })}
                />
              )}
            </div>
            <div className="card-foot">
              {vs && <div className="badge">{vs.text}</div>}
              {pick.updatedAt && <span className="t-meta">Updated {ago(pick.updatedAt)}</span>}
            </div>
          </article>
        ) : (
          <div className="card" style={{ padding: 14 }}>
            <div className="t-meta" style={{ color: 'var(--ink)' }}>
              {error ? `Couldn’t load nearby prices. ${error}` : loading ? 'Looking for fuel near you…' : pos ? 'No stations with this fuel nearby.' : 'Turn on location or plan a trip to see nearby fuel.'}
            </div>
          </div>
        )}
        <NavBar active="map" />
      </div>
    </div>
  );
}
