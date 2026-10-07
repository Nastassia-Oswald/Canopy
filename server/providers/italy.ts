/**
 * Italy — Ministero delle Imprese e del Made in Italy (MIMIT) open data.
 * Two daily CSVs (prices as at 08:00, and the station register). IODL 2.0.
 * Credit: "Fonte: Ministero delle Imprese e del Made in Italy (MIMIT)".
 */
import type { FuelStation, FuelType } from '../../shared/types.ts';
import { fetchWithTimeout, mean, titleCase } from '../util.ts';
import type { FeedSnapshot, FuelProvider } from './types.ts';

const PRICES_URL = 'https://www.mimit.gov.it/images/exportCSV/prezzo_alle_8.csv';
const STATIONS_URL = 'https://www.mimit.gov.it/images/exportCSV/anagrafica_impianti_attivi.csv';

const FUEL_MAP: Record<string, FuelType> = { Benzina: 'sp95', Gasolio: 'diesel', GPL: 'lpg' };

/** Rows after the "Estrazione del …" line and the header. Delimiter is auto-detected ('|' since 2024, ';' before). */
function rows(csv: string): { header: string[]; data: string[][]; extracted?: string } {
  const lines = csv.split(/\r?\n/).filter((l) => l.trim().length);
  let i = 0;
  let extracted: string | undefined;
  const m = lines[0]?.match(/Estrazione del (\d{4}-\d{2}-\d{2})/);
  if (m) { extracted = m[1]; i = 1; }
  const headerLine = lines[i] ?? '';
  const delim = headerLine.includes('|') ? '|' : ';';
  const header = headerLine.split(delim).map((h) => h.trim());
  const data = lines.slice(i + 1).map((l) => l.split(delim).map((c) => c.replace(/\t/g, ' ').trim()));
  return { header, data, extracted };
}

export function parseItaly(pricesCsv: string, stationsCsv: string): FeedSnapshot {
  const P = rows(pricesCsv);
  const S = rows(stationsCsv);
  const pi = (n: string) => P.header.indexOf(n);
  const si = (n: string) => S.header.indexOf(n);

  // best (lowest) price per station per fuel, preferring self-service
  const best = new Map<string, Partial<Record<FuelType, { v: number; self: boolean }>>>();
  for (const r of P.data) {
    const fuel = FUEL_MAP[r[pi('descCarburante')] ?? ''];
    const v = Number((r[pi('prezzo')] ?? '').replace(',', '.'));
    if (!fuel || !Number.isFinite(v) || v <= 0) continue;
    const id = r[pi('idImpianto')] ?? '';
    const self = r[pi('isSelf')] === '1';
    const cur = best.get(id) ?? {};
    const prev = cur[fuel];
    if (!prev || (self && !prev.self) || (self === prev.self && v < prev.v)) cur[fuel] = { v, self };
    best.set(id, cur);
  }

  const all: Record<FuelType, number[]> = { diesel: [], e10: [], sp95: [], sp98: [], lpg: [] };
  const stations: FuelStation[] = [];
  for (const r of S.data) {
    const id = r[si('idImpianto')] ?? '';
    const p = best.get(id);
    if (!p) continue;
    const lat = Number(r[si('Latitudine')]);
    const lng = Number(r[si('Longitudine')]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat === 0) continue;
    const prices: Partial<Record<FuelType, number>> = {};
    for (const [f, x] of Object.entries(p) as [FuelType, { v: number }][]) {
      prices[f] = x.v;
      all[f].push(x.v);
    }
    const brand = r[si('Bandiera')] ? titleCase(r[si('Bandiera')]!) : undefined;
    const city = r[si('Comune')] ? titleCase(r[si('Comune')]!) : undefined;
    stations.push({
      id: `it-${id}`,
      country: 'IT',
      name: brand && brand !== 'Pompe Bianche' ? brand : `Station · ${city ?? ''}`,
      brand,
      address: r[si('Indirizzo')] ? titleCase(r[si('Indirizzo')]!) : undefined,
      city,
      lat,
      lng,
      prices,
      motorway: (r[si('Tipo Impianto')] ?? '').toLowerCase().startsWith('autostrad'),
      updatedAt: P.extracted ? new Date(`${P.extracted}T08:00:00+02:00`).toISOString() : undefined,
      source: 'it-mimit',
    });
  }
  const averages: Partial<Record<FuelType, number>> = {};
  for (const f of Object.keys(all) as FuelType[]) {
    const m = mean(all[f]);
    if (m !== undefined) averages[f] = m;
  }
  return {
    stations,
    averages,
    updatedAt: P.extracted ? new Date(`${P.extracted}T08:00:00+02:00`).toISOString() : new Date().toISOString(),
  };
}

export const italy: FuelProvider = {
  country: 'IT',
  source: 'it-mimit',
  bbox: [6.6, 36.6, 18.6, 47.1],
  ttlMs: 6 * 3600_000,
  configured: () => true,
  async load() {
    const [p, s] = await Promise.all([
      fetchWithTimeout(PRICES_URL, { timeoutMs: 90_000 }).then((r) => r.text()),
      fetchWithTimeout(STATIONS_URL, { timeoutMs: 90_000 }).then((r) => r.text()),
    ]);
    return parseItaly(p, s);
  },
};
