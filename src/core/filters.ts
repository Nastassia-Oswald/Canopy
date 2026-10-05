// Filtering and sorting for episode lists: status, guests, search, order.
import type { Episode, EpisodeSort, EpisodeStatus, Progress } from './types';

// "… with Jane Smith", "feat. Daniel Bessner", "ft. …", "w/ …", Italian "con Mario Rossi".
// Needs at least two capitalised words after the marker, so "Life with cats" doesn't count.
const GUEST = /(?:^|[\s(:\-–—|])(?:with|feat\.?|ft\.|featuring|w\/|con|ospite:?|guest:?)\s+(?:(?:Dr|Prof|Sir|Dame)\.?\s+)?\p{Lu}[\p{L}'’.-]+(?:\s+(?:de|di|da|del|van|von|le|la|el|al|bin)\b)?\s+\p{Lu}[\p{L}'’-]+/u;

export function hasGuest(title: string): boolean {
  return GUEST.test(title);
}

export function statusOf(p: Progress | undefined): Exclude<EpisodeStatus, 'all'> {
  if (p?.played) return 'finished';
  if (p && p.position > 5) return 'inProgress';
  return 'unplayed';
}

export interface EpisodeFilter {
  status: EpisodeStatus;
  hideGuests: boolean;
  query: string;
  sort: EpisodeSort | 'series';
}

export function applyFilter(eps: Episode[], f: EpisodeFilter, progress: Record<string, Progress>): Episode[] {
  const q = f.query.trim().toLowerCase();
  let out = eps.filter((e) => {
    if (f.status !== 'all' && statusOf(progress[e.id]) !== f.status) return false;
    if (f.hideGuests && hasGuest(e.title)) return false;
    if (q && !e.title.toLowerCase().includes(q) && !e.description.toLowerCase().includes(q)) return false;
    return true;
  });
  const played = (e: Episode) => (progress[e.id]?.position || progress[e.id]?.played ? progress[e.id]!.updatedAt : 0);
  switch (f.sort) {
    case 'newest':
      out = [...out].sort((a, b) => b.pubDate - a.pubDate);
      break;
    case 'oldest':
      out = [...out].sort((a, b) => a.pubDate - b.pubDate);
      break;
    case 'recentlyPlayed':
      // never-played episodes go last, newest first among them
      out = [...out].sort((a, b) => played(b) - played(a) || b.pubDate - a.pubDate);
      break;
    case 'playedLongAgo':
      out = [...out].sort((a, b) => {
        const pa = played(a), pb = played(b);
        if (!pa !== !pb) return pa ? -1 : 1;
        return pa - pb || b.pubDate - a.pubDate;
      });
      break;
    case 'series':
      break; // keep the given (series) order
  }
  return out;
}

export const SORT_LABELS: Record<EpisodeSort | 'series', string> = {
  series: 'Series order',
  newest: 'Newest first',
  oldest: 'Oldest first',
  recentlyPlayed: 'Recently played',
  playedLongAgo: 'Played longest ago',
};

export const STATUS_LABELS: Record<EpisodeStatus, string> = {
  all: 'All',
  unplayed: 'Unplayed',
  inProgress: 'In progress',
  finished: 'Finished',
};
