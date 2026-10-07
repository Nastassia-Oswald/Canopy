/**
 * Spain — Ministerio para la Transición Ecológica (MITECO), "Precios Carburantes" REST service.
 * Reuse under the Ministry's conditions (Law 37/2007, RD 1495/2011). Credit:
 * "Ministerio para la Transición Ecológica — Geoportal Gasolineras".
 */
import type { FuelStation, FuelType } from '../../shared/types.ts';
import { fetchWithTimeout, mean, titleCase } from '../util.ts';
import type { FeedSnapshot, FuelProvider } from './types.ts';

const URL = 'https://sedeaplicaciones.minetur.gob.es/ServiciosRESTCarburantes/PreciosCarburantes/EstacionesTerrestres/';

const FIELDS: Record<FuelType, string> = {
  diesel: 'Precio Gasoleo A',
  e10: 'Precio Gasolina 95 E10',
  sp95: 'Precio Gasolina 95 E5',
  sp98: 'Precio Gasolina 98 E5',
  lpg: 'Precio Gases licuados del petróleo',
};

type Raw = Record<string, string>;

const num = (s: string | undefined) => (s ? Number(s.replace(',', '.')) : NaN);

/** "07/10/2026 12:32:36" → ISO */
function parseFecha(f: string | undefined): string {
  const m = f?.match(/(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2}):(\d{2})/);
  if (!m) return new Date().toISOString();
  return new Date(`${m[3]}-${m[2]}-${m[1]}T${m[4]}:${m[5]}:${m[6]}+02:00`).toISOString();
}

export function parseSpain(json: { Fecha?: string; ListaEESSPrecio?: Raw[] }): FeedSnapshot {
  const updatedAt = parseFecha(json.Fecha);
  const all: Record<FuelType, number[]> = { diesel: [], e10: [], sp95: [], sp98: [], lpg: [] };
  const stations: FuelStation[] = [];
  for (const r of json.ListaEESSPrecio ?? []) {
    const lat = num(r['Latitud']);
    const lng = num(r['Longitud (WGS84)']);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const prices: Partial<Record<FuelType, number>> = {};
    for (const f of Object.keys(FIELDS) as FuelType[]) {
      const v = num(r[FIELDS[f]]);
      if (Number.isFinite(v) && v > 0) {
        prices[f] = v;
        all[f].push(v);
      }
    }
    if (!Object.keys(prices).length) continue;
    const brand = r['Rótulo'] ? titleCase(r['Rótulo']) : undefined;
    const city = r['Municipio'] || r['Localidad'];
    stations.push({
      id: `es-${r['IDEESS']}`,
      country: 'ES',
      name: brand && !/^n[ºo°]/i.test(brand) ? brand : `Station · ${titleCase(city ?? '')}`,
      brand,
      address: r['Dirección'] ? titleCase(r['Dirección']) : undefined,
      city: city ? titleCase(city) : undefined,
      lat,
      lng,
      prices,
      openingHours: r['Horario'],
      updatedAt,
      source: 'es-miteco',
    });
  }
  const averages: Partial<Record<FuelType, number>> = {};
  for (const f of Object.keys(all) as FuelType[]) {
    const m = mean(all[f]);
    if (m !== undefined) averages[f] = m;
  }
  return { stations, averages, updatedAt };
}

export const spain: FuelProvider = {
  country: 'ES',
  source: 'es-miteco',
  bbox: [-9.4, 35.9, 4.4, 43.9],
  ttlMs: 30 * 60_000,
  configured: () => true,
  async load() {
    const res = await fetchWithTimeout(URL, { timeoutMs: 90_000, headers: { Accept: 'application/json' } });
    return parseSpain((await res.json()) as { Fecha?: string; ListaEESSPrecio?: Raw[] });
  },
};
