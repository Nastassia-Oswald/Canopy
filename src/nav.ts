import { create } from 'zustand';
import type { PlaylistItem } from './core/types';

export type Tab = 'playlists' | 'topics' | 'settings' | 'today';
export type Route =
  | { name: 'topic'; id: string | null } // null = all shows
  | { name: 'allseries' }
  | { name: 'queue' }
  | { name: 'podcast'; id: string }
  | { name: 'series'; podcastId: string; key: string }
  | { name: 'playlist'; id: string };

/** A screen opened from the player: going back from it reopens the player. */
type StackRoute = Route & { fromPlayer?: boolean };

interface Nav {
  tab: Tab;
  stacks: Record<Tab, StackRoute[]>;
  setTab(t: Tab): void;
  push(r: Route): void;
  pop(): void;
  /** Leave the full-screen player for a screen (Up Next, a series); Back returns to the player. */
  pushFromPlayer(r: Route, tab?: Tab): void;

  episodeSheet: string | null;
  addSheet: boolean;
  playlistPicker: PlaylistItem | null;
  nowPlayingOpen: boolean;
  /** When a menu last closed: a tap that lands on the player right after is the same tap, not a new one. */
  lastSheetClose: number;
  toast: string | null;
  toastTone: 'success' | 'error';
  openEpisode(id: string | null): void;
  openAdd(open: boolean): void;
  pickPlaylist(item: PlaylistItem | null): void;
  openNowPlaying(open: boolean): void;
  /** Floating confirmation, always in success green. Pass 'error' only for problems. */
  say(msg: string, tone?: 'success' | 'error'): void;
}

let toastTimer: ReturnType<typeof setTimeout> | undefined;

export const useNav = create<Nav>()((set, get) => ({
  tab: 'today',
  stacks: { playlists: [], topics: [], settings: [], today: [] },
  setTab(t) {
    // tapping the current tab again returns to its root
    if (t === get().tab) set((s) => ({ stacks: { ...s.stacks, [t]: [] } }));
    else set({ tab: t });
  },
  push(r) {
    history.pushState({ podshelf: true }, '');
    set((s) => ({ stacks: { ...s.stacks, [s.tab]: [...s.stacks[s.tab], r] } }));
  },
  pop() {
    const s = get();
    const top = s.stacks[s.tab][s.stacks[s.tab].length - 1];
    set({ stacks: { ...s.stacks, [s.tab]: s.stacks[s.tab].slice(0, -1) } });
    if (top?.fromPlayer) {
      history.pushState({ podshelf: true }, '');
      set({ nowPlayingOpen: true });
    }
  },
  pushFromPlayer(r, tab) {
    // the player's back step becomes this screen's back step
    history.replaceState({ podshelf: true }, '');
    set((s) => {
      const t = tab || s.tab;
      return { nowPlayingOpen: false, episodeSheet: null, tab: t, stacks: { ...s.stacks, [t]: [...s.stacks[t], { ...r, fromPlayer: true }] } };
    });
  },

  episodeSheet: null,
  addSheet: false,
  playlistPicker: null,
  nowPlayingOpen: false,
  toast: null,
  toastTone: 'success',
  lastSheetClose: 0,
  openEpisode: (id) => set(id ? { episodeSheet: id } : { episodeSheet: null, lastSheetClose: Date.now() }),
  openAdd: (open) => set({ addSheet: open }),
  pickPlaylist: (item) => set({ playlistPicker: item }),
  openNowPlaying: (open) => set({ nowPlayingOpen: open }),
  say(msg, tone = 'success') {
    clearTimeout(toastTimer);
    set({ toast: msg, toastTone: tone });
    toastTimer = setTimeout(() => set({ toast: null }), 2600);
  },
}));

// Android back button / swipe-back closes overlays first, then pops the stack.
window.addEventListener('popstate', () => {
  const n = useNav.getState();
  // Close the topmost thing first. Menus opened from the player sit above it, so they go before the
  // player does; the player's own back step is then put back so it stays open.
  const menu = n.episodeSheet || n.playlistPicker || n.addSheet;
  if (menu) {
    if (n.episodeSheet) n.openEpisode(null);
    if (n.playlistPicker) n.pickPlaylist(null);
    if (n.addSheet) n.openAdd(false);
    if (n.nowPlayingOpen) history.pushState({ podshelf: true }, '');
    return;
  }
  if (n.nowPlayingOpen) return n.openNowPlaying(false);
  if (n.stacks[n.tab].length) n.pop();
});

export function goBack() {
  if (useNav.getState().stacks[useNav.getState().tab].length) history.back();
}
