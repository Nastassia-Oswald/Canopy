// Playback for the whole app: audio, queue, sleep timer, volume boost and lock-screen controls.
import { create } from 'zustand';
import { episodeIndex, useStore } from './store';
import { isSaved, removeDownload, savedAudioUrl } from './downloads';

export type Sleep =
  | { mode: 'off' }
  | { mode: 'end' }
  /** stop this many seconds before the episode ends (skips loud outros and ads) */
  | { mode: 'beforeEnd'; seconds: number }
  | { mode: 'time'; endsAt: number; minutes: number };

/** Listened past this share of an episode = finished. */
export const FINISHED_AT = 0.85;

interface PlayerState {
  playing: boolean;
  buffering: boolean;
  position: number;
  duration: number;
  error: string | null;
  sleep: Sleep;
  /** seconds left on a timed sleep timer, updated every second */
  sleepLeft: number;
  /** the current episode's host doesn't allow volume boost */
  boostBlocked: boolean;
}

export const usePlayer = create<PlayerState>()(() => ({
  playing: false,
  buffering: false,
  position: 0,
  duration: 0,
  error: null,
  sleep: { mode: 'off' },
  sleepLeft: 0,
  boostBlocked: false,
}));

const FADE_SECONDS = 20;

// Two audio elements: a plain one, and one routed through the boost chain. Boost needs the
// podcast host to allow it (CORS); most big hosts do. When one doesn't, that episode quietly
// falls back to the plain element, so it always plays.
function makeAudio(boostable: boolean) {
  const el = new Audio();
  el.preload = 'metadata';
  if (boostable) el.crossOrigin = 'anonymous';
  return el;
}
const plainEl = makeAudio(false);
const boostEl = makeAudio(true);
/** the element currently playing */
let audio: HTMLAudioElement = plainEl;

// ---------- volume boost ----------
// A phone's volume stops at 100%, and many podcasts are mastered quietly. Boost runs the audio
// through a compressor (lifts quiet voices, holds back sudden loud bits) and then extra gain.
const BOOST_GAIN = [1, 2, 3.2];
let ctx: AudioContext | null = null;
let gainNode: GainNode | null = null;
let compressor: DynamicsCompressorNode | null = null;
let boostBlocked = false; // this episode's host doesn't allow boost
let autoplayIntent = false;

// ---------- interruptions (earbuds out, alarms, calls) ----------
// Pauses Tapedeck makes itself are flagged, so any other pause is known to come from the phone.
let selfPause = false;
/** when the phone last paused playback on its own, while it was playing */
let systemPausedAt = 0;
/** an alarm or call took over the sound (seen on the watcher below) */
let interrupted = false;
const RESUME_WINDOW = 15 * 60 * 1000;

function pauseHere() {
  if (!audio.paused) selfPause = true;
  audio.pause();
}

/** Bring the sound back on after the phone switched it off (boost runs through this). */
function wake() {
  if (ctx && ctx.state !== 'running') void ctx.resume().catch(() => undefined);
  if (watcher && watcher.state !== 'running') void watcher.resume().catch(() => undefined);
}

// A silent sound context that only watches: iPhones switch it to 'interrupted' while an alarm or
// call has the sound, and back when it's over. That's the moment to carry on playing.
let watcher: AudioContext | null = null;
function watchInterruptions() {
  if (watcher || typeof AudioContext === 'undefined') return;
  watcher = new AudioContext();
  watcher.addEventListener('statechange', () => {
    const st = watcher!.state as string;
    if (st === 'interrupted') interrupted = true;
    else if (st === 'running' && interrupted) {
      interrupted = false;
      resumeAfterInterruption();
    }
  });
}

function resumeAfterInterruption() {
  if (!loadedId || !audio.paused || !systemPausedAt) return;
  if (Date.now() - systemPausedAt > RESUME_WINDOW) return;
  systemPausedAt = 0;
  wake();
  void audio.play().catch(() => undefined);
}

/** Play from the phone's controls, the lock screen or earbuds (never toggles). */
function resumePlayback() {
  watchInterruptions();
  systemPausedAt = 0;
  wake();
  autoplayIntent = true;
  if (!loadedId) {
    const id = useStore.getState().nowPlaying;
    if (id) load(id, true);
    return;
  }
  if (audio.paused) void audio.play().catch(() => undefined);
}

function wantBoost() {
  return useStore.getState().settings.boost > 0 && !boostBlocked && typeof AudioContext !== 'undefined';
}

function ensureGraph() {
  if (ctx || typeof AudioContext === 'undefined') return;
  ctx = new AudioContext();
  const src = ctx.createMediaElementSource(boostEl);
  compressor = ctx.createDynamicsCompressor();
  gainNode = ctx.createGain();
  src.connect(compressor).connect(gainNode).connect(ctx.destination);
}

function applyBoost() {
  const level = useStore.getState().settings.boost;
  if (!ctx || !gainNode || !compressor) return;
  gainNode.gain.value = BOOST_GAIN[level] ?? 1;
  compressor.threshold.value = -26;
  compressor.knee.value = 12;
  compressor.ratio.value = 4;
  compressor.attack.value = 0.005;
  compressor.release.value = 0.25;
  if (ctx.state === 'suspended') void ctx.resume();
}

/** Move playback to the other element, keeping the place. */
function switchTo(el: HTMLAudioElement, play: boolean) {
  if (el === audio) return;
  const at = audio.currentTime;
  const src = audio.currentSrc || audio.src;
  const rate = audio.playbackRate;
  pauseHere();
  audio.removeAttribute('src');
  audio.load();
  audio = el;
  if (el === boostEl) { ensureGraph(); applyBoost(); }
  if (!src) return;
  audio.src = src;
  audio.playbackRate = rate;
  const once = () => { audio.currentTime = at; audio.removeEventListener('loadedmetadata', once); };
  audio.addEventListener('loadedmetadata', once);
  if (play) void audio.play().catch(() => undefined);
}

let loadedId: string | null = null;
let lastSaved = 0;

function current() {
  const s = useStore.getState();
  return s.nowPlaying ? episodeIndex(s.episodes).get(s.nowPlaying) : undefined;
}

function podcastFor(podcastId: string) {
  return useStore.getState().podcasts.find((p) => p.id === podcastId);
}

function saveProgress(force = false) {
  const id = loadedId;
  if (!id || !Number.isFinite(audio.currentTime)) return;
  const now = Date.now();
  if (!force && now - lastSaved < 5000) return;
  lastSaved = now;
  const dur = Number.isFinite(audio.duration) ? audio.duration : 0;
  const nearEnd = dur > 0 && dur - audio.currentTime < 30;
  const finished = dur > 0 && audio.currentTime / dur >= FINISHED_AT;
  useStore.getState().setProgress(id, {
    // past 85% counts as finished, but keeps its place so you can still hear the rest
    position: nearEnd ? 0 : audio.currentTime,
    duration: dur,
    ...(finished ? { played: true } : {}),
  });
}

function updateMediaSession() {
  const ep = current();
  if (!ep || !('mediaSession' in navigator)) return;
  const p = podcastFor(ep.podcastId);
  const art = ep.image || p?.image;
  navigator.mediaSession.metadata = new MediaMetadata({
    title: ep.title,
    artist: p?.title || '',
    album: p?.author || '',
    artwork: art ? [{ src: art, sizes: '512x512' }] : [],
  });
}


/** Finished episodes you saved for offline are cleared once you move on, if that setting is on. */
function tidyFinished(id: string | null) {
  if (!id || !useStore.getState().settings.deleteFinishedDownloads) return;
  if (useStore.getState().progress[id]?.played && isSaved(id)) void removeDownload([id]);
}

function load(id: string, autoplay: boolean) {
  const s = useStore.getState();
  const ep = episodeIndex(s.episodes).get(id);
  if (!ep) return;
  if (loadedId && loadedId !== id) { saveProgress(true); tidyFinished(loadedId); }
  loadedId = id;
  // the copy saved on the phone when there is one
  start(id, savedAudioUrl(id) || ep.audioUrl, autoplay);
}

function start(id: string, src: string, autoplay: boolean) {
  const s = useStore.getState();
  const ep = episodeIndex(s.episodes).get(id);
  if (!ep) return;
  boostBlocked = false;
  autoplayIntent = autoplay;
  const el = wantBoost() ? boostEl : plainEl;
  if (el !== audio) { pauseHere(); audio.removeAttribute('src'); audio.load(); audio = el; }
  if (el === boostEl) { ensureGraph(); applyBoost(); }
  audio.src = src;
  audio.playbackRate = s.settings.playbackRate;
  const resumeAt = s.progress[id]?.position || 0;
  usePlayer.setState({ position: resumeAt, duration: ep.duration || 0, error: null });
  const seekOnce = () => {
    if (resumeAt > 0) audio.currentTime = resumeAt;
    audio.removeEventListener('loadedmetadata', seekOnce);
  };
  audio.addEventListener('loadedmetadata', seekOnce);
  updateMediaSession();
  if (autoplay) void audio.play().catch(() => usePlayer.setState({ playing: false }));
}

export const player = {
  /** Play an episode. If `thenQueue` is given, it replaces the Up Next queue. */
  play(id: string, thenQueue?: string[]) {
    watchInterruptions();
    const s = useStore.getState();
    if (thenQueue) s.setQueue(thenQueue.filter((q) => q !== id));
    else s.setQueue(s.queue.filter((q) => q !== id));
    s.setNowPlaying(id);
    const pr = s.progress[id];
    // A finished episode starts again from the top, unless you stopped partway through its last 15%.
    if (pr?.played && (pr.position < 5 || (pr.duration && pr.duration - pr.position < 30))) s.setProgress(id, { played: false, position: 0 });
    load(id, true);
  },
  /** Play a list in order, starting from the first unplayed episode (or `startId`). */
  playList(ids: string[], startId?: string) {
    if (!ids.length) return;
    const prog = useStore.getState().progress;
    let start = startId ? ids.indexOf(startId) : ids.findIndex((i) => !prog[i]?.played);
    if (start < 0) start = 0;
    player.play(ids[start], ids.slice(start + 1));
  },
  toggle() {
    watchInterruptions();
    if (audio.paused || !loadedId) resumePlayback();
    else { systemPausedAt = 0; pauseHere(); }
  },
  pause() {
    systemPausedAt = 0;
    pauseHere();
  },
  seek(sec: number) {
    if (!loadedId) return;
    audio.currentTime = Math.max(0, Math.min(sec, Number.isFinite(audio.duration) ? audio.duration : sec));
    usePlayer.setState({ position: audio.currentTime });
  },
  skip(delta: number) {
    player.seek(audio.currentTime + delta);
  },
  /** 0 off, 1 boost, 2 max */
  setBoost(level: 0 | 1 | 2) {
    useStore.getState().updateSettings({ boost: level });
    if (loadedId) switchTo(level > 0 && !boostBlocked ? boostEl : plainEl, !audio.paused);
    applyBoost();
    usePlayer.setState({ boostBlocked });
  },
  setRate(rate: number) {
    audio.playbackRate = rate;
    useStore.getState().updateSettings({ playbackRate: rate });
  },
  /** 'off', 'end' (end of this episode), 'beforeEnd' (3 minutes before the end) or a number of minutes */
  setSleep(option: 'off' | 'end' | 'beforeEnd' | number) {
    plainEl.volume = boostEl.volume = 1;
    if (option === 'off') usePlayer.setState({ sleep: { mode: 'off' }, sleepLeft: 0 });
    else if (option === 'end') usePlayer.setState({ sleep: { mode: 'end' }, sleepLeft: 0 });
    else if (option === 'beforeEnd') usePlayer.setState({ sleep: { mode: 'beforeEnd', seconds: 180 }, sleepLeft: 0 });
    else usePlayer.setState({ sleep: { mode: 'time', endsAt: Date.now() + option * 60000, minutes: option }, sleepLeft: option * 60 });
  },
  next() {
    const s = useStore.getState();
    if (loadedId) s.setProgress(loadedId, { played: true, position: 0 });
    const [nextId, ...rest] = s.queue;
    if (!nextId) {
      pauseHere();
      return;
    }
    s.setQueue(rest);
    s.setNowPlaying(nextId);
    load(nextId, true);
  },
};

/** Listen on both elements, but only react to the one that's playing. */
function on(type: string, fn: () => void) {
  for (const el of [plainEl, boostEl]) el.addEventListener(type, () => { if (el === audio) fn(); });
}

on('play', () => {
  wake();
  usePlayer.setState({ playing: true });
  if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
});
on('pause', () => {
  // a pause Tapedeck didn't ask for (earbuds out, an alarm, a call): remember it, to carry on after
  if (selfPause) selfPause = false;
  else if (!audio.ended) systemPausedAt = Date.now();
  usePlayer.setState({ playing: false });
  if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
  saveProgress(true);
});
on('waiting', () => usePlayer.setState({ buffering: true }));
on('playing', () => usePlayer.setState({ buffering: false }));
on('timeupdate', () => {
  usePlayer.setState({ position: audio.currentTime });
  saveProgress();
  const { sleep } = usePlayer.getState();
  if (sleep.mode === 'beforeEnd' && Number.isFinite(audio.duration) && audio.duration > sleep.seconds) {
    const left = audio.duration - sleep.seconds - audio.currentTime;
    usePlayer.setState({ sleepLeft: Math.max(0, Math.round(left)) });
    if (left <= FADE_SECONDS) audio.volume = Math.max(0, left / FADE_SECONDS);
    if (left <= 0) {
      pauseHere();
      audio.volume = 1;
      usePlayer.setState({ sleep: { mode: 'off' }, sleepLeft: 0 });
      saveProgress(true);
      if (loadedId) useStore.getState().setProgress(loadedId, { played: true });
    }
  }
});
on('durationchange', () => {
  if (Number.isFinite(audio.duration)) usePlayer.setState({ duration: audio.duration });
});
on('ended', () => {
  if (usePlayer.getState().sleep.mode === 'end') {
    // Sleep timer: stop after this episode instead of moving on.
    if (loadedId) useStore.getState().setProgress(loadedId, { played: true, position: 0 });
    usePlayer.setState({ sleep: { mode: 'off' }, sleepLeft: 0, playing: false });
    return;
  }
  if (!useStore.getState().settings.autoplayNext) {
    if (loadedId) useStore.getState().setProgress(loadedId, { played: true, position: 0 });
    usePlayer.setState({ playing: false });
    return;
  }
  player.next();
});

// Timed sleep: counts down in real time, fades out over the last 20 seconds, then pauses.
setInterval(() => {
  const { sleep } = usePlayer.getState();
  if (sleep.mode !== 'time') return;
  const left = Math.max(0, Math.round((sleep.endsAt - Date.now()) / 1000));
  usePlayer.setState({ sleepLeft: left });
  if (left <= FADE_SECONDS) audio.volume = Math.max(0, left / FADE_SECONDS);
  if (left === 0) {
    pauseHere();
    audio.volume = 1;
    player.skip(-30); // rewind a little so you pick up where you drifted off
    usePlayer.setState({ sleep: { mode: 'off' }, sleepLeft: 0 });
  }
}, 1000);
on('error', () => {
  // The host refused a boostable load: play this episode without boost instead.
  if (audio === boostEl && loadedId && !boostBlocked) {
    boostBlocked = true;
    usePlayer.setState({ boostBlocked: true });
    const ep = current();
    if (ep) {
      audio.removeAttribute('src');
      audio.load();
      audio = plainEl;
      const at = usePlayer.getState().position;
      audio.src = savedAudioUrl(ep.id) || ep.audioUrl;
      audio.playbackRate = useStore.getState().settings.playbackRate;
      const once = () => { audio.currentTime = at; audio.removeEventListener('loadedmetadata', once); };
      audio.addEventListener('loadedmetadata', once);
      if (autoplayIntent) void audio.play().catch(() => undefined);
      return;
    }
  }
  usePlayer.setState({
    playing: false,
    buffering: false,
    error: !navigator.onLine
      ? "You're offline, and this episode isn't saved on your phone. Save episodes for offline from their ⋯ menu."
      : "This episode's audio couldn't be loaded. Try again, or refresh the podcast.",
  });
});
window.addEventListener('pagehide', () => saveProgress(true));
// back in the app after an alarm: if the sound was taken away and never handed back, carry on
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  if (interrupted || (watcher && (watcher.state as string) === 'interrupted')) { interrupted = false; wake(); resumeAfterInterruption(); }
});
document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && saveProgress(true));

if ('mediaSession' in navigator) {
  const ms = navigator.mediaSession;
  const s = () => useStore.getState().settings;
  // separate play and pause: putting earbuds back in sends 'play', which must never pause
  ms.setActionHandler('play', () => resumePlayback());
  ms.setActionHandler('pause', () => player.pause());
  ms.setActionHandler('seekbackward', () => player.skip(-s().skipBack));
  ms.setActionHandler('seekforward', () => player.skip(s().skipForward));
  ms.setActionHandler('nexttrack', () => player.next());
  try {
    ms.setActionHandler('seekto', (d) => d.seekTime != null && player.seek(d.seekTime));
  } catch {
    /* older iOS */
  }
}

/** After the saved library loads, show the last episode in the mini player (paused). */
export function restorePlayer() {
  const ep = current();
  if (!ep) return;
  const pos = useStore.getState().progress[ep.id]?.position || 0;
  usePlayer.setState({ position: pos, duration: ep.duration || 0 });
}
