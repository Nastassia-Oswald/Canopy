/**
 * Built-in demo data: Lyon → Barcelona.
 * Used when the live APIs can't be reached (offline, rate-limited) or with ?demo=1.
 * Places are real towns/rest areas on the A7/A9; station prices are illustrative,
 * set close to the real national averages seen in October 2026.
 */
import type { FuelResult, FuelStation, FuelType, NearbyFuelResult, PlacesResult, Poi, PoiKind, RouteResult } from './types.ts';
import { haversineKm, indexLine, locateOnLine, type Line } from './geo.ts';

export const DEMO_FROM = { name: 'Lyon', label: 'Lyon, France', lat: 45.764, lng: 4.8357, countryCode: 'fr' };
export const DEMO_TO = { name: 'Barcelona', label: 'Barcelona, Spain', lat: 41.3874, lng: 2.1686, countryCode: 'es' };

const DEMO_LINE: Line = [
  [4.8357, 45.764], [4.8742, 45.5253], [4.8606, 45.2601], [4.8924, 44.9334], [4.7731, 44.7392],
  [4.7509, 44.5581], [4.7206, 44.3446], [4.8075, 44.1381], [4.8059, 43.9493], [4.6, 43.88],
  [4.3601, 43.8367], [4.1, 43.71], [3.8767, 43.6108], [3.62, 43.48], [3.2158, 43.3442],
  [3.0042, 43.1839], [2.9, 42.95], [2.8948, 42.6986], [2.8743, 42.4196], [2.8214, 41.9794],
  [2.55, 41.68], [2.1686, 41.3874],
];

export function demoRoute(): RouteResult {
  const il = indexLine(DEMO_LINE);
  return {
    from: DEMO_FROM,
    to: DEMO_TO,
    distanceKm: Math.round(il.totalKm * 1.04), // road km are a bit longer than the simplified line
    durationMin: 380,
    geometry: DEMO_LINE,
    countries: ['FR', 'ES'],
    demo: true,
  };
}

const DEMO_AVERAGES: Record<FuelType, { FR: number; ES: number }> = {
  diesel: { FR: 2.349, ES: 1.892 },
  e10: { FR: 2.149, ES: 1.81 },
  sp95: { FR: 2.21, ES: 1.79 },
  sp98: { FR: 2.254, ES: 1.94 },
  lpg: { FR: 1.044, ES: 0.98 },
};

// Offsets from the national average, per station (negative = cheaper).
const DEMO_STATIONS: (Omit<FuelStation, 'prices' | 'source'> & { delta: number })[] = [
  { id: 'demo-fr-1', country: 'FR', name: 'Intermarché', brand: 'Intermarché', city: 'Montélimar', lat: 44.5452, lng: 4.7473, delta: -0.11 },
  { id: 'demo-fr-2', country: 'FR', name: 'E.Leclerc', brand: 'Leclerc', city: 'Valence', lat: 44.9061, lng: 4.8853, delta: -0.13 },
  { id: 'demo-fr-3', country: 'FR', name: 'Carrefour Market', brand: 'Carrefour', city: 'Nîmes', lat: 43.8285, lng: 4.3741, delta: -0.08 },
  { id: 'demo-fr-4', country: 'FR', name: 'Auchan', brand: 'Auchan', city: 'Béziers', lat: 43.3315, lng: 3.2462, delta: -0.12 },
  { id: 'demo-fr-5', country: 'FR', name: 'TotalEnergies', brand: 'TotalEnergies', city: 'Aire de Narbonne', lat: 43.1802, lng: 3.0176, delta: 0.18, motorway: true },
  { id: 'demo-fr-6', country: 'FR', name: 'Station Avia', brand: 'Avia', city: 'Montélimar', lat: 44.5701, lng: 4.7592, delta: -0.04 },
  { id: 'demo-fr-7', country: 'FR', name: 'Esso Express', brand: 'Esso', city: 'Montélimar', lat: 44.5333, lng: 4.7351, delta: 0.03 },
  { id: 'demo-es-1', country: 'ES', name: 'Repsol', brand: 'Repsol', city: 'La Jonquera', lat: 42.4148, lng: 2.8752, delta: -0.09 },
  { id: 'demo-es-2', country: 'ES', name: 'BonÀrea', brand: 'BonÀrea', city: 'Girona', lat: 41.9636, lng: 2.8291, delta: -0.17 },
];

function demoStations(fuel: FuelType): FuelStation[] {
  return DEMO_STATIONS.map(({ delta, ...s }) => ({
    ...s,
    prices: { [fuel]: Math.round(((DEMO_AVERAGES[fuel][s.country as 'FR' | 'ES']) + delta) * 1000) / 1000 },
    updatedAt: new Date(Date.now() - 3600_000).toISOString(),
    source: 'demo' as const,
  }));
}

export function demoFuel(fuel: FuelType): FuelResult {
  const il = indexLine(DEMO_LINE);
  return {
    fuel,
    stations: demoStations(fuel).map((s) => ({ ...s, ...locateOnLine(s, il) })),
    averages: { FR: DEMO_AVERAGES[fuel].FR, ES: DEMO_AVERAGES[fuel].ES },
    meta: { demo: true, sources: ['demo'], warnings: ['Showing demo data — live prices could not be loaded.'] },
  };
}

export function demoNearby(fuel: FuelType, at: { lat: number; lng: number }): NearbyFuelResult {
  const stations = demoStations(fuel)
    .map((s) => ({ ...s, distanceKm: haversineKm(at, s) }))
    .filter((s) => s.distanceKm < 25)
    .sort((a, b) => a.distanceKm - b.distanceKm);
  return {
    fuel,
    stations,
    averages: { FR: DEMO_AVERAGES[fuel].FR, ES: DEMO_AVERAGES[fuel].ES },
    roads: [
      { kind: 'motorway', ref: 'A7', coords: [[4.7206, 44.3446], [4.7509, 44.5581], [4.7731, 44.7392]] },
      { kind: 'major', coords: [[4.6, 44.56], [4.9, 44.55]] },
      { kind: 'major', coords: [[4.73, 44.45], [4.76, 44.7]] },
      { kind: 'minor', coords: [[4.65, 44.6], [4.85, 44.52]] },
    ],
    meta: { demo: true, sources: ['demo'], warnings: ['Showing demo data.'] },
  };
}

const DEMO_POIS: Omit<Poi, 'kmAlong' | 'offRouteKm'>[] = [
  { id: 'demo-rest-1', kind: 'rest', name: 'Aire de Montélimar Est', lat: 44.5762, lng: 4.7712, facts: { toilets: true, toiletsFee: false, wheelchair: true } },
  { id: 'demo-rest-2', kind: 'rest', name: 'Aire de Fabrègues', lat: 43.5521, lng: 3.7884, facts: { toilets: true, toiletsFee: false, wheelchair: true } },
  { id: 'demo-rest-3', kind: 'rest', name: 'Aire de la Porte des Pyrénées', lat: 42.6243, lng: 2.8743, facts: { toilets: true, toiletsFee: false } },
  { id: 'demo-food-1', kind: 'food', name: 'Le Bistrot du Pont', lat: 43.9512, lng: 4.8031, facts: { cuisine: ['french', 'bistro'], vegetarian: true, city: 'Avignon', openingHours: 'Mo-Sa 12:00-14:30' } },
  { id: 'demo-food-2', kind: 'food', name: 'La Table du Marché', lat: 43.8363, lng: 4.3601, facts: { cuisine: ['regional'], city: 'Nîmes' } },
  { id: 'demo-food-3', kind: 'food', name: 'Café des Arts', lat: 44.5588, lng: 4.7505, facts: { cuisine: ['coffee_shop'], city: 'Montélimar' } },
  { id: 'demo-hotel-1', kind: 'hotel', name: 'Hôtel du Canal', lat: 43.1856, lng: 3.0034, facts: { stars: 3, parking: true, wifi: true, city: 'Narbonne' } },
  { id: 'demo-hotel-2', kind: 'hotel', name: 'Hôtel La Résidence', lat: 43.1838, lng: 3.0011, facts: { stars: 3, wifi: true, city: 'Narbonne' } },
  { id: 'demo-hotel-3', kind: 'hotel', name: 'Ibis Budget Narbonne Sud', lat: 43.1592, lng: 2.9921, facts: { stars: 2, parking: true, wifi: true, city: 'Narbonne' } },
];

export function demoPlaces(kind: PoiKind): PlacesResult {
  const il = indexLine(DEMO_LINE);
  return {
    kind,
    pois: DEMO_POIS.filter((p) => p.kind === kind).map((p) => ({ ...p, ...locateOnLine(p, il) })),
    meta: { demo: true, sources: ['demo'], warnings: ['Showing demo data.'] },
  };
}
