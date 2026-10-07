import type { LatLng, OnRoute } from './types.ts';

const R = 6371; // Earth radius, km
const toRad = (d: number) => (d * Math.PI) / 180;

/** Great-circle distance in km. */
export function haversineKm(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

export type Line = [number, number][]; // [lng, lat]

export interface IndexedLine {
  line: Line;
  /** Cumulative km at each vertex. */
  cum: number[];
  totalKm: number;
  bbox: [number, number, number, number]; // minLng, minLat, maxLng, maxLat
}

export function indexLine(line: Line): IndexedLine {
  const cum: number[] = [0];
  let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
  for (let i = 0; i < line.length; i++) {
    const [lng, lat] = line[i]!;
    if (lng < minLng) minLng = lng;
    if (lat < minLat) minLat = lat;
    if (lng > maxLng) maxLng = lng;
    if (lat > maxLat) maxLat = lat;
    if (i > 0) {
      const [plng, plat] = line[i - 1]!;
      cum.push(cum[i - 1]! + haversineKm({ lat: plat, lng: plng }, { lat, lng }));
    }
  }
  return { line, cum, totalKm: cum[cum.length - 1] ?? 0, bbox: [minLng, minLat, maxLng, maxLat] };
}

/**
 * Where a point sits relative to a route: km along the route of the closest point,
 * and the distance off the route. Uses a local equirectangular projection per segment,
 * which is accurate to well under 1% at the distances we care about (< 50 km off route).
 */
export function locateOnLine(p: LatLng, il: IndexedLine): OnRoute {
  const { line, cum } = il;
  let best = Infinity;
  let bestAlong = 0;
  const kx = 111.32 * Math.cos(toRad(p.lat)); // km per degree lng
  const ky = 110.574; // km per degree lat
  for (let i = 1; i < line.length; i++) {
    const [ax0, ay0] = line[i - 1]!;
    const [bx0, by0] = line[i]!;
    const ax = (ax0 - p.lng) * kx, ay = (ay0 - p.lat) * ky;
    const bx = (bx0 - p.lng) * kx, by = (by0 - p.lat) * ky;
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy;
    let t = len2 === 0 ? 0 : -(ax * dx + ay * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    const cx = ax + t * dx, cy = ay + t * dy;
    const d = Math.sqrt(cx * cx + cy * cy);
    if (d < best) {
      best = d;
      bestAlong = cum[i - 1]! + t * (cum[i]! - cum[i - 1]!);
    }
  }
  return { kmAlong: bestAlong, offRouteKm: best };
}

/** True if the point is inside the line's bbox grown by `km`. Cheap pre-filter. */
export function nearBbox(p: LatLng, il: IndexedLine, km: number): boolean {
  const dLat = km / 110.574;
  const dLng = km / (111.32 * Math.cos(toRad(p.lat)));
  const [minLng, minLat, maxLng, maxLat] = il.bbox;
  return p.lng >= minLng - dLng && p.lng <= maxLng + dLng && p.lat >= minLat - dLat && p.lat <= maxLat + dLat;
}

/** Point at a given km along the line. */
export function pointAtKm(il: IndexedLine, km: number): LatLng {
  const { line, cum } = il;
  const k = Math.max(0, Math.min(il.totalKm, km));
  for (let i = 1; i < line.length; i++) {
    if (cum[i]! >= k) {
      const seg = cum[i]! - cum[i - 1]!;
      const t = seg === 0 ? 0 : (k - cum[i - 1]!) / seg;
      const [ax, ay] = line[i - 1]!;
      const [bx, by] = line[i]!;
      return { lng: ax + t * (bx - ax), lat: ay + t * (by - ay) };
    }
  }
  const last = line[line.length - 1]!;
  return { lng: last[0], lat: last[1] };
}

/** Douglas–Peucker simplification. `toleranceKm` ~0.05–0.2 for routes. */
export function simplify(line: Line, toleranceKm: number): Line {
  if (line.length <= 2) return line.slice();
  const keep = new Uint8Array(line.length);
  keep[0] = 1;
  keep[line.length - 1] = 1;
  const stack: [number, number][] = [[0, line.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop()!;
    const [sx, sy] = line[s]!;
    const [ex, ey] = line[e]!;
    const kx = 111.32 * Math.cos(toRad((sy + ey) / 2)), ky = 110.574;
    const ax = sx * kx, ay = sy * ky, bx = ex * kx, by = ey * ky;
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy;
    let maxD = -1, idx = -1;
    for (let i = s + 1; i < e; i++) {
      const [px0, py0] = line[i]!;
      const px = px0 * kx, py = py0 * ky;
      let t = len2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / len2;
      t = Math.max(0, Math.min(1, t));
      const cx = ax + t * dx - px, cy = ay + t * dy - py;
      const d = Math.sqrt(cx * cx + cy * cy);
      if (d > maxD) { maxD = d; idx = i; }
    }
    if (maxD > toleranceKm && idx > 0) {
      keep[idx] = 1;
      stack.push([s, idx], [idx, e]);
    }
  }
  return line.filter((_, i) => keep[i]);
}

/** Resample a line to points roughly every `stepKm` (for Overpass "around" queries). */
export function resample(il: IndexedLine, stepKm: number): LatLng[] {
  const out: LatLng[] = [];
  for (let k = 0; k <= il.totalKm; k += stepKm) out.push(pointAtKm(il, k));
  const last = il.line[il.line.length - 1]!;
  out.push({ lng: last[0], lat: last[1] });
  return out;
}

export function formatKm(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  if (km < 10) return `${km.toFixed(1)} km`;
  return `${Math.round(km)} km`;
}
