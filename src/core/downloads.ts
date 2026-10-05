// Offline listening: episode audio saved on the phone (IndexedDB), played from there when present.
import { create } from 'zustand';
import { get as idbGet, set as idbSet, del as idbDel } from 'idb-keyval';
import { episodeIndex, useStore } from './store';
import { soundcloudDownloadUrl } from './soundcloud';

export interface SavedAudio {
  bytes: number;
  savedAt: number;
}

interface DownloadState {
  /** Episodes saved on this phone. */
  saved: Record<string, SavedAudio>;
  /** In progress: 0..1, or -1 when the size isn't known yet. */
  progress: Record<string, number>;
  /** Waiting their turn, in order. */
  waiting: string[];
  failed: Record<string, string>;
}

export const useDownloads = create<DownloadState>()(() => ({ saved: {}, progress: {}, waiting: [], failed: {} }));

const META_KEY = 'downloads';
const audioKey = (id: string) => 'audio:' + id;

// Ready-to-play addresses for saved files. Files read back from storage stay on disk (not in
// memory), and having the address ready means playback starts straight from the tap, which iPhones need.
const urls = new Map<string, string>();

async function prepare(id: string): Promise<boolean> {
  if (urls.has(id)) return true;
  const blob = await idbGet<Blob>(audioKey(id));
  if (!blob) return false;
  urls.set(id, URL.createObjectURL(blob));
  return true;
}

export async function loadDownloads() {
  const saved = (await idbGet<Record<string, SavedAudio>>(META_KEY)) || {};
  const ok: Record<string, SavedAudio> = {};
  await Promise.all(Object.entries(saved).map(async ([id, meta]) => { if (await prepare(id)) ok[id] = meta; }));
  useDownloads.setState({ saved: ok });
  if (Object.keys(ok).length !== Object.keys(saved).length) persist();
}
function persist() {
  void idbSet(META_KEY, useDownloads.getState().saved);
}

export function isSaved(id: string) {
  return !!useDownloads.getState().saved[id];
}

/** The playable address of a saved episode, or null. */
export function savedAudioUrl(id: string): string | null {
  return (isSaved(id) && urls.get(id)) || null;
}

let active: { id: string; abort: AbortController } | null = null;

/** Save episodes for offline listening, one at a time. */
export function download(ids: string[]) {
  const s = useDownloads.getState();
  const add = ids.filter((id) => !s.saved[id] && !s.waiting.includes(id) && active?.id !== id);
  if (!add.length) return;
  const failed = { ...s.failed };
  add.forEach((id) => delete failed[id]);
  useDownloads.setState({ waiting: [...s.waiting, ...add], failed });
  // ask the phone to keep these files rather than clear them when space runs low
  void navigator.storage?.persist?.().catch(() => undefined);
  void pump();
}

/** Stop a download in progress, or take it out of the waiting list. */
export function cancel(id: string) {
  if (active?.id === id) active.abort.abort();
  const s = useDownloads.getState();
  const { [id]: _p, ...progress } = s.progress;
  useDownloads.setState({ waiting: s.waiting.filter((w) => w !== id), progress });
}

export async function removeDownload(ids: string[]) {
  const saved = { ...useDownloads.getState().saved };
  for (const id of ids) {
    cancel(id);
    delete saved[id];
    const u = urls.get(id);
    urls.delete(id);
    // let the player finish with it first
    if (u) setTimeout(() => URL.revokeObjectURL(u), 60_000);
    await idbDel(audioKey(id));
  }
  useDownloads.setState({ saved });
  persist();
}

async function pump() {
  if (active) return;
  const next = useDownloads.getState().waiting[0];
  if (!next) return;
  useDownloads.setState((s) => ({ waiting: s.waiting.slice(1), progress: { ...s.progress, [next]: -1 } }));
  const abort = new AbortController();
  active = { id: next, abort };
  try {
    await fetchAndSave(next, abort.signal);
  } catch (e) {
    if (!abort.signal.aborted) useDownloads.setState((s) => ({ failed: { ...s.failed, [next]: (e as Error).message || 'Download failed' } }));
  } finally {
    active = null;
    useDownloads.setState((s) => {
      const { [next]: _p, ...progress } = s.progress;
      return { progress };
    });
    void pump();
  }
}

async function open(url: string, signal: AbortSignal): Promise<Response> {
  // older SoundCloud episodes: the app's proxy hands over the whole file
  const sc = soundcloudDownloadUrl(url);
  if (sc) {
    const r = await fetch(sc, { signal });
    if (!r.ok || !r.body) throw new Error(navigator.onLine ? 'SoundCloud refused the download.' : 'You’re offline.');
    return r;
  }
  // Straight from the podcast host when it allows it; otherwise through the app's own proxy.
  try {
    const r = await fetch(url, { mode: 'cors', signal });
    if (r.ok && r.body) return r;
  } catch (e) {
    if (signal.aborted) throw e;
  }
  const proxy = useStore.getState().settings.proxyUrl || '/api/proxy';
  const r = await fetch(`${proxy}?audio=${encodeURIComponent(url)}`, { signal });
  if (!r.ok || !r.body) throw new Error(navigator.onLine ? 'The podcast host refused the download.' : 'You’re offline.');
  return r;
}

async function fetchAndSave(id: string, signal: AbortSignal) {
  const ep = episodeIndex(useStore.getState().episodes).get(id);
  if (!ep) throw new Error('Episode not found');
  const res = await open(ep.audioUrl, signal);
  const total = Number(res.headers.get('content-length') || 0);
  const reader = res.body!.getReader();
  const chunks: Uint8Array[] = [];
  let got = 0;
  let shown = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    got += value.length;
    const pct = total ? got / total : -1;
    if (pct < 0 || pct - shown >= 0.01) {
      shown = pct;
      useDownloads.setState((s) => ({ progress: { ...s.progress, [id]: pct } }));
    }
  }
  const type = res.headers.get('content-type')?.split(';')[0] || 'audio/mpeg';
  const blob = new Blob(chunks as BlobPart[], { type: /audio|video|octet/.test(type) ? type.replace('octet-stream', 'mpeg').replace('application/', 'audio/') : 'audio/mpeg' });
  await idbSet(audioKey(id), blob);
  chunks.length = 0;
  if (!(await prepare(id))) throw new Error('The phone couldn’t store the file. It may be out of space.');
  useDownloads.setState((s) => ({ saved: { ...s.saved, [id]: { bytes: blob.size, savedAt: Date.now() } } }));
  persist();
}

export function formatBytes(n: number) {
  if (n >= 1e9) return (n / 1e9).toFixed(1) + ' GB';
  if (n >= 1e6) return Math.round(n / 1e6) + ' MB';
  return Math.max(1, Math.round(n / 1e3)) + ' KB';
}
