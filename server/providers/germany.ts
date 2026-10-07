/**
 * Germany — Tankerkönig (MTS-K data), CC BY 4.0. Free personal API key required.
 * Terms: max 25 km radius, on-demand requests only (no bulk mirroring), credit
 * "Tankerkönig (www.tankerkoenig.de)" also in the app-store listing, oil companies barred.
 * Because of those limits we only use it for the map's "nearby" search, never for whole routes.
 */
import type { FuelStation, FuelType } from '../../shared/types.ts';
import { config, fetchWithTimeout, titleCase } from '../util.ts';
import type { FeedSnapshot, FuelProvider } from './types.ts';

interface TkStation {
  id: string; name: string; brand: string; street: string; houseNumber: string; place: string;
  lat: number; lng: number; diesel?: number | false; e5?: number | false; e10?: number | false; isOpen: boolean;
}

export const germany: FuelProvider = {
  country: 'DE',
  source: 'de-tankerkoenig',
  bbox: [5.8, 47.2, 15.1, 55.1],
  ttlMs: 5 * 60_000,
  configured: () => Boolean(config.tankerkoenigKey),
  async nearby(at, radiusKm) {
    if (!config.tankerkoenigKey) throw new Error('TANKERKOENIG_API_KEY not set');
    const rad = Math.min(25, Math.max(1, radiusKm));
    const url = `https://creativecommons.tankerkoenig.de/json/list.php?lat=${at.lat}&lng=${at.lng}&rad=${rad}&type=all&apikey=${config.tankerkoenigKey}`;
    const json = (await (await fetchWithTimeout(url)).json()) as { ok: boolean; message?: string; stations?: TkStation[] };
    if (!json.ok) throw new Error(`Tankerkönig: ${json.message ?? 'error'}`);
    const stations: FuelStation[] = (json.stations ?? []).map((s) => {
      const prices: Partial<Record<FuelType, number>> = {};
      if (typeof s.diesel === 'number') prices.diesel = s.diesel;
      if (typeof s.e5 === 'number') prices.sp95 = s.e5;
      if (typeof s.e10 === 'number') prices.e10 = s.e10;
      return {
        id: `de-${s.id}`,
        country: 'DE',
        name: s.brand ? titleCase(s.brand) : titleCase(s.name),
        brand: s.brand || undefined,
        address: `${titleCase(s.street)} ${s.houseNumber ?? ''}`.trim(),
        city: titleCase(s.place),
        lat: s.lat,
        lng: s.lng,
        prices,
        updatedAt: new Date().toISOString(),
        source: 'de-tankerkoenig',
      };
    });
    // A radius search can't give a national average — leave averages empty.
    const snap: FeedSnapshot = { stations, averages: {}, updatedAt: new Date().toISOString() };
    return snap;
  },
};
