import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// ── .env loading (no dependency) ───────────────────────────
try {
  const text = readFileSync(join(ROOT, '.env'), 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]!] === undefined) process.env[m[1]!] = m[2]!.replace(/^["']|["']$/g, '');
  }
} catch {
  /* no .env — fine */
}

export const config = {
  port: Number(process.env.PORT ?? 8787),
  // Nominatim rejects placeholder contacts such as example.com — leave empty rather than fake one.
  contact: /example\.(com|org)/.test(process.env.CONTACT_EMAIL ?? '') ? '' : process.env.CONTACT_EMAIL ?? '',
  osrmUrl: process.env.OSRM_URL || 'https://router.project-osrm.org',
  /** Comma-separated; tried in order. Public instances are often busy — self-host for production. */
  overpassUrls: (process.env.OVERPASS_URL ||
    'https://overpass-api.de/api/interpreter,https://maps.mail.ru/osm/tools/overpass/api/interpreter,https://overpass.private.coffee/api/interpreter')
    .split(',').map((u) => u.trim()).filter(Boolean),
  nominatimUrl: process.env.NOMINATIM_URL || 'https://nominatim.openstreetmap.org',
  tankerkoenigKey: process.env.TANKERKOENIG_API_KEY || '',
  fuelFinderId: process.env.FUEL_FINDER_CLIENT_ID || '',
  fuelFinderSecret: process.env.FUEL_FINDER_CLIENT_SECRET || '',
};

/** OSM services require an identifying User-Agent with contact details. */
export const USER_AGENT = config.contact ? `Canopy/0.1 (road-trip planner; ${config.contact})` : 'Canopy/0.1 (road-trip planner)';

export async function fetchWithTimeout(url: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<Response> {
  const { timeoutMs = 30_000, headers, ...rest } = init;
  const res = await fetch(url, {
    ...rest,
    headers: { 'User-Agent': USER_AGENT, Accept: '*/*', ...(headers as Record<string, string>) },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} — ${url.split('?')[0]}`);
  return res;
}

// ── Small TTL cache with in-flight de-duplication ──────────
interface Entry<T> { value?: T; expires: number; pending?: Promise<T> }
const store = new Map<string, Entry<unknown>>();

export async function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const hit = store.get(key) as Entry<T> | undefined;
  if (hit?.value !== undefined && hit.expires > now) return hit.value;
  if (hit?.pending) return hit.pending;
  const pending = load().then(
    (value) => {
      store.set(key, { value, expires: Date.now() + ttlMs });
      return value;
    },
    (err) => {
      // keep a stale value if we have one
      if (hit?.value !== undefined) {
        store.set(key, { value: hit.value, expires: Date.now() + 60_000 });
        return hit.value;
      }
      store.delete(key);
      throw err;
    },
  );
  store.set(key, { ...(hit ?? { expires: 0 }), pending } as Entry<unknown>);
  return pending;
}

/** Spaces out the *start* of calls by at least `intervalMs` (Nominatim: max 1 req/s). */
export function rateLimiter(intervalMs: number) {
  let next = 0;
  return async function <T>(fn: () => Promise<T>): Promise<T> {
    const now = Date.now();
    const slot = Math.max(now, next);
    next = slot + intervalMs;
    if (slot > now) await new Promise((r) => setTimeout(r, slot - now));
    return fn();
  };
}

/** Run async tasks with limited concurrency, keeping results in order. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<PromiseSettledResult<R>[]> {
  const out: PromiseSettledResult<R>[] = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      try {
        out[idx] = { status: 'fulfilled', value: await fn(items[idx]!, idx) };
      } catch (reason) {
        out[idx] = { status: 'rejected', reason };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

export function titleCase(s: string): string {
  return s
    .toLowerCase()
    .replace(/(^|[\s\-'’(])(\p{L})/gu, (_, p: string, c: string) => p + c.toUpperCase())
    .trim();
}

export function mean(values: number[]): number | undefined {
  if (!values.length) return undefined;
  return Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 1000) / 1000;
}

export function hashKey(input: unknown): string {
  const s = JSON.stringify(input);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}
