// Finds the series inside a podcast feed.
//
// Podcasts mark series in different ways, so several detectors run in order and
// the first one that claims an episode wins:
//   1. Your own rules (Settings → the podcast → "Add series rule")
//   2. Numbered prefixes        "11.29-Liberty, Equality, Humanity"        (Revolutions)
//   3. Multi-part episodes      "Episode 310 - The Weather Underground: Part 1"  (Lions Led by Donkeys)
//   4. Shared title prefixes    "Rome: The Gracchi", "Rome: Sulla"
//   5. itunes:season tags, when a feed uses them and nothing above applies
//
// This file is pure TypeScript with no browser APIs, so it can be tested in Node.

import type { Episode, Series, SeriesRule } from './types';

type Source = Series['source'];

interface Claim {
  key: string;
  name: string;
  source: Source;
  order: number; // position inside the series (part number, minor number); 0 = use date
}

const WORD_NUMBERS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12,
};

function romanToInt(s: string): number {
  const map: Record<string, number> = { i: 1, v: 5, x: 10, l: 50, c: 100 };
  let total = 0;
  const lower = s.toLowerCase();
  for (let i = 0; i < lower.length; i++) {
    const cur = map[lower[i]];
    const next = map[lower[i + 1]] || 0;
    if (!cur) return NaN;
    total += cur < next ? -cur : cur;
  }
  return total;
}

function toNumber(token: string): number {
  if (/^\d+$/.test(token)) return Number(token);
  const w = WORD_NUMBERS[token.toLowerCase()];
  if (w) return w;
  return romanToInt(token);
}

export function normalizeKey(s: string): string {
  return s
    .toLowerCase()
    .replace(/[\u2018\u2019\u201c\u201d"'`]/g, '')
    .replace(/^the\s+/, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function tidy(s: string): string {
  return s.replace(/^[\s:\-–—,|.]+|[\s:\-–—,|.(]+$/g, '').trim();
}

/** Removes "Episode 310 -", "Ep. 12:", "#45", "E12 " and similar counters from the start. */
export function stripEpisodeCounter(title: string): string {
  return title
    // "*PREVIEW* …", "[Bonus] …", "Sneak preview: …", so previews group with the full series
    .replace(/^\s*(?:\*[^*]{1,24}\*|\[[^\]]{1,24}\]|\((?:preview|bonus|patreon)[^)]{0,20}\)|(?:sneak preview|preview|bonus|patreon exclusive)\s*[:\-–—])\s*/i, '')
    .replace(/^\s*(?:episode|ep\.?|e|#)\s*\d+[a-z]?\s*[:\-–—.|)]*\s*/i, '')
    .replace(/^\s*\d{1,4}\s*[:\-–—|)]\s+/, '')
    .trim();
}

const NUMBERED = /^\s*(\d{1,2})\.(\d{1,3})([a-z])?\s*[-–—:.]?\s*/i;
const PART =
  /(?:^|[\s:,\-–—(|])(?:part|pt\.?|chapter|ch\.|vol\.?|volume)\s*(\d{1,3}|[ivxlc]{1,6}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b/i;
// "Appendix 12- Coming Full Circle", "Supplemental 3: The Diggers"
const WORD_N = /^([\p{L}][\p{L}' ]{2,30}?)\s+(\d{1,3})\s*[-–—:]\s*\S/u;
const OF_N = /[\s(]\(?(\d{1,2})\s*(?:\/|of)\s*(\d{1,2})\)?\s*$/i;
const PREFIX_SPLIT = /\s*[:|]\s+|\s+[-–—]\s+/;

function matchRule(rule: SeriesRule, title: string): boolean {
  if (rule.mode === 'regex') {
    try {
      return new RegExp(rule.pattern, 'i').test(title);
    } catch {
      return false;
    }
  }
  return title.toLowerCase().includes(rule.pattern.toLowerCase());
}

export interface DetectOptions {
  rules?: SeriesRule[];
  /** Display names for numbered series, e.g. { "10": "The Russian Revolution" } */
  numberedNames?: Record<string, string>;
  /** User renames keyed by series key */
  renames?: Record<string, string>;
}

export function detectSeries(podcastId: string, episodes: Episode[], opts: DetectOptions = {}): Series[] {
  const rules = (opts.rules || []).filter((r) => r.podcastId === podcastId);
  const claims = new Map<string, Claim>();

  // Oldest first, so series names come from the first episode of each run.
  const eps = [...episodes].sort((a, b) => a.pubDate - b.pubDate);

  // 1. user rules
  for (const ep of eps) {
    const rule = rules.find((r) => matchRule(r, ep.title));
    if (rule) claims.set(ep.id, { key: 'rule:' + rule.id, name: rule.name, source: 'rule', order: 0 });
  }

  // 2. numbered prefixes: only trusted when the feed uses them a lot
  const numbered = eps.filter((e) => NUMBERED.test(e.title));
  const numberedDominant = numbered.length >= 3 && numbered.length >= eps.length * 0.3;
  if (numberedDominant) {
    for (const ep of numbered) {
      if (claims.has(ep.id)) continue;
      const m = ep.title.match(NUMBERED)!;
      const major = m[1];
      const minor = Number(m[2]) + (m[3] ? (m[3].toLowerCase().charCodeAt(0) - 96) / 100 : 0);
      claims.set(ep.id, {
        key: 'num:' + major,
        name: opts.numberedNames?.[major] || `Series ${major}`,
        source: 'numbered',
        order: minor,
      });
    }
  }

  // 3. multi-part episodes
  const partCandidates = new Map<string, { name: string; items: Array<{ ep: Episode; order: number }> }>();
  for (const ep of eps) {
    if (claims.has(ep.id)) continue;
    const t = stripEpisodeCounter(ep.title);
    let base = '';
    let order = 0;
    const pm = t.match(PART);
    if (pm && pm.index !== undefined) {
      base = tidy(t.slice(0, pm.index));
      order = toNumber(pm[1]);
      if (!base) {
        // "Part 2: The Somme" style: series name is what follows the marker
        // (tidy first, so the ": " right after "Part One" doesn't leave an empty name)
        base = tidy(tidy(t.slice(pm.index + pm[0].length)).split(PREFIX_SPLIT)[0] || '');
      }
    } else {
      const om = t.match(OF_N);
      const wm = t.match(WORD_N);
      if (om && om.index !== undefined) {
        base = tidy(t.slice(0, om.index));
        order = Number(om[1]);
      } else if (wm) {
        base = tidy(wm[1]);
        order = Number(wm[2]);
      }
    }
    // "Patreon Bonus - Gallipoli Pt. 1" → "Gallipoli"
    const segs = base.split(PREFIX_SPLIT).map(tidy).filter(Boolean);
    if (segs.length > 1 && segs[segs.length - 1].length >= 3) base = segs[segs.length - 1];
    if (base.length < 3) continue;
    const k = normalizeKey(base);
    if (!k) continue;
    const entry = partCandidates.get(k) || { name: base, items: [] };
    entry.items.push({ ep, order: Number.isNaN(order) ? 0 : order });
    partCandidates.set(k, entry);
  }
  for (const [k, entry] of partCandidates) {
    if (entry.items.length < 2) continue;
    for (const { ep, order } of entry.items) {
      claims.set(ep.id, { key: 'part:' + k, name: entry.name, source: 'parts', order });
    }
  }

  // 4. shared prefix before ":" / " - " / "|"
  const prefixCandidates = new Map<string, { name: string; eps: Episode[] }>();
  for (const ep of eps) {
    if (claims.has(ep.id)) continue;
    const t = stripEpisodeCounter(ep.title);
    const pieces = t.split(PREFIX_SPLIT);
    if (pieces.length < 2) continue;
    const prefix = tidy(pieces[0]);
    if (prefix.length < 3 || prefix.length > 60 || /^\d+$/.test(prefix)) continue;
    // "Part One", "Chapter 2" and the like are never a series name on their own
    if (/^(?:part|pt\.?|chapter|ch\.|vol\.?|volume)\s*(?:\d{1,3}|[ivxlc]{1,6}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)$/i.test(prefix)) continue;
    const k = normalizeKey(prefix);
    const entry = prefixCandidates.get(k) || { name: prefix, eps: [] };
    entry.eps.push(ep);
    prefixCandidates.set(k, entry);
  }
  for (const [k, entry] of prefixCandidates) {
    // at least 3 episodes, and not a prefix every single episode shares (that's the show's name)
    if (entry.eps.length < 3 || entry.eps.length > eps.length * 0.8) continue;
    for (const ep of entry.eps) claims.set(ep.id, { key: 'prefix:' + k, name: entry.name, source: 'prefix', order: 0 });
  }

  // 5. itunes:season, only when the feed has several seasons and nothing else organised it
  if (!numberedDominant) {
    const seasons = new Set(eps.map((e) => e.season).filter(Boolean));
    if (seasons.size >= 2) {
      for (const ep of eps) {
        if (claims.has(ep.id) || !ep.season) continue;
        claims.set(ep.id, {
          key: 'season:' + ep.season,
          name: `Season ${ep.season}`,
          source: 'season',
          order: ep.episodeNumber || 0,
        });
      }
    }
  }

  // Assemble
  const byKey = new Map<string, { series: Series; ordered: Array<{ ep: Episode; order: number }> }>();
  for (const ep of eps) {
    const c = claims.get(ep.id);
    if (!c) continue;
    let entry = byKey.get(c.key);
    if (!entry) {
      entry = {
        series: { key: c.key, podcastId, name: opts.renames?.[c.key] || c.name, episodeIds: [], source: c.source },
        ordered: [],
      };
      byKey.set(c.key, entry);
    }
    entry.ordered.push({ ep, order: c.order });
  }

  const result: Array<{ series: Series; start: number }> = [];
  for (const { series, ordered } of byKey.values()) {
    ordered.sort((a, b) => (a.order && b.order && a.order !== b.order ? a.order - b.order : a.ep.pubDate - b.ep.pubDate));
    series.episodeIds = ordered.map((o) => o.ep.id);
    const start = Math.min(...ordered.map((o) => o.ep.pubDate));
    result.push({ series, start });
  }
  // Numbered series in number order; everything else by when it started.
  result.sort((a, b) => {
    const an = a.series.key.startsWith('num:') ? Number(a.series.key.slice(4)) : NaN;
    const bn = b.series.key.startsWith('num:') ? Number(b.series.key.slice(4)) : NaN;
    if (!Number.isNaN(an) && !Number.isNaN(bn)) return an - bn;
    return a.start - b.start;
  });
  return result.map((r) => r.series);
}

/** Known series names for shows whose series are numbered rather than named. */
export function presetNumberedNames(podcastTitle: string): Record<string, string> | undefined {
  if (/^revolutions\b/i.test(podcastTitle.trim())) {
    return {
      '0': 'Introduction',
      '1': 'The English Revolution',
      '2': 'The American Revolution',
      '3': 'The French Revolution',
      '4': 'The Haitian Revolution',
      '5': 'The Spanish American Wars of Independence',
      '6': 'The July Revolution',
      '7': 'The Revolutions of 1848',
      '8': 'The Paris Commune',
      '9': 'The Mexican Revolution',
      '10': 'The Russian Revolution',
      '11': 'The Martian Revolution',
    };
  }
  return undefined;
}
