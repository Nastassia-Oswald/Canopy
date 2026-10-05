import { create } from 'zustand';
import { get as idbGet, set as idbSet, del as idbDel } from 'idb-keyval';
import type { Category, Episode, Playlist, PlaylistItem, Podcast, Progress, Series, SeriesRule, Settings } from './types';
import { fetchFeed, isPatreonUrl } from './rss';
import { olderSoundcloudEpisodes, soundcloudUser } from './soundcloud';
import { detectSeries, presetNumberedNames } from './series';
import { hash, uid } from './util';

const DEFAULT_CATEGORIES: Category[] = [
  { id: 'news', name: 'News' },
  { id: 'history', name: 'History' },
  { id: 'entertainment', name: 'Entertainment' },
  { id: 'politics', name: 'Politics' },
  { id: 'science', name: 'Science' },
  { id: 'culture', name: 'Culture' },
  { id: 'sleep', name: 'Sleep & Meditation', hideFromToday: true },
];

const DEFAULT_SETTINGS: Settings = {
  proxyUrl: '/api/proxy',
  playbackRate: 1,
  skipBack: 15,
  skipForward: 30,
  seriesOrder: 'oldest',
  hidePlayed: false,
  autoplayNext: true,
  episodeSort: 'newest',
  boost: 0,
  deleteFinishedDownloads: true,
  theme: 'dark',
};

/** Everything saved in one IndexedDB record. Episodes live in their own records (one per podcast). */
interface Saved {
  version: 1;
  podcasts: Podcast[];
  categories: Category[];
  progress: Record<string, Progress>;
  playlists: Playlist[];
  rules: SeriesRule[];
  seriesRenames: Record<string, Record<string, string>>;
  queue: string[];
  nowPlaying: string | null;
  settings: Settings;
  /** Shows in the Daily round-up, in play order. null = every show in the News category. */
  roundup: string[] | null;
  /** "New episodes" hides anything released before this (set by Clear). */
  newClearedAt: number;
  /** Episodes you ticked off the Daily round-up. */
  roundupDismissed: string[];
}

export interface State extends Omit<Saved, 'version'> {
  ready: boolean;
  episodes: Record<string, Episode[]>;
  refreshing: Record<string, boolean>;

  addPodcast(feedUrl: string, categoryIds?: string[]): Promise<Podcast>;
  refreshPodcast(id: string): Promise<void>;
  refreshAll(): Promise<{ failed: string[] }>;
  removePodcast(id: string): void;
  updatePodcast(id: string, patch: Partial<Pick<Podcast, 'categoryIds' | 'feedUrl' | 'title' | 'hideGuests' | 'episodeSort'>>): void;

  addCategory(name: string): Category;
  renameCategory(id: string, name: string): void;
  deleteCategory(id: string): void;

  createPlaylist(name: string, items?: PlaylistItem[]): Playlist;
  renamePlaylist(id: string, name: string): void;
  updatePlaylist(id: string, patch: Partial<Pick<Playlist, 'name' | 'glyph' | 'cover' | 'photo'>>): void;
  deletePlaylist(id: string): void;
  addToPlaylist(id: string, item: PlaylistItem): void;
  removeFromPlaylist(id: string, index: number): void;
  movePlaylistItem(id: string, from: number, to: number): void;

  addRule(rule: Omit<SeriesRule, 'id'>): void;
  deleteRule(id: string): void;
  renameSeries(podcastId: string, key: string, name: string): void;

  setProgress(episodeId: string, p: Partial<Progress>): void;
  togglePlayed(episodeId: string, played?: boolean): void;
  /** Mark several episodes (a series, a whole show) as listened or not, in one go. */
  setPlayedMany(episodeIds: string[], played: boolean): void;

  setQueue(ids: string[]): void;
  enqueue(ids: string[], next?: boolean): void;
  removeFromQueue(index: number): void;
  moveInQueue(from: number, to: number): void;
  setNowPlaying(id: string | null): void;

  updateSettings(patch: Partial<Settings>): void;
  setRoundup(ids: string[] | null): void;
  dismissFromRoundup(episodeId: string): void;
  restoreRoundup(): void;
  toggleFavorite(podcastId: string): void;
  clearNew(): void;

  exportBackup(): Promise<string>;
  importBackup(json: string): Promise<void>;
  importOpml(xml: string, onProgress?: (done: number, total: number) => void): Promise<{ added: number; failed: string[] }>;
  setCategoryHidden(id: string, hidden: boolean): void;
}

function pickSaved(s: State): Saved {
  return {
    version: 1,
    podcasts: s.podcasts,
    categories: s.categories,
    progress: s.progress,
    playlists: s.playlists,
    rules: s.rules,
    seriesRenames: s.seriesRenames,
    queue: s.queue,
    nowPlaying: s.nowPlaying,
    settings: s.settings,
    roundup: s.roundup,
    newClearedAt: s.newClearedAt,
    roundupDismissed: s.roundupDismissed,
  };
}

function suggestCategories(feedCategories: string[], categories: Category[]): string[] {
  const aliases: Record<string, string[]> = {
    news: ['news', 'daily news'],
    history: ['history'],
    entertainment: ['comedy', 'tv & film', 'leisure', 'fiction', 'arts', 'music', 'sports', 'entertainment'],
    politics: ['politics', 'government'],
    science: ['science', 'technology'],
    culture: ['society & culture', 'culture', 'arts', 'religion & spirituality'],
  };
  const lower = feedCategories.map((c) => c.toLowerCase());
  const out = new Set<string>();
  for (const cat of categories) {
    const names = [cat.name.toLowerCase(), ...(aliases[cat.id] || [])];
    if (lower.some((fc) => names.some((n) => fc === n || fc.includes(n)))) out.add(cat.id);
  }
  return [...out].slice(0, 2);
}

export const useStore = create<State>()((set, get) => ({
  ready: false,
  podcasts: [],
  episodes: {},
  refreshing: {},
  categories: DEFAULT_CATEGORIES,
  progress: {},
  playlists: [],
  rules: [],
  seriesRenames: {},
  queue: [],
  nowPlaying: null,
  settings: DEFAULT_SETTINGS,
  roundup: null,
  newClearedAt: 0,
  roundupDismissed: [],

  async addPodcast(rawUrl, categoryIds) {
    const feedUrl = rawUrl.trim().replace(/^feed:\/\//i, 'https://').replace(/^podcast:\/\//i, 'https://');
    const existing = get().podcasts.find((p) => p.feedUrl === feedUrl);
    if (existing) return existing;
    const id = hash(feedUrl);
    const parsed = await fetchFeed(get().settings.proxyUrl, feedUrl, id);
    const podcast: Podcast = {
      id,
      feedUrl,
      ...parsed.podcast,
      categoryIds: categoryIds?.length ? categoryIds : suggestCategories(parsed.feedCategories, get().categories),
      isPatreon: isPatreonUrl(feedUrl),
      addedAt: Date.now(),
      lastFetched: Date.now(),
    };
    await idbSet('eps:' + id, parsed.episodes);
    set((s) => ({ podcasts: [...s.podcasts, podcast], episodes: { ...s.episodes, [id]: parsed.episodes } }));
    return podcast;
  },

  async refreshPodcast(id) {
    const p = get().podcasts.find((x) => x.id === id);
    if (!p) return;
    set((s) => ({ refreshing: { ...s.refreshing, [id]: true } }));
    try {
      const parsed = await fetchFeed(get().settings.proxyUrl, p.feedUrl, id);
      // Many hosts only list their newest episodes (SoundCloud stops at 500). Episodes that drop
      // off the feed stay in the app instead of vanishing, along with your progress.
      const fresh = new Set(parsed.episodes.map((e) => e.id));
      const kept = (get().episodes[id] || []).filter((e) => !fresh.has(e.id));
      let all = kept.length ? [...parsed.episodes, ...kept].sort((a, b) => b.pubDate - a.pubDate) : parsed.episodes;
      // SoundCloud shows: fetch the episodes past the feed's 500 once (they're then kept like the rest)
      let archivedAt = p.archivedAt;
      if (!archivedAt && soundcloudUser(p.feedUrl) && parsed.episodes.length >= 490) {
        try {
          const older = await olderSoundcloudEpisodes(get().settings.proxyUrl, p, all);
          if (older.length) all = [...all, ...older].sort((a, b) => b.pubDate - a.pubDate);
          archivedAt = Date.now();
        } catch { /* try again next refresh */ }
      }
      await idbSet('eps:' + id, all);
      set((s) => ({
        episodes: { ...s.episodes, [id]: all },
        podcasts: s.podcasts.map((x) =>
          x.id === id ? { ...x, ...parsed.podcast, title: x.title || parsed.podcast.title, lastFetched: Date.now(), archivedAt } : x,
        ),
      }));
    } finally {
      set((s) => ({ refreshing: { ...s.refreshing, [id]: false } }));
    }
  },

  async refreshAll() {
    const failed: string[] = [];
    await pool(get().podcasts, 6, (p) => get().refreshPodcast(p.id).catch(() => void failed.push(p.title)));
    return { failed };
  },

  removePodcast(id) {
    idbDel('eps:' + id);
    set((s) => {
      const { [id]: _gone, ...episodes } = s.episodes;
      const epIds = new Set((s.episodes[id] || []).map((e) => e.id));
      return {
        podcasts: s.podcasts.filter((p) => p.id !== id),
        episodes,
        rules: s.rules.filter((r) => r.podcastId !== id),
        roundup: s.roundup ? s.roundup.filter((r) => r !== id) : null,
        queue: s.queue.filter((q) => !epIds.has(q)),
        playlists: s.playlists.map((pl) => ({
          ...pl,
          items: pl.items.filter((it) => (it.kind === 'episode' ? !epIds.has(it.episodeId) : it.podcastId !== id)),
        })),
      };
    });
  },

  updatePodcast(id, patch) {
    set((s) => ({ podcasts: s.podcasts.map((p) => (p.id === id ? { ...p, ...patch, isPatreon: isPatreonUrl(patch.feedUrl ?? p.feedUrl) } : p)) }));
  },

  addCategory(name) {
    const cat = { id: uid(), name: name.trim() };
    set((s) => ({ categories: [...s.categories, cat] }));
    return cat;
  },
  renameCategory(id, name) {
    set((s) => ({ categories: s.categories.map((c) => (c.id === id ? { ...c, name: name.trim() } : c)) }));
  },
  deleteCategory(id) {
    set((s) => ({
      categories: s.categories.filter((c) => c.id !== id),
      podcasts: s.podcasts.map((p) => ({ ...p, categoryIds: p.categoryIds.filter((c) => c !== id) })),
    }));
  },

  createPlaylist(name, items = []) {
    const pl: Playlist = { id: uid(), name: name.trim() || 'New playlist', items, createdAt: Date.now(), glyph: 'headphone', cover: '' };
    set((s) => ({ playlists: [...s.playlists, pl] }));
    return pl;
  },
  renamePlaylist(id, name) {
    set((s) => ({ playlists: s.playlists.map((p) => (p.id === id ? { ...p, name: name.trim() } : p)) }));
  },
  updatePlaylist(id, patch) {
    set((s) => ({ playlists: s.playlists.map((p) => (p.id === id ? { ...p, ...patch, name: (patch.name ?? p.name).trim() || p.name } : p)) }));
  },
  deletePlaylist(id) {
    set((s) => ({ playlists: s.playlists.filter((p) => p.id !== id || p.builtin) }));
  },
  addToPlaylist(id, item) {
    set((s) => ({
      playlists: s.playlists.map((p) => {
        if (p.id !== id) return p;
        const dupe = p.items.some((it) => JSON.stringify(it) === JSON.stringify(item));
        return dupe ? p : { ...p, items: [...p.items, item] };
      }),
    }));
  },
  removeFromPlaylist(id, index) {
    set((s) => ({ playlists: s.playlists.map((p) => (p.id === id ? { ...p, items: p.items.filter((_, i) => i !== index) } : p)) }));
  },
  movePlaylistItem(id, from, to) {
    set((s) => ({
      playlists: s.playlists.map((p) => {
        if (p.id !== id || to < 0 || to >= p.items.length) return p;
        const items = [...p.items];
        const [x] = items.splice(from, 1);
        items.splice(to, 0, x);
        return { ...p, items };
      }),
    }));
  },

  addRule(rule) {
    set((s) => ({ rules: [...s.rules, { ...rule, id: uid() }] }));
  },
  deleteRule(id) {
    set((s) => ({ rules: s.rules.filter((r) => r.id !== id) }));
  },
  renameSeries(podcastId, key, name) {
    set((s) => ({ seriesRenames: { ...s.seriesRenames, [podcastId]: { ...(s.seriesRenames[podcastId] || {}), [key]: name.trim() } } }));
  },

  setProgress(episodeId, p) {
    set((s) => {
      const prev = s.progress[episodeId] || { position: 0, duration: 0, played: false, updatedAt: 0 };
      return { progress: { ...s.progress, [episodeId]: { ...prev, ...p, updatedAt: Date.now() } } };
    });
  },
  setPlayedMany(episodeIds, played) {
    set((s) => {
      const progress = { ...s.progress };
      const now = Date.now();
      for (const id of episodeIds) {
        const prev = progress[id] || { position: 0, duration: 0, played: false, updatedAt: 0 };
        if (prev.played === played) continue;
        progress[id] = { ...prev, played, position: played ? 0 : prev.position, updatedAt: now };
      }
      return { progress };
    });
  },
  togglePlayed(episodeId, played) {
    const cur = get().progress[episodeId]?.played ?? false;
    const next = played ?? !cur;
    get().setProgress(episodeId, { played: next, position: next ? 0 : get().progress[episodeId]?.position ?? 0 });
  },

  setQueue(ids) {
    set({ queue: ids });
  },
  enqueue(ids, next = false) {
    set((s) => {
      const rest = s.queue.filter((q) => !ids.includes(q));
      return { queue: next ? [...ids, ...rest] : [...rest, ...ids] };
    });
  },
  removeFromQueue(index) {
    set((s) => ({ queue: s.queue.filter((_, i) => i !== index) }));
  },
  moveInQueue(from, to) {
    set((s) => {
      if (to < 0 || to >= s.queue.length) return s;
      const q = [...s.queue];
      const [x] = q.splice(from, 1);
      q.splice(to, 0, x);
      return { queue: q };
    });
  },
  setNowPlaying(id) {
    set({ nowPlaying: id });
  },

  updateSettings(patch) {
    set((s) => ({ settings: { ...s.settings, ...patch } }));
  },

  setRoundup(ids) {
    set({ roundup: ids });
  },
  dismissFromRoundup(episodeId) {
    // keep the list short: old dismissals no longer matter once the episode leaves the round-up
    set((s) => ({ roundupDismissed: [...s.roundupDismissed.filter((x) => x !== episodeId), episodeId].slice(-200) }));
  },
  restoreRoundup() {
    set({ roundupDismissed: [] });
  },
  toggleFavorite(podcastId) {
    // the heart puts the whole show in the Fave playlist (or takes it out)
    set((s) => {
      const on = isFave(s, podcastId);
      return {
        playlists: s.playlists.map((pl) =>
          pl.builtin !== 'fave'
            ? pl
            : { ...pl, items: on ? pl.items.filter((it) => !(it.kind === 'podcast' && it.podcastId === podcastId)) : [...pl.items, { kind: 'podcast', podcastId }] },
        ),
      };
    });
  },
  clearNew() {
    set({ newClearedAt: Date.now() });
  },

  async exportBackup() {
    const s = get();
    return JSON.stringify({ ...pickSaved(s), exportedAt: new Date().toISOString() }, null, 2);
  },

  async importBackup(json) {
    const data = JSON.parse(json) as Saved;
    if (!data || !Array.isArray(data.podcasts)) throw new Error("This file isn't a Tapedeck backup.");
    set({
      categories: data.categories?.length ? data.categories : DEFAULT_CATEGORIES,
      progress: data.progress || {},
      ...faveFromHearts({ podcasts: data.podcasts, playlists: withBuiltins(data.playlists || []) }),
      rules: data.rules || [],
      seriesRenames: data.seriesRenames || {},
      queue: data.queue || [],
      nowPlaying: null,
      settings: { ...DEFAULT_SETTINGS, ...(data.settings || {}) },
      roundup: data.roundup ?? null,
      newClearedAt: data.newClearedAt || 0,
      roundupDismissed: data.roundupDismissed || [],
    });
    // episodes are not in the backup; fetch them fresh
    const eps: Record<string, Episode[]> = {};
    for (const p of data.podcasts) eps[p.id] = (await idbGet<Episode[]>('eps:' + p.id)) || [];
    set({ episodes: eps });
    get().refreshAll();
  },

  setCategoryHidden(id, hidden) {
    set((s) => ({ categories: s.categories.map((c) => (c.id === id ? { ...c, hideFromToday: hidden } : c)) }));
  },

  async importOpml(xml, onProgress) {
    const doc = new DOMParser().parseFromString(xml, 'text/xml');
    const outlines = Array.from(doc.querySelectorAll('outline[xmlUrl]'));
    if (!outlines.length) throw new Error('No podcasts found in this file. It should be an OPML export from another podcast app.');

    // Categories come from a `category` attribute ("History, In italiano") and/or the folder the show sits in.
    const categoryFor = (name: string): string => {
      const n = name.trim();
      const hit = get().categories.find((c) => c.name.toLowerCase() === n.toLowerCase());
      if (hit) return hit.id;
      const c = get().addCategory(n);
      if (/sleep|meditat|sonno|bedtime/i.test(n)) get().setCategoryHidden(c.id, true);
      return c.id;
    };
    const items = outlines.map((o) => {
      const names = (o.getAttribute('category') || '').split(/[,;]/).map((x) => x.replace(/^\//, '').trim()).filter(Boolean);
      const parent = o.parentElement;
      if (!names.length && parent?.tagName === 'outline' && !parent.getAttribute('xmlUrl')) {
        const folder = parent.getAttribute('text') || parent.getAttribute('title');
        if (folder) names.push(folder);
      }
      return { url: o.getAttribute('xmlUrl') || '', names };
    });

    const failed: string[] = [];
    let added = 0;
    let done = 0;
    await pool(items, 6, async ({ url, names }) => {
      try {
        const catIds = [...new Set(names.map(categoryFor))];
        const existing = get().podcasts.find((p) => p.feedUrl === url);
        if (existing) {
          if (catIds.length) get().updatePodcast(existing.id, { categoryIds: [...new Set([...existing.categoryIds, ...catIds])] });
        } else {
          await get().addPodcast(url, catIds);
          added++;
        }
      } catch {
        failed.push(outlines.find((o) => o.getAttribute('xmlUrl') === url)?.getAttribute('text') || url);
      }
      onProgress?.(++done, items.length);
    });
    return { added, failed };
  },
}));

/** Runs `fn` over `items`, at most `limit` at a time. */
async function pool<T>(items: T[], limit: number, fn: (item: T) => Promise<unknown>): Promise<void> {
  let i = 0;
  const worker = async () => {
    while (i < items.length) await fn(items[i++]);
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

/** Anything listened to past 85% counts as finished (also fixes up progress saved before this rule). */
/** A show is a Fave when the whole show sits in the Fave playlist. */
export function isFave(s: Pick<State, 'playlists'>, podcastId: string): boolean {
  return !!s.playlists.find((p) => p.builtin === 'fave')?.items.some((it) => it.kind === 'podcast' && it.podcastId === podcastId);
}

/** Older versions kept a heart on the show itself: move those hearts into the Fave playlist. */
function faveFromHearts<T extends Pick<State, 'podcasts' | 'playlists'>>(s: T): Pick<State, 'podcasts' | 'playlists'> {
  const hearted = s.podcasts.filter((p) => p.favorite);
  if (!hearted.length) return { podcasts: s.podcasts, playlists: s.playlists };
  return {
    podcasts: s.podcasts.map((p) => (p.favorite ? { ...p, favorite: undefined } : p)),
    playlists: s.playlists.map((pl) => {
      if (pl.builtin !== 'fave') return pl;
      const add = hearted.filter((p) => !pl.items.some((it) => it.kind === 'podcast' && it.podcastId === p.id));
      return { ...pl, items: [...pl.items, ...add.map((p) => ({ kind: 'podcast' as const, podcastId: p.id }))] };
    }),
  };
}

const BUILTINS: Array<Pick<Playlist, 'builtin' | 'name' | 'glyph' | 'cover'>> = [
  { builtin: 'fave', name: 'Fave', glyph: 'heart', cover: 'swirl' },
  { builtin: 'sleep', name: 'Sleep', glyph: 'sleep', cover: 'stars' },
  { builtin: 'later', name: 'Listen later', glyph: 'later', cover: 'contour' },
  { builtin: 'offline', name: 'Offline', glyph: 'download', cover: 'mesh' },
];

/** Puts Fave, Sleep, Listen later and Offline first, creating any that are missing. */
export function withBuiltins(playlists: Playlist[]): Playlist[] {
  const built = BUILTINS.map((b) => {
    const found = playlists.find((p) => p.builtin === b.builtin);
    if (found) {
      let pl = found;
      if (b.builtin === 'fave' && pl.name === 'Favourite') pl = { ...pl, name: 'Fave' }; // one word everywhere: Fave
      if (pl.cover === undefined && !pl.photo) pl = { ...pl, cover: b.cover }; // the library's default covers
      return pl;
    }
    return found || ({ id: 'pl-' + b.builtin, items: [], createdAt: 0, ...b } as Playlist);
  });
  return [...built, ...playlists.filter((p) => !p.builtin)];
}

function markFinished(progress: Record<string, Progress>): Record<string, Progress> {
  const out: Record<string, Progress> = {};
  for (const [id, p] of Object.entries(progress)) {
    out[id] = !p.played && p.duration > 0 && p.position / p.duration >= 0.85 ? { ...p, played: true } : p;
  }
  return out;
}

// ---------- persistence ----------

let saveTimer: ReturnType<typeof setTimeout> | undefined;

export async function loadStore(): Promise<void> {
  try {
    const saved = await idbGet<Saved>('state');
    if (saved) {
      const episodes: Record<string, Episode[]> = {};
      await Promise.all(
        saved.podcasts.map(async (p) => {
          episodes[p.id] = (await idbGet<Episode[]>('eps:' + p.id)) || [];
        }),
      );
      useStore.setState({
        ...saved,
        roundup: saved.roundup ?? null,
        newClearedAt: saved.newClearedAt || 0,
        roundupDismissed: saved.roundupDismissed || [],
        settings: { ...DEFAULT_SETTINGS, ...saved.settings },
        progress: markFinished(saved.progress || {}),
        playlists: withBuiltins(saved.playlists || []),
        episodes,
      });
    }
  } catch (e) {
    console.warn('Could not load saved library', e);
  }
  useStore.setState((s) => faveFromHearts({ ...s, playlists: withBuiltins(s.playlists) }));
  useStore.setState({ ready: true });
  useStore.subscribe((s) => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => idbSet('state', pickSaved(s)).catch(() => undefined), 400);
  });
  // Ask the browser to keep our data (important on iOS, which clears unused storage).
  navigator.storage?.persist?.().catch(() => undefined);
}

// ---------- derived data ----------

const seriesCache = new WeakMap<Episode[], { sig: string; series: Series[] }>();

export function getSeries(state: Pick<State, 'podcasts' | 'episodes' | 'rules' | 'seriesRenames'>, podcastId: string): Series[] {
  const eps = state.episodes[podcastId] || [];
  const podcast = state.podcasts.find((p) => p.id === podcastId);
  const rules = state.rules.filter((r) => r.podcastId === podcastId);
  const renames = state.seriesRenames[podcastId] || {};
  const sig = JSON.stringify([rules, renames, podcast?.title]);
  const hit = seriesCache.get(eps);
  if (hit && hit.sig === sig) return hit.series;
  const series = detectSeries(podcastId, eps, {
    rules,
    renames,
    numberedNames: presetNumberedNames(podcast?.title || ''),
  });
  seriesCache.set(eps, { sig, series });
  return series;
}

let indexCache: { src: Record<string, Episode[]>; map: Map<string, Episode> } | null = null;
export function episodeIndex(episodes: Record<string, Episode[]>): Map<string, Episode> {
  if (indexCache?.src === episodes) return indexCache.map;
  const map = new Map<string, Episode>();
  for (const list of Object.values(episodes)) for (const e of list) map.set(e.id, e);
  indexCache = { src: episodes, map };
  return map;
}

/** Expands a playlist into episode ids, in play order. Series items expand to their episodes. */
export function expandPlaylist(state: State, pl: Playlist): string[] {
  const out: string[] = [];
  for (const it of pl.items) {
    if (it.kind === 'episode') out.push(it.episodeId);
    else if (it.kind === 'podcast') {
      out.push(...(state.episodes[it.podcastId] || []).filter((e) => !state.progress[e.id]?.played).map((e) => e.id));
    } else {
      const s = getSeries(state, it.podcastId).find((x) => x.key === it.seriesKey);
      if (s) out.push(...s.episodeIds);
    }
  }
  return out;
}
