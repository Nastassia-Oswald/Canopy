/**
 * United Kingdom — DESNZ Fuel Finder (statutory open data since Feb 2026), Open Government Licence v3.0.
 * Credit: "Contains public sector information licensed under the Open Government Licence v3.0. Source: DESNZ Fuel Finder".
 *
 * Access needs OAuth client credentials from the Fuel Finder developer portal.
 * TODO: implement once credentials are available — the endpoint paths and response
 * schema must be taken from the developer portal; they are not hard-coded here on purpose.
 */
import { config } from '../util.ts';
import type { FuelProvider } from './types.ts';

export const uk: FuelProvider = {
  country: 'UK',
  source: 'uk-fuel-finder',
  bbox: [-8.7, 49.8, 1.8, 60.9],
  ttlMs: 15 * 60_000,
  configured: () => Boolean(config.fuelFinderId && config.fuelFinderSecret),
  async load() {
    throw new Error(
      config.fuelFinderId
        ? 'UK Fuel Finder provider is not implemented yet (see server/providers/uk.ts).'
        : 'UK Fuel Finder needs FUEL_FINDER_CLIENT_ID / FUEL_FINDER_CLIENT_SECRET.',
    );
  },
};
