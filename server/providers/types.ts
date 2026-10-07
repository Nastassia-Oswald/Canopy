import type { Country, FuelStation, FuelType, LatLng, SourceId } from '../../shared/types.ts';

export interface FeedSnapshot {
  stations: FuelStation[];
  /** National average per fuel, from the whole feed. */
  averages: Partial<Record<FuelType, number>>;
  updatedAt: string;
}

export interface FuelProvider {
  country: Country;
  source: SourceId;
  /** Rough bounding box [minLng, minLat, maxLng, maxLat] used to decide which feeds a route needs. */
  bbox: [number, number, number, number];
  /** How long a snapshot stays fresh. */
  ttlMs: number;
  /** Whole-country snapshot. Providers whose API can't do this (Tankerkönig) omit it. */
  load?: () => Promise<FeedSnapshot>;
  /** Point search, for providers that only support radius queries. */
  nearby?: (at: LatLng, radiusKm: number) => Promise<FeedSnapshot>;
  /** Missing credentials etc. */
  configured: () => boolean;
}
