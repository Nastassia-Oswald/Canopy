import type { Country, LatLng, SourceId } from '../../shared/types.ts';
import { cached } from '../util.ts';
import { france } from './france.ts';
import { germany } from './germany.ts';
import { italy } from './italy.ts';
import { spain } from './spain.ts';
import type { FeedSnapshot, FuelProvider } from './types.ts';
import { uk } from './uk.ts';

export const PROVIDERS: FuelProvider[] = [france, spain, italy, germany, uk];

export interface ProviderStatus {
  status: 'live' | 'not-loaded' | 'not-configured' | 'error';
  updatedAt?: string;
  detail?: string;
}
const status = new Map<SourceId, ProviderStatus>();

export function providerStatus(id: SourceId): ProviderStatus {
  const p = PROVIDERS.find((x) => x.source === id);
  if (p && !p.configured()) return { status: 'not-configured' };
  return status.get(id) ?? { status: 'not-loaded' };
}

function intersects(a: [number, number, number, number], b: [number, number, number, number]) {
  return a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
}

/** Countries whose rough bbox overlaps the given bbox. */
export function countriesFor(bbox: [number, number, number, number]): Country[] {
  return PROVIDERS.filter((p) => intersects(p.bbox, bbox)).map((p) => p.country);
}

/** Whole-country snapshot (cached per provider TTL). */
export async function snapshot(p: FuelProvider): Promise<FeedSnapshot> {
  if (!p.load) throw new Error(`${p.country}: whole-country feed not available`);
  try {
    const snap = await cached(`feed:${p.source}`, p.ttlMs, p.load);
    status.set(p.source, { status: 'live', updatedAt: snap.updatedAt, detail: `${snap.stations.length.toLocaleString('en')} stations` });
    return snap;
  } catch (e) {
    status.set(p.source, { status: 'error', detail: (e as Error).message });
    throw e;
  }
}

export async function nearbySnapshot(p: FuelProvider, at: LatLng, radiusKm: number): Promise<FeedSnapshot> {
  if (p.nearby) {
    const key = `near:${p.source}:${at.lat.toFixed(2)},${at.lng.toFixed(2)}:${radiusKm}`;
    try {
      const snap = await cached(key, p.ttlMs, () => p.nearby!(at, radiusKm));
      status.set(p.source, { status: 'live', updatedAt: snap.updatedAt });
      return snap;
    } catch (e) {
      status.set(p.source, { status: 'error', detail: (e as Error).message });
      throw e;
    }
  }
  return snapshot(p);
}

/** Warm the main feeds in the background so the first request is fast. */
export function warmUp() {
  for (const p of [france, spain, italy]) snapshot(p).catch((e) => console.warn(`[warm-up] ${p.country}: ${(e as Error).message}`));
}
