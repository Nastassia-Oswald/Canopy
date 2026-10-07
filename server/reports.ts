/**
 * Crowd reports (toilet cleanliness etc.). No public dataset exists for this,
 * so Canopy collects it from its own users. Stored in a JSON file for the MVP —
 * swap for a database before launch.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Report, ReportStatus } from '../shared/types.ts';
import { ROOT } from './util.ts';

const DIR = join(ROOT, 'server', 'data');
const FILE = join(DIR, 'reports.json');
const KEEP_MS = 30 * 24 * 3600_000;
/** Reports older than this no longer show on cards. */
export const REPORT_FRESH_MS = 12 * 3600_000;

let reports: Report[] = [];
try {
  reports = JSON.parse(readFileSync(FILE, 'utf8')) as Report[];
} catch {
  reports = [];
}

function persist() {
  const cutoff = Date.now() - KEEP_MS;
  reports = reports.filter((r) => Date.parse(r.createdAt) > cutoff);
  try {
    mkdirSync(DIR, { recursive: true });
    writeFileSync(FILE, JSON.stringify(reports));
  } catch (e) {
    console.warn('[reports] could not save:', (e as Error).message);
  }
}

const VALID: ReportStatus[] = ['clean', 'dirty', 'closed'];

// very small abuse guard: max 30 reports per client per hour
const perClient = new Map<string, number[]>();

export function addReport(poiId: string, status: string, client: string): Report {
  if (!/^[\w:-]{3,80}$/.test(poiId)) throw new Error('Invalid place id');
  if (!VALID.includes(status as ReportStatus)) throw new Error('Invalid status');
  const now = Date.now();
  const recent = (perClient.get(client) ?? []).filter((t) => now - t < 3600_000);
  if (recent.length >= 30) throw new Error('Too many reports — try again later');
  perClient.set(client, [...recent, now]);
  const r: Report = { poiId, status: status as ReportStatus, createdAt: new Date(now).toISOString() };
  reports.push(r);
  persist();
  return r;
}

/** Latest fresh report per place. */
export function latestReports(ids: string[]): Record<string, Report> {
  const want = new Set(ids);
  const cutoff = Date.now() - REPORT_FRESH_MS;
  const out: Record<string, Report> = {};
  for (const r of reports) {
    if (!want.has(r.poiId) || Date.parse(r.createdAt) < cutoff) continue;
    const cur = out[r.poiId];
    if (!cur || cur.createdAt < r.createdAt) out[r.poiId] = r;
  }
  return out;
}
