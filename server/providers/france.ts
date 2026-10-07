/**
 * France — prix-carburants.gouv.fr ("flux instantané", refreshed every ~10 min).
 * Licence Ouverte / Open Licence 2.0 (Etalab). Credit: "Ministère de l'Économie — prix-carburants.gouv.fr".
 * Note: the feed has NO station name or brand — we fill those in from OpenStreetMap (see osm.ts).
 */
import { unzipSync } from 'fflate';
import { XMLParser } from 'fast-xml-parser';
import type { FuelStation, FuelType } from '../../shared/types.ts';
import { fetchWithTimeout, mean, titleCase } from '../util.ts';
import type { FeedSnapshot, FuelProvider } from './types.ts';

const URL = 'https://donnees.roulez-eco.fr/opendata/instantane';

const FUEL_MAP: Record<string, FuelType> = { Gazole: 'diesel', E10: 'e10', SP95: 'sp95', SP98: 'sp98', GPLc: 'lpg' };
const MAX_AGE_MS = 8 * 24 * 3600_000; // ignore prices not updated for 8 days

interface RawPrix { nom: string; maj: string; valeur: string }
interface RawPdv {
  id: string; latitude: string; longitude: string; cp: string; pop: string;
  adresse?: string; ville?: string; prix?: RawPrix[];
}

export function parseFrance(xml: string, now = Date.now()): FeedSnapshot {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '',
    isArray: (name) => name === 'pdv' || name === 'prix',
  });
  const doc = parser.parse(xml) as { pdv_liste?: { pdv?: RawPdv[] } };
  const all: Record<FuelType, number[]> = { diesel: [], e10: [], sp95: [], sp98: [], lpg: [] };
  const stations: FuelStation[] = [];
  let newest = 0;

  for (const p of doc.pdv_liste?.pdv ?? []) {
    const lat = Number(p.latitude) / 100000;
    const lng = Number(p.longitude) / 100000;
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat === 0) continue;
    const prices: Partial<Record<FuelType, number>> = {};
    let updated = 0;
    for (const pr of p.prix ?? []) {
      const fuel = FUEL_MAP[pr.nom];
      const value = Number(pr.valeur);
      const t = Date.parse(pr.maj.replace(' ', 'T') + '+02:00');
      if (!fuel || !Number.isFinite(value) || value <= 0) continue;
      if (Number.isFinite(t) && now - t > MAX_AGE_MS) continue;
      prices[fuel] = value;
      all[fuel].push(value);
      if (t > updated) updated = t;
    }
    if (!Object.keys(prices).length) continue;
    if (updated > newest) newest = updated;
    const city = p.ville ? titleCase(String(p.ville)) : undefined;
    stations.push({
      id: `fr-${p.id}`,
      country: 'FR',
      name: 'Fuel station',
      address: p.adresse ? titleCase(String(p.adresse)) : undefined,
      city,
      lat,
      lng,
      prices,
      updatedAt: updated ? new Date(updated).toISOString() : undefined,
      motorway: p.pop === 'A',
      source: 'fr-roulez-eco',
    });
  }

  const averages: Partial<Record<FuelType, number>> = {};
  for (const f of Object.keys(all) as FuelType[]) {
    const m = mean(all[f]);
    if (m !== undefined) averages[f] = m;
  }
  return { stations, averages, updatedAt: new Date(newest || now).toISOString() };
}

export const france: FuelProvider = {
  country: 'FR',
  source: 'fr-roulez-eco',
  bbox: [-5.2, 41.3, 9.7, 51.2],
  ttlMs: 10 * 60_000,
  configured: () => true,
  async load() {
    const res = await fetchWithTimeout(URL, { timeoutMs: 60_000 });
    const zip = unzipSync(new Uint8Array(await res.arrayBuffer()));
    const file = Object.keys(zip).find((n) => n.endsWith('.xml'));
    if (!file) throw new Error('France feed: no XML in zip');
    const xml = new TextDecoder('latin1').decode(zip[file]);
    return parseFrance(xml);
  },
};
