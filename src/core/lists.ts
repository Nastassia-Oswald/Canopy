// Smart lists: "New episodes" and the "Daily round-up".
import type { Episode, Podcast } from './types';
import type { State } from './store';

const DAY = 24 * 60 * 60 * 1000;
/** How far back "New episodes" looks. */
export const NEW_WINDOW_DAYS = 14;
/** How recent an episode must be to make the round-up. */
export const ROUNDUP_HOURS = 30;

type ListState = Pick<State, 'podcasts' | 'episodes' | 'progress' | 'newClearedAt' | 'roundup' | 'categories' | 'roundupDismissed'>;

/** Shows in a category marked "keep out of Today" (sleep & meditation by default). */
export function hiddenFromToday(s: Pick<State, 'podcasts' | 'categories'>): Set<string> {
  const hidden = new Set(s.categories.filter((c) => c.hideFromToday).map((c) => c.id));
  return new Set(s.podcasts.filter((p) => p.categoryIds.some((c) => hidden.has(c))).map((p) => p.id));
}

/** Trailers and paywall teasers: "Patreon Preview", "Introducing…", "*PREVIEW*". */
const TEASER = /patreon\s*(exclusive\s*)?preview|preview\b[^a-z]*(from|on|of)?\s*(our\s*)?patreon|^\W*preview\W|^\s*(\W|(ep(isode)?\.?\s*)?\d+\s*[-–—:.]\s*)*introducing\b/i;
export function isTeaser(title: string): boolean {
  return TEASER.test(title);
}

/** Teasers only get hidden for shows you don't have the Patreon feed of. */
function teaserFilter(s: Pick<State, 'podcasts'>) {
  const patreon = new Set(s.podcasts.filter((p) => p.isPatreon).map((p) => p.id));
  return (e: Episode) => !patreon.has(e.podcastId) && isTeaser(e.title);
}

/** Unplayed episodes from the last two weeks (or since you last cleared the list), newest first. */
export function newEpisodes(s: ListState, now = Date.now()): Episode[] {
  const since = Math.max(now - NEW_WINDOW_DAYS * DAY, s.newClearedAt);
  const hidden = hiddenFromToday(s);
  const teaser = teaserFilter(s);
  const out: Episode[] = [];
  for (const [pid, list] of Object.entries(s.episodes)) {
    if (hidden.has(pid)) continue;
    for (const e of list) {
      if (e.pubDate < since) break; // lists are newest first
      if (!s.progress[e.id]?.played && !teaser(e)) out.push(e);
    }
  }
  return out.sort((a, b) => b.pubDate - a.pubDate);
}

/** The shows in the round-up, in play order. Defaults to everything in the News category. */
export function roundupShows(s: ListState): Podcast[] {
  const hidden = hiddenFromToday(s);
  const shows = s.roundup
    ? s.roundup.map((id) => s.podcasts.find((p) => p.id === id)).filter((p): p is Podcast => !!p)
    : s.podcasts.filter((p) => p.categoryIds.includes(newsCategoryId(s)));
  return shows.filter((p) => !hidden.has(p.id));
}

function newsCategoryId(s: Pick<State, 'categories'>): string {
  return s.categories.find((c) => c.id === 'news')?.id || s.categories.find((c) => /^news|notizie/i.test(c.name))?.id || 'news';
}

/** Today's round-up: the latest episode of each round-up show from the last 30 hours (played ones stay, dimmed). */
export function roundupEpisodes(s: ListState, now = Date.now()): Episode[] {
  const cutoff = now - ROUNDUP_HOURS * 60 * 60 * 1000;
  const teaser = teaserFilter(s);
  const out: Episode[] = [];
  for (const p of roundupShows(s)) {
    const latest = (s.episodes[p.id] || []).find((e) => !teaser(e));
    if (latest && latest.pubDate >= cutoff && !s.roundupDismissed?.includes(latest.id)) out.push(latest);
  }
  return out;
}
