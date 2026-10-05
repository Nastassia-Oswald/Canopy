export interface Category {
  id: string;
  name: string;
  /** Keep these shows out of Today (round-up and New episodes), e.g. sleep and meditation. */
  hideFromToday?: boolean;
}

export interface Podcast {
  id: string;
  feedUrl: string;
  title: string;
  author: string;
  image: string;
  description: string;
  link: string;
  categoryIds: string[];
  /** Private Patreon feed (URL contains a personal token). */
  isPatreon: boolean;
  /** Hide episodes whose title names a guest ("… with Jane Smith"). */
  hideGuests?: boolean;
  /** This show's own episode order (newest first unless you changed it here). */
  episodeSort?: EpisodeSort;
  favorite?: boolean;
  /** When the older SoundCloud episodes (past the feed's 500) were fetched. */
  archivedAt?: number;
  addedAt: number;
  lastFetched: number;
}

export interface Episode {
  id: string;
  podcastId: string;
  guid: string;
  title: string;
  description: string;
  audioUrl: string;
  audioType: string;
  pubDate: number;
  /** seconds, 0 when the feed doesn't say */
  duration: number;
  image: string;
  season?: number;
  episodeNumber?: number;
  link: string;
}

export interface Progress {
  position: number;
  duration: number;
  played: boolean;
  updatedAt: number;
}

/** A user-defined rule: every episode of `podcastId` whose title matches `pattern` belongs to series `name`. */
export interface SeriesRule {
  id: string;
  podcastId: string;
  name: string;
  pattern: string;
  /** 'contains' = plain text, case-insensitive. 'regex' = JavaScript regular expression. */
  mode: 'contains' | 'regex';
}

export interface Series {
  /** stable within a podcast: e.g. "num:11", "part:the weather underground", "rule:abc" */
  key: string;
  podcastId: string;
  name: string;
  episodeIds: string[];
  source: 'season' | 'numbered' | 'parts' | 'prefix' | 'rule';
}

export type PlaylistItem =
  | { kind: 'episode'; episodeId: string }
  | { kind: 'series'; podcastId: string; seriesKey: string }
  /** a whole show: plays its unplayed episodes, newest first, and keeps up with new ones */
  | { kind: 'podcast'; podcastId: string };

export interface Playlist {
  id: string;
  name: string;
  items: PlaylistItem[];
  createdAt: number;
  /** Fave, Sleep, Listen later and Offline come built in (Offline fills itself with saved episodes): they can be renamed but not deleted. */
  builtin?: 'fave' | 'sleep' | 'later' | 'offline';
  /** Pixel mark on the cover (a glyph name). */
  glyph?: string;
  /** One of the Tapedeck covers (public/covers/<id>.jpg); '' means plain Fog. */
  cover?: string;
  /** The listener's own cover photo, as a small JPEG data URL. */
  photo?: string;
}

export interface Settings {
  proxyUrl: string;
  playbackRate: number;
  skipBack: number;
  skipForward: number;
  /** Series listing order */
  seriesOrder: 'oldest' | 'newest';
  hidePlayed: boolean;
  /** When an episode ends, carry on with Up Next. */
  autoplayNext: boolean;
  /** How episode lists are ordered. */
  episodeSort: EpisodeSort;
  /** Volume boost: 0 off, 1 boost, 2 max. */
  boost: 0 | 1 | 2;
  /** Clear an offline copy once the episode is finished and you've moved on. */
  deleteFinishedDownloads: boolean;
  /** One-off playlist additions already applied (see core/seeds.ts). */
  seedsDone?: string[];
  /** Look: dark (Chill Black, the default) or light. */
  theme?: 'dark' | 'light';
}

export type EpisodeSort = 'newest' | 'oldest' | 'recentlyPlayed' | 'playedLongAgo';
export type EpisodeStatus = 'all' | 'unplayed' | 'inProgress' | 'finished';
