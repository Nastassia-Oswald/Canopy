import { useState, type ReactNode } from 'react';
import { Artwork, Chip, ChipRow, Icon, IconButton, ListRow, MenuItem, ProgressBar, Sheet } from '../ui';
import type { Episode, EpisodeStatus } from '../core/types';
import { SORT_LABELS, STATUS_LABELS, type EpisodeFilter } from '../core/filters';
import { useStore } from '../core/store';
import { player, usePlayer } from '../core/player';
import { formatDate, formatDuration } from '../core/util';
import { useDownloads } from '../core/downloads';
import { goBack, useNav } from '../nav';

export function TopBar(props: { title: string; big?: boolean; back?: boolean; actions?: ReactNode }) {
  return (
    <header className={`topbar${props.big ? ' topbar-big' : ''}`}>
      {props.back && <IconButton icon="back" label="Back" onClick={goBack} />}
      <h1>{props.title}</h1>
      {props.actions}
    </header>
  );
}

export function DoneMark({ size = 20 }: { size?: number }) {
  return (
    <span className="donemark" style={{ width: size, height: size }} aria-label="Finished" role="img">
      <Icon name="check" size={Math.round(size * 0.7)} />
    </span>
  );
}

/** Offline status in an episode's meta line: saved, saving (with %), or waiting. */
export function DownloadMark({ id }: { id: string }) {
  const saved = useDownloads((s) => !!s.saved[id]);
  const pct = useDownloads((s) => s.progress[id]);
  const waiting = useDownloads((s) => s.waiting.includes(id));
  if (saved) return <span className="dl-mark dl-saved" aria-label="Saved for offline" role="img"><Icon name="download" size={13} /></span>;
  if (pct !== undefined) return <span className="dl-mark">{pct < 0 ? 'Saving…' : `Saving ${Math.round(pct * 100)}%`}</span>;
  if (waiting) return <span className="dl-mark">Waiting to save</span>;
  return null;
}

/**
 * The same two controls at the end of every episode, series and show row:
 * listened (green check, tap to undo; or a quiet ring, tap to mark as listened) and play.
 */
export function RowActions(props: { listened: boolean; onToggle: () => void; playing?: boolean; onPlay: () => void; what?: string; before?: ReactNode }) {
  return (
    <>
      {props.before}
      <button
        type="button"
        className="done-slot"
        aria-label={props.listened ? `Listened. Tap to mark ${props.what || 'it'} as not listened` : `Mark ${props.what || 'it'} as listened`}
        onClick={props.onToggle}
      >
        {props.listened ? <DoneMark size={16} /> : <span className="markring" style={{ width: 16, height: 16 }} aria-hidden="true"><Icon name="check" size={11} /></span>}
      </button>
      <IconButton icon={props.playing ? 'pause' : 'play'} label={props.playing ? 'Pause' : 'Play'} onClick={props.onPlay} />
    </>
  );
}

/** One episode: cover, title, (show), date and length, then listened and play. */
export function EpisodeRow({ ep, showArt, list, onDismiss, dismissLabel }: { ep: Episode; showArt?: boolean; list?: string[]; onDismiss?: () => void; dismissLabel?: string }) {
  const progress = useStore((s) => s.progress[ep.id]);
  const podcast = useStore((s) => s.podcasts.find((p) => p.id === ep.podcastId));
  const nowPlaying = useStore((s) => s.nowPlaying === ep.id);
  const playing = usePlayer((s) => nowPlaying && s.playing);
  const openEpisode = useNav((s) => s.openEpisode);
  const togglePlayed = useStore((s) => s.togglePlayed);
  const say = useNav((s) => s.say);

  const dur = progress?.duration || ep.duration;
  const started = progress && progress.position > 5 && !progress.played;
  const left = started && dur ? Math.max(0, dur - progress.position) : 0;

  const meta = (
    <>
      <DownloadMark id={ep.id} />
      <span>{formatDate(ep.pubDate)}</span>
      {progress?.played ? null : started ? (
        <>
          <ProgressBar value={dur ? progress.position / dur : 0} />
          <span>{left ? formatDuration(left) + ' left' : 'In progress'}</span>
        </>
      ) : (
        dur > 0 && <span>{formatDuration(dur)}</span>
      )}
    </>
  );

  return (
    <ListRow
      leading={<Artwork src={ep.image || podcast?.image} alt={podcast?.title || ep.title} size={48} />}
      title={ep.title}
      subtitle={showArt ? podcast?.title : undefined}
      meta={meta}
      done={progress?.played}
      onClick={() => openEpisode(ep.id)}
      trailing={
        <RowActions
          listened={!!progress?.played}
          onToggle={() => { togglePlayed(ep.id, !progress?.played); if (!progress?.played) say('Marked as listened'); }}
          playing={playing}
          onPlay={() => {
            if (nowPlaying) player.toggle();
            else if (list) player.playList(list, ep.id);
            else player.play(ep.id);
          }}
          before={onDismiss && <span className="dismiss-slot"><IconButton icon="close" label={dismissLabel || "Take it off today’s round-up"} onClick={onDismiss} /></span>}
        />
      }
    />
  );
}

export function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

const UNSORTED = '__none';

export function CategoryChips(props: { value: string | null; onChange: (v: string | null) => void; counts?: Record<string, number> }) {
  const categories = useStore((s) => s.categories);
  const podcasts = useStore((s) => s.podcasts);
  const hasUnsorted = podcasts.some((p) => !p.categoryIds.length);
  return (
    <ChipRow>
      <Chip selected={props.value === null} onClick={() => props.onChange(null)}>All</Chip>
      {categories.map((c) => {
        const n = props.counts ? props.counts[c.id] || 0 : podcasts.filter((p) => p.categoryIds.includes(c.id)).length;
        if (!n) return null;
        return (
          <Chip key={c.id} selected={props.value === c.id} onClick={() => props.onChange(c.id)} count={n}>
            {c.name}
          </Chip>
        );
      })}
      {hasUnsorted && (
        <Chip selected={props.value === UNSORTED} onClick={() => props.onChange(UNSORTED)}>No topic</Chip>
      )}
    </ChipRow>
  );
}

export function inCategory(categoryIds: string[], filter: string | null) {
  if (filter === null) return true;
  if (filter === UNSORTED) return categoryIds.length === 0;
  return categoryIds.includes(filter);
}

// ---------- episode filter bar: status, guests, sort ----------

export function EpisodeFilterBar(props: {
  value: EpisodeFilter;
  onChange: (f: EpisodeFilter) => void;
  sorts: Array<EpisodeFilter['sort']>;
  guestCount?: number;
}) {
  const [sortOpen, setSortOpen] = useState(false);
  const v = props.value;
  const set = (patch: Partial<EpisodeFilter>) => props.onChange({ ...v, ...patch });
  return (
    <>
      <ChipRow>
        {(['all', 'unplayed', 'inProgress', 'finished'] as EpisodeStatus[]).map((s) => (
          <Chip key={s} selected={v.status === s} onClick={() => set({ status: s })}>{STATUS_LABELS[s]}</Chip>
        ))}
        {(props.guestCount ?? 1) > 0 && (
          <Chip selected={v.hideGuests} onClick={() => set({ hideGuests: !v.hideGuests })} count={props.guestCount}>
            No guests
          </Chip>
        )}
        <Chip onClick={() => setSortOpen(true)}><Icon name="sort" size={16} />{SORT_LABELS[v.sort]}</Chip>
      </ChipRow>
      <Sheet open={sortOpen} onClose={() => setSortOpen(false)} title="Sort episodes">
        <div className="menu">
          {props.sorts.map((s) => (
            <MenuItem key={s} icon={v.sort === s ? 'check' : undefined} onClick={() => { set({ sort: s }); setSortOpen(false); }}>
              {SORT_LABELS[s]}
            </MenuItem>
          ))}
        </div>
        <p className="muted small">Recently played puts the episodes you listened to most recently at the top. Played longest ago does the opposite. Episodes you haven’t started come after both.</p>
      </Sheet>
    </>
  );
}

/** Filter state for a list, starting from your settings. */
export function useEpisodeFilter(opts: { sort?: EpisodeFilter['sort']; hideGuests?: boolean } = {}) {
  const settings = useStore((s) => s.settings);
  return useState<EpisodeFilter>({
    status: settings.hidePlayed ? 'unplayed' : 'all',
    hideGuests: opts.hideGuests ?? false,
    query: '',
    sort: opts.sort ?? 'newest',
  });
}
