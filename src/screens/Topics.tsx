import { useEffect, useMemo, useRef, useState } from 'react';
import { Artwork, Badge, Button, EmptyState, Glyph, Icon, IconButton, ListRow, MenuItem, PixelGlyph, Segmented, Sheet, Spinner, TextField } from '../ui';
import { isFave, useStore } from '../core/store';
import type { Category, Podcast } from '../core/types';
import { useNav } from '../nav';
import { EpisodeFilterBar, EpisodeRow, TopBar, plural, useEpisodeFilter } from './shared';
import { applyFilter } from '../core/filters';

interface TopicInfo {
  cat: Category;
  shows: number;
  episodes: number;
}

function useTopics(): TopicInfo[] {
  const categories = useStore((s) => s.categories);
  const podcasts = useStore((s) => s.podcasts);
  const episodes = useStore((s) => s.episodes);
  return useMemo(
    () =>
      categories
        .map((cat) => {
          const pods = podcasts.filter((p) => p.categoryIds.includes(cat.id));
          return { cat, shows: pods.length, episodes: pods.reduce((n, p) => n + (episodes[p.id]?.length || 0), 0) };
        })
        .filter((t) => t.shows > 0),
    [categories, podcasts, episodes],
  );
}

export function Topics() {
  const podcasts = useStore((s) => s.podcasts);
  const episodes = useStore((s) => s.episodes);
  const refreshing = useStore((s) => s.refreshing);
  const refreshAll = useStore((s) => s.refreshAll);
  const { push, openAdd, say } = useNav();
  const topics = useTopics();
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState('');

  const unsorted = podcasts.some((p) => !p.categoryIds.length);
  // pills: Fave, then topics biggest first, then No topic and All shows
  const pills: Pill[] = [
    ...[...topics].sort((a, b) => b.shows - a.shows).map((t) => ({ key: t.cat.id, cat: t.cat })),
    ...(unsorted ? [{ key: '__none', cat: { id: 'other', name: 'No topic' } }] : []),
    { key: '__all', cat: { id: 'other', name: 'All shows' } },
  ];
  const [picked, setPicked] = useState<string>(() => lastTopic);
  const current = pills.find((p) => p.key === picked) || pills.find((p) => !p.key.startsWith('__')) || pills[0];
  const pick = (k: string) => { lastTopic = k; setPicked(k); };
  const busy = Object.values(refreshing).some(Boolean);

  const q = query.trim().toLowerCase();
  const matches = q ? podcasts.filter((p) => p.title.toLowerCase().includes(q) || p.author.toLowerCase().includes(q)).slice(0, 40) : [];
  const episodeMatches = useMemo(() => {
    if (q.length < 2) return [];
    const out = [];
    for (const list of Object.values(episodes)) for (const e of list) if (e.title.toLowerCase().includes(q)) out.push(e);
    return out.sort((a, b) => b.pubDate - a.pubDate).slice(0, 50);
  }, [q, episodes]);

  return (
    <>
      <TopBar
        title="Topics"
        big
        actions={
          <>
            <IconButton icon="search" label="Search your shows" onClick={() => { setSearching(!searching); setQuery(''); }} />
            <IconButton icon="series" label="All series" onClick={() => push({ name: 'allseries' })} />
            {podcasts.length > 0 &&
              (busy ? (
                <span className="iconbtn"><Spinner /></span>
              ) : (
                <IconButton
                  icon="refresh"
                  label="Check for new episodes"
                  onClick={async () => {
                    const { failed } = await refreshAll();
                    failed.length ? say(`Couldn't update ${plural(failed.length, 'show')}`, 'error') : say('Up to date');
                  }}
                />
              ))}
            <IconButton icon="plus" label="Add a show" onClick={() => openAdd(true)} />
          </>
        }
      />
      <div className="content tlib">
        {searching && (
          <div className="stack" style={{ marginBottom: 'var(--space-4)' }}>
            <TextField id="topics-search" type="search" value={query} onChange={setQuery} placeholder="Search shows and episodes" autoFocus />
            {q && matches.length > 0 && <p className="section-title" style={{ margin: 0 }}>Shows</p>}
            {q && matches.length > 0 && (
              <div className="list">
                {matches.map((p) => (
                  <ListRow
                    key={p.id}
                    leading={<Artwork src={p.image} alt={p.title} size={44} />}
                    title={p.title}
                    subtitle={p.author}
                    onClick={() => push({ name: 'podcast', id: p.id })}
                    trailing={p.isPatreon ? <Badge tone="patreon">Patreon</Badge> : undefined}
                  />
                ))}
              </div>
            )}
            {episodeMatches.length > 0 && <p className="section-title" style={{ margin: 0 }}>Episodes · {episodeMatches.length}</p>}
            {episodeMatches.length > 0 && (
              <div className="list">
                {episodeMatches.map((e) => <EpisodeRow key={e.id} ep={e} showArt />)}
              </div>
            )}
            {q && !matches.length && !episodeMatches.length && <p className="muted small" style={{ margin: 0 }}>Nothing matches “{query}”.</p>}
          </div>
        )}

        {podcasts.length === 0 ? (
          <EmptyState
            title="Add your first show"
            body="Search by name, paste an RSS link, or import a list from another app in Settings."
            action={<Button variant="primary" icon="plus" onClick={() => openAdd(true)}>Add a show</Button>}
          />
        ) : (
          <>
            <TopicPills pills={pills} value={current.key} onChange={pick} />
            <TopicBody key={current.key} id={current.key === '__all' ? null : current.key} />
          </>
        )}
      </div>
    </>
  );
}

interface Pill {
  key: string;
  cat: Category;
}

/** The topic you last picked, kept while the app is open. */
let lastTopic = '';

/** Big pills that scroll sideways, one per topic: pixel mark and name. The chosen one scrolls to the middle. */
function TopicPills({ pills, value, onChange }: { pills: Pill[]; value: string; onChange: (k: string) => void }) {
  const row = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const r = row.current;
    const on = r?.querySelector<HTMLElement>('.tpill-on');
    if (r && on) r.scrollTo({ left: on.offsetLeft - (r.clientWidth - on.offsetWidth) / 2, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }, [value]);
  return (
    <div className="tpills" role="tablist" aria-label="Topics" ref={row}>
      {pills.map((p) => (
        <button key={p.key} type="button" role="tab" aria-selected={p.key === value} className={`tpill${p.key === value ? ' tpill-on' : ''}`} onClick={() => onChange(p.key)}>
          {p.key === '__all' ? <PixelGlyph k="album" /> : <Glyph id={p.cat.id} name={p.cat.name} />}
          <span>{p.cat.name}</span>
        </button>
      ))}
    </div>
  );
}

type View = 'shows' | 'latest';

/** One topic's shows on their own screen (or all shows when id is null). */
export function TopicScreen({ id }: { id: string | null }) {
  const categories = useStore((s) => s.categories);
  const cat = categories.find((c) => c.id === id);
  const title = id === null ? 'All shows' : id === '__none' ? 'No topic' : cat?.name || 'Topic';
  return (
    <>
      <TopBar title={title} back />
      <div className="content tlib"><TopicBody id={id} /></div>
    </>
  );
}

/** A topic's Shows / Latest episodes switch and what's under it. */
function TopicBody({ id }: { id: string | null }) {
  const podcasts = useStore((s) => s.podcasts);
  const episodes = useStore((s) => s.episodes);
  const categories = useStore((s) => s.categories);
  const [view, setView] = useState<View>('shows');
  const [filter, setFilter] = useEpisodeFilter();
  const cat = categories.find((c) => c.id === id);
  const progress = useStore((s) => s.progress);
  // when you last listened to each show
  const lastListened = useMemo(() => {
    const m = new Map<string, number>();
    for (const [pid, eps] of Object.entries(episodes)) {
      let t = 0;
      for (const e of eps) {
        const pr = progress[e.id];
        if (pr && (pr.position > 5 || pr.played) && pr.updatedAt > t) t = pr.updatedAt;
      }
      if (t) m.set(pid, t);
    }
    return m;
  }, [episodes, progress]);

  // most recently listened first; shows you haven't played yet follow, A to Z
  const shown = podcasts
    .filter((p) => (id === null ? true : id === '__none' ? !p.categoryIds.length : p.categoryIds.includes(id)))
    .sort((a, b) => (lastListened.get(b.id) || 0) - (lastListened.get(a.id) || 0) || a.title.localeCompare(b.title));
  const latest = useMemo(() => {
    const ids = new Set(shown.map((p) => p.id));
    return Object.entries(episodes)
      .filter(([pid]) => ids.has(pid))
      .flatMap(([, eps]) => eps.slice(0, 20));
  }, [episodes, shown.map((p) => p.id).join()]);
  const latestShown = useMemo(() => applyFilter(latest, filter, progress).slice(0, 80), [latest, filter, progress]);

  return (
    <>
        <div className="tlib-seg">
          <Segmented<View>
            value={view}
            onChange={setView}
            options={[
              { value: 'shows', label: 'Shows' },
              { value: 'latest', label: 'Latest episodes' },
            ]}
          />
        </div>
        <div className="stack">
          {view === 'shows' && (
            <p className="muted small" style={{ margin: 0 }}>
              {plural(shown.length, 'show')}
              {cat?.hideFromToday ? ' · kept out of Today' : ''}
            </p>
          )}
          {view === 'shows' ? (
            <div className="showgrid">
              {shown.map((p) => (
                <ShowCard key={p.id} podcast={p} lastListened={lastListened.get(p.id)} />
              ))}
            </div>
          ) : (
            <>
              <EpisodeFilterBar value={filter} onChange={setFilter} sorts={['newest', 'oldest', 'recentlyPlayed', 'playedLongAgo']} />
              <div className="list">
                {latestShown.map((ep) => (
                  <EpisodeRow key={ep.id} ep={ep} showArt />
                ))}
                {!latestShown.length && <p className="muted small" style={{ padding: 12, margin: 0 }}>No episodes match this filter.</p>}
              </div>
            </>
          )}
        </div>
    </>
  );
}

function listenedLabel(t?: number): string {
  if (!t) return '';
  const days = Math.floor((Date.now() - t) / 86400000);
  if (days <= 0) return 'Played today';
  if (days === 1) return 'Played yesterday';
  if (days < 7) return `Played ${days} days ago`;
  return 'Played ' + new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

/** A show in a topic, with quick actions behind the ⋯ button. */
function ShowCard({ podcast: p, lastListened }: { podcast: Podcast; lastListened?: number }) {
  const state = useStore();
  const { push, pickPlaylist, say } = useNav();
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const fave = isFave(state, p.id);
  const close = () => { setOpen(false); setConfirm(false); };
  return (
    <div className="showcard">
      <span className="art-wrap">
        <button type="button" className="showcard-open" onClick={() => push({ name: 'podcast', id: p.id })}>
          <Artwork src={p.image} alt={p.title} size="100%" />
        </button>
        {fave && <span className="favmark" aria-label="Fave" role="img"><Icon name="heart" size={14} /></span>}
        <span className="showcard-more">
          <IconButton icon="more" label={`Quick actions for ${p.title}`} onClick={() => setOpen(true)} />
        </span>
      </span>
      <button type="button" className="showcard-open" onClick={() => push({ name: 'podcast', id: p.id })}>
        <span className="showcard-title">{p.title}</span>
        <span className="showcard-meta">{p.isPatreon ? <Badge tone="patreon">Patreon</Badge> : listenedLabel(lastListened)}</span>
      </button>
      <Sheet open={open} onClose={close} title={p.title} titleClass="ep-title">
        {confirm ? (
          <div className="menu">
            <p className="small" style={{ padding: '8px 12px', margin: 0 }}>Remove {p.title}? Its episodes leave your playlists, Up Next and the round-up.</p>
            <MenuItem icon="trash" danger onClick={() => { close(); state.removePodcast(p.id); say('Show removed'); }}>Remove show</MenuItem>
            <MenuItem onClick={() => setConfirm(false)}>Keep it</MenuItem>
          </div>
        ) : (
          <div className="menu">
            <MenuItem icon="heart" onClick={() => { state.toggleFavorite(p.id); close(); say(fave ? 'Removed from Fave' : 'Added to Fave'); }}>
              {fave ? 'Remove from Fave' : 'Add to Fave'}
            </MenuItem>
            <MenuItem icon="playlist" onClick={() => { close(); pickPlaylist({ kind: 'podcast', podcastId: p.id }); }}>Add to playlist</MenuItem>
            <MenuItem icon="trash" danger onClick={() => setConfirm(true)}>Remove show</MenuItem>
          </div>
        )}
      </Sheet>
    </div>
  );
}
