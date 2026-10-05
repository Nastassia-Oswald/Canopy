import { useState } from 'react';
import { Artwork, Button, Icon, IconButton, MenuItem, ProgressBar, Sheet } from '../ui';
import { episodeIndex, getSeries, useStore } from '../core/store';
import { player, usePlayer, type Sleep } from '../core/player';
import { formatClock, formatDate, formatDuration } from '../core/util';
import { useNav } from '../nav';
import { cancel, download, formatBytes, removeDownload, useDownloads } from '../core/downloads';

const RATES = [0.8, 1, 1.1, 1.25, 1.5, 1.75, 2];

function sleepLabel(sleep: Sleep, left: number): string {
  if (sleep.mode === 'end') return 'End of episode';
  if (sleep.mode === 'beforeEnd') return left > 0 ? `Stops in ${Math.ceil(left / 60)} min` : '3 min before end';
  if (sleep.mode === 'time') {
    const m = Math.ceil(left / 60);
    return m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}` : `${m} min`;
  }
  return 'Sleep';
}

const BOOST_LABELS = ['Boost', 'Boost', 'Max'];

export function BoostButton() {
  const level = useStore((s) => s.settings.boost);
  const blocked = usePlayer((s) => s.boostBlocked);
  const [open, setOpen] = useState(false);
  const pick = (l: 0 | 1 | 2) => { player.setBoost(l); setOpen(false); };
  const on = level > 0 && !blocked;
  return (
    <>
      <button type="button" className={`sleepbtn${on ? ' sleepbtn-on' : ''}`} onClick={() => setOpen(true)} aria-label={`Volume boost: ${level ? BOOST_LABELS[level] : 'off'}`}>
        <Icon name="volume" size={18} />
        <span>{BOOST_LABELS[level]}</span>
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Volume boost">
        <div className="menu">
          <MenuItem icon={level === 0 ? 'check' : 'volume'} onClick={() => pick(0)}>Off</MenuItem>
          <MenuItem icon={level === 1 ? 'check' : 'volume'} onClick={() => pick(1)}>Boost: about twice as loud</MenuItem>
          <MenuItem icon={level === 2 ? 'check' : 'volume'} onClick={() => pick(2)}>Max: for very quiet shows</MenuItem>
        </div>
        {blocked && level > 0 && <p className="error">This show’s host doesn’t allow boost, so it’s playing at normal volume. Boost still works on other shows.</p>}
        <p className="muted small">Boost lifts quiet voices and holds back sudden loud bits, then turns everything up past your phone’s normal maximum. Your choice stays on for every episode until you change it.</p>
      </Sheet>
    </>
  );
}

export function SleepButton() {
  const { sleep, sleepLeft } = usePlayer();
  const [open, setOpen] = useState(false);
  const pick = (o: 'off' | 'end' | 'beforeEnd' | number) => { player.setSleep(o); setOpen(false); };
  const on = sleep.mode !== 'off';
  return (
    <>
      <button type="button" className={`sleepbtn${on ? ' sleepbtn-on' : ''}`} onClick={() => setOpen(true)} aria-label={on ? `Sleep timer: ${sleepLabel(sleep, sleepLeft)}` : 'Sleep timer'}>
        <Icon name="moon" size={18} />
        <span>{sleepLabel(sleep, sleepLeft)}</span>
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Sleep timer">
        <div className="menu">
          <MenuItem icon={sleep.mode === 'beforeEnd' ? 'check' : 'moon'} onClick={() => pick('beforeEnd')}>3 minutes before the end</MenuItem>
          <MenuItem icon={sleep.mode === 'end' ? 'check' : 'moon'} onClick={() => pick('end')}>End of this episode</MenuItem>
          <MenuItem icon={sleep.mode === 'time' && sleep.minutes === 60 ? 'check' : 'moon'} onClick={() => pick(60)}>In 1 hour</MenuItem>
          <MenuItem icon={sleep.mode === 'time' && sleep.minutes === 120 ? 'check' : 'moon'} onClick={() => pick(120)}>In 2 hours</MenuItem>
          {on && <MenuItem icon="close" onClick={() => pick('off')}>Turn off timer</MenuItem>}
        </div>
        <p className="muted small">“3 minutes before the end” stops ahead of loud outro music and ads, so they don’t wake you. It still counts as finished. Timed stops step back 30 seconds so you can pick up where you drifted off. Every option fades out gently.</p>
      </Sheet>
    </>
  );
}

export function MiniPlayer() {
  const state = useStore();
  const ep = state.nowPlaying ? episodeIndex(state.episodes).get(state.nowPlaying) : undefined;
  const { playing, buffering, position, duration, sleep, sleepLeft } = usePlayer();
  const open = useNav((s) => s.openNowPlaying);
  if (!ep) return null;
  const podcast = state.podcasts.find((p) => p.id === ep.podcastId);
  const dur = duration || ep.duration;
  return (
    <div className="mini">
      <button type="button" className="mini-open" onClick={() => { history.pushState({ podshelf: true }, ''); open(true); }} aria-label="Open player">
        <Artwork src={ep.image || podcast?.image} alt={podcast?.title || ep.title} size={46} />
        <div className="mini-text">
          <div className="mini-title">{ep.title}</div>
          <div className="mini-sub">
            {sleep.mode !== 'off' && <span className="mini-sleep"><Icon name="moon" size={12} /> {sleepLabel(sleep, sleepLeft)} · </span>}
            {buffering ? 'Loading…' : podcast?.title}
          </div>
        </div>
      </button>
      <IconButton icon={playing ? 'pause' : 'play'} label={playing ? 'Pause' : 'Play'} size="l" onClick={() => player.toggle()} />
      <ProgressBar value={dur ? position / dur : 0} />
    </div>
  );
}

export function NowPlaying() {
  const state = useStore();
  const { nowPlayingOpen, pushFromPlayer, openEpisode, lastSheetClose } = useNav();
  const { playing, buffering, position, duration, error } = usePlayer();
  const ep = state.nowPlaying ? episodeIndex(state.episodes).get(state.nowPlaying) : undefined;
  if (!ep) return null;
  const podcast = state.podcasts.find((p) => p.id === ep.podcastId);
  const series = getSeries(state, ep.podcastId).find((s) => s.episodeIds.includes(ep.id));
  const dur = duration || ep.duration;
  const rate = state.settings.playbackRate;
  const close = () => { if (Date.now() - lastSheetClose > 500) history.back(); };

  return (
    <Sheet open={nowPlayingOpen} onClose={close} tall>
      <div className="np">
        <div className="np-close">
          <IconButton icon="down" label="Collapse player" onClick={close} />
        </div>
        <Artwork src={ep.image || podcast?.image} alt={podcast?.title || ep.title} size="100%" />
        <div className="np-text">
          {series ? (
            <button type="button" className="eyebrow linkish" onClick={() => pushFromPlayer({ name: 'series', podcastId: ep.podcastId, key: series.key }, 'topics')}>
              {series.name} · part {series.episodeIds.indexOf(ep.id) + 1} of {series.episodeIds.length}
            </button>
          ) : (
            <p className="eyebrow">{podcast?.title}</p>
          )}
          <h2 className={`ep-title${ep.title.length > 60 ? ' np-long' : ''}`}>{ep.title}</h2>
          <p className="muted small">{podcast?.title} · {formatDate(ep.pubDate)}{buffering ? ' · Loading…' : ''}</p>
        </div>
        {error && <p className="error" role="alert">{error}</p>}
        <div className="scrub">
          <input
            id="np-scrub"
            type="range"
            min={0}
            max={Math.max(1, Math.floor(dur))}
            step={1}
            value={Math.floor(position)}
            onChange={(e) => player.seek(Number(e.target.value))}
            aria-label="Position"
            style={{ ['--pct' as string]: `${dur ? (position / dur) * 100 : 0}%` }}
          />
          <div className="scrub-times">
            <span>{formatClock(position)}</span>
            <span>-{formatClock(Math.max(0, dur - position))}</span>
          </div>
        </div>
        <div className="np-controls">
          <IconButton icon="back15" label={`Back ${state.settings.skipBack} seconds`} size="xl" badge={String(state.settings.skipBack)} onClick={() => player.skip(-state.settings.skipBack)} />
          <IconButton icon={playing ? 'pause' : 'play'} label={playing ? 'Pause' : 'Play'} size="xl" variant="filled" onClick={() => player.toggle()} />
          <IconButton icon="fwd30" label={`Forward ${state.settings.skipForward} seconds`} size="xl" badge={String(state.settings.skipForward)} onClick={() => player.skip(state.settings.skipForward)} />
        </div>
        <div className="np-foot">
          <Button small onClick={() => player.setRate(RATES[(RATES.indexOf(rate) + 1) % RATES.length] ?? 1)}>{rate}×</Button>
          <SleepButton />
          <BoostButton />
          <span className="np-foot-icons">
            <IconButton icon="queue" label={state.queue.length ? `Up Next (${state.queue.length})` : 'Up Next'} onClick={() => pushFromPlayer({ name: 'queue' })} />
            <IconButton icon="more" label="Episode options" onClick={() => openEpisode(ep.id)} />
          </span>
        </div>
        {ep.description && <div className="notes">{ep.description}</div>}
      </div>
    </Sheet>
  );
}

export function EpisodeSheet() {
  const state = useStore();
  const { episodeSheet: id, openEpisode, pickPlaylist, say, push, setTab, nowPlayingOpen, pushFromPlayer } = useNav();
  const dl = useDownloads();
  const ep = id ? episodeIndex(state.episodes).get(id) : undefined;
  if (!ep) return null;
  const podcast = state.podcasts.find((p) => p.id === ep.podcastId);
  const series = getSeries(state, ep.podcastId).find((s) => s.episodeIds.includes(ep.id));
  const played = state.progress[ep.id]?.played;
  const later = state.playlists.find((p) => p.builtin === 'later');
  const close = () => openEpisode(null);
  return (
    <Sheet open onClose={close} title={ep.title} titleClass="ep-title">
      <p className="muted small">
        {podcast?.title} · {formatDate(ep.pubDate)}
        {ep.duration ? ` · ${formatDuration(ep.duration)}` : ''}
      </p>
      <div className="menu">
        <MenuItem icon="play" onClick={() => { close(); series ? player.playList(series.episodeIds, ep.id) : player.play(ep.id); }}>
          {series ? 'Play, then the rest of the series' : 'Play'}
        </MenuItem>
        {state.nowPlaying === ep.id ? (
          <MenuItem icon="next" onClick={() => { close(); player.next(); }}>
            {state.queue.length ? 'Skip to the next episode' : 'Finish this episode'}
          </MenuItem>
        ) : (
          <MenuItem icon="next" onClick={() => { state.enqueue([ep.id], true); close(); say('Plays next'); }}>Play next</MenuItem>
        )}
        <MenuItem icon="queue" onClick={() => { state.enqueue([ep.id]); close(); say('Added to Up Next'); }}>Add to Up Next</MenuItem>
        {later && !later.items.some((it) => it.kind === 'episode' && it.episodeId === ep.id) && (
          <MenuItem icon="plus" onClick={() => { state.addToPlaylist(later.id, { kind: 'episode', episodeId: ep.id }); close(); say(`Added to ${later.name}`); }}>Save to {later.name}</MenuItem>
        )}
        <MenuItem icon="playlist" onClick={() => { close(); pickPlaylist({ kind: 'episode', episodeId: ep.id }); }}>Add to playlist</MenuItem>
        {dl.saved[ep.id] ? (
          <MenuItem icon="trash" onClick={() => { void removeDownload([ep.id]); close(); say('Removed from this phone'); }}>Remove offline copy · {formatBytes(dl.saved[ep.id].bytes)}</MenuItem>
        ) : dl.progress[ep.id] !== undefined || dl.waiting.includes(ep.id) ? (
          <MenuItem icon="close" onClick={() => cancel(ep.id)}>
            {dl.progress[ep.id] !== undefined && dl.progress[ep.id] >= 0 ? `Saving ${Math.round(dl.progress[ep.id] * 100)}% · tap to stop` : 'Waiting to save · tap to stop'}
          </MenuItem>
        ) : (
          <MenuItem icon="download" onClick={() => { download([ep.id]); say('Saving for offline'); }}>Save for offline</MenuItem>
        )}
        {dl.failed[ep.id] && <p className="error" style={{ margin: 4 }}>{dl.failed[ep.id]}</p>}
        {series && (
          <MenuItem icon="series" onClick={() => {
            const r = { name: 'series' as const, podcastId: ep.podcastId, key: series.key };
            if (nowPlayingOpen) { pushFromPlayer(r, 'topics'); return; }
            close(); setTab('topics'); push(r);
          }}>
            Go to series: {series.name}
          </MenuItem>
        )}
        <MenuItem icon="check" onClick={() => { state.togglePlayed(ep.id); close(); }}>{played ? 'Mark as not listened' : 'Mark as listened'}</MenuItem>
      </div>
      {ep.description && <div className="notes">{ep.description}</div>}
    </Sheet>
  );
}
