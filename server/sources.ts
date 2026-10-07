import type { SourceInfo } from '../shared/types.ts';
import { providerStatus } from './providers/index.ts';

/** Every data source, its licence and the credit line we must show. Checked 6–7 Oct 2026. */
const STATIC: Omit<SourceInfo, 'status' | 'updatedAt' | 'detail'>[] = [
  {
    id: 'fr-roulez-eco',
    label: 'Fuel · France',
    provider: 'prix-carburants.gouv.fr',
    licence: 'Licence Ouverte 2.0 (Etalab)',
    url: 'https://www.prix-carburants.gouv.fr/rubrique/opendata/',
    attribution: "Ministère de l'Économie — prix-carburants.gouv.fr",
  },
  {
    id: 'es-miteco',
    label: 'Fuel · Spain',
    provider: 'MITECO · Geoportal Gasolineras',
    licence: 'Ministry reuse terms (Law 37/2007)',
    url: 'https://geoportalgasolineras.es/',
    attribution: 'Ministerio para la Transición Ecológica — Geoportal Gasolineras',
  },
  {
    id: 'it-mimit',
    label: 'Fuel · Italy',
    provider: 'MIMIT open data',
    licence: 'IODL 2.0',
    url: 'https://www.mimit.gov.it/it/open-data/elenco-dataset/carburanti-prezzi-praticati-e-anagrafica-degli-impianti',
    attribution: 'Fonte: Ministero delle Imprese e del Made in Italy (MIMIT)',
  },
  {
    id: 'de-tankerkoenig',
    label: 'Fuel · Germany',
    provider: 'Tankerkönig / MTS-K',
    licence: 'CC BY 4.0',
    url: 'https://creativecommons.tankerkoenig.de/',
    attribution: 'Tankerkönig (www.tankerkoenig.de) — data: MTS-K',
  },
  {
    id: 'uk-fuel-finder',
    label: 'Fuel · UK',
    provider: 'DESNZ Fuel Finder',
    licence: 'Open Government Licence v3.0',
    url: 'https://www.gov.uk/government/collections/fuel-finder',
    attribution: 'Contains public sector information licensed under the Open Government Licence v3.0. Source: DESNZ Fuel Finder',
  },
  {
    id: 'osm',
    label: 'Places, toilets, hotels, map',
    provider: '© OpenStreetMap contributors',
    licence: 'ODbL 1.0',
    url: 'https://www.openstreetmap.org/copyright',
    attribution: '© OpenStreetMap contributors',
  },
  {
    id: 'osrm',
    label: 'Routes',
    provider: 'OSRM (OpenStreetMap data)',
    licence: 'ODbL 1.0 (data)',
    url: 'https://project-osrm.org/',
    attribution: '© OpenStreetMap contributors',
  },
  {
    id: 'nominatim',
    label: 'Place search',
    provider: 'Nominatim (OpenStreetMap data)',
    licence: 'ODbL 1.0 (data)',
    url: 'https://nominatim.org/',
    attribution: '© OpenStreetMap contributors',
  },
  {
    id: 'canopy',
    label: 'Cleanliness reports',
    provider: 'Canopy travellers',
    licence: 'Your reports',
    url: '',
    attribution: 'Reported by Canopy travellers',
  },
];

export function sources(): SourceInfo[] {
  return STATIC.map((s) => {
    const fuel = s.id.startsWith('fr-') || s.id.startsWith('es-') || s.id.startsWith('it-') || s.id.startsWith('de-') || s.id.startsWith('uk-');
    return fuel ? { ...s, ...providerStatus(s.id) } : { ...s, status: 'live' as const };
  });
}
