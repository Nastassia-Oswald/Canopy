import type { Country, FuelStation, FuelType } from '../../shared/types.ts';

export const euro = (v: number, digits = 2) => `€${v.toFixed(digits)}`;
export const perL = (v: number) => `€${v.toFixed(3)}`;

export function duration(min: number): string {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h ? `${h} h ${String(m).padStart(2, '0')}` : `${m} min`;
}

export function ago(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const h = Math.round(mins / 60);
  if (h < 24) return `${h} h ago`;
  return `${Math.round(h / 24)} d ago`;
}

export function offRoute(km: number): string {
  if (km < 0.4) return 'on route';
  return `${km < 10 ? km.toFixed(1) : Math.round(km)} km off route`;
}

/** Saving vs the national average for a full tank (never negative). */
export function fullTankSaving(s: FuelStation, fuel: FuelType, averages: Partial<Record<Country, number>>, tankL: number): number {
  const price = s.prices[fuel];
  const avg = averages[s.country];
  if (price === undefined || avg === undefined) return 0;
  return Math.max(0, (avg - price) * tankL);
}

export function vsAverage(price: number, avg: number | undefined, country: Country): { text: string; below: boolean } | null {
  if (avg === undefined) return null;
  const d = price - avg;
  if (Math.abs(d) < 0.005) return { text: `${country} average`, below: false };
  return d < 0
    ? { text: `€${Math.abs(d).toFixed(2)} below ${country} avg`, below: true }
    : { text: `€${d.toFixed(2)} above ${country} avg`, below: false };
}

export const mapsUrl = (lat: number, lng: number) => `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
export const bookingUrl = (name: string, city?: string) =>
  `https://www.booking.com/searchresults.html?ss=${encodeURIComponent([name, city].filter(Boolean).join(', '))}`;

export function cuisineLabel(c: string): string {
  return c.replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());
}
