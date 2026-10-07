// Types shared by the server (server/) and the web app (src/).

export interface LatLng {
  lat: number;
  lng: number;
}

export interface Place extends LatLng {
  name: string;
  /** Longer label, e.g. "Lyon, Auvergne-Rhône-Alpes, France" */
  label?: string;
  countryCode?: string;
}

export type FuelType = 'diesel' | 'e10' | 'sp95' | 'sp98' | 'lpg';

export const FUEL_LABELS: Record<FuelType, string> = {
  diesel: 'Diesel',
  e10: 'E10',
  sp95: 'Petrol 95',
  sp98: 'Petrol 98',
  lpg: 'LPG',
};

export type Country = 'FR' | 'ES' | 'IT' | 'DE' | 'UK';

export type SourceId = 'fr-roulez-eco' | 'es-miteco' | 'it-mimit' | 'de-tankerkoenig' | 'uk-fuel-finder' | 'osm' | 'osrm' | 'nominatim' | 'canopy' | 'demo';

/** Position of something relative to the planned route. */
export interface OnRoute {
  /** Distance from the start of the route, along the route, in km. */
  kmAlong: number;
  /** Straight-line distance from the route line, in km. */
  offRouteKm: number;
}

export interface FuelStation extends LatLng {
  id: string;
  country: Country;
  name: string;
  brand?: string;
  address?: string;
  city?: string;
  prices: Partial<Record<FuelType, number>>;
  /** ISO timestamp of the most recent price update, if the source gives one. */
  updatedAt?: string;
  motorway?: boolean;
  openingHours?: string;
  source: SourceId;
}

export type FuelStationOnRoute = FuelStation & OnRoute;

export interface RouteResult {
  from: Place;
  to: Place;
  distanceKm: number;
  durationMin: number;
  /** Simplified route line as [lng, lat] pairs (GeoJSON order). */
  geometry: [number, number][];
  countries: Country[];
  demo: boolean;
}

export interface FuelResult {
  fuel: FuelType;
  stations: FuelStationOnRoute[];
  /** National average price per litre for `fuel`, computed from each country's full feed. */
  averages: Partial<Record<Country, number>>;
  meta: ApiMeta;
}

export interface NearbyFuelResult {
  fuel: FuelType;
  stations: (FuelStation & { distanceKm: number })[];
  averages: Partial<Record<Country, number>>;
  /** Major roads around the point, for drawing the map. [lng, lat][] per road. */
  roads: { kind: 'motorway' | 'major' | 'minor'; ref?: string; coords: [number, number][] }[];
  meta: ApiMeta;
}

export type PoiKind = 'rest' | 'food' | 'hotel';

export interface Poi extends LatLng, OnRoute {
  id: string;
  kind: PoiKind;
  name: string;
  /** OSM-derived facts we show on cards. */
  facts: {
    toilets?: boolean;
    toiletsFee?: boolean;
    wheelchair?: boolean;
    cuisine?: string[];
    vegetarian?: boolean;
    openingHours?: string;
    stars?: number;
    parking?: boolean;
    wifi?: boolean;
    city?: string;
    website?: string;
  };
}

export interface PlacesResult {
  kind: PoiKind;
  pois: Poi[];
  meta: ApiMeta;
}

export type ReportStatus = 'clean' | 'dirty' | 'closed';

export interface Report {
  poiId: string;
  status: ReportStatus;
  createdAt: string;
}

export interface ApiMeta {
  /** True when the response is built-in demo data rather than live data. */
  demo: boolean;
  sources: SourceId[];
  warnings: string[];
}

export interface SourceInfo {
  id: SourceId;
  label: string;
  provider: string;
  licence: string;
  url: string;
  attribution: string;
  status: 'live' | 'not-loaded' | 'not-configured' | 'error';
  updatedAt?: string;
  detail?: string;
}

export type SavedStopKind = 'fuel' | PoiKind;

export interface SavedStop extends OnRoute, LatLng {
  id: string;
  kind: SavedStopKind;
  name: string;
  subtitle: string;
  /** Fuel only: price per litre and the saving for a full tank vs national average. */
  pricePerL?: number;
  saving?: number;
}
