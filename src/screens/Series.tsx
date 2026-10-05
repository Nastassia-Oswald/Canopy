import { useMemo, useState } from 'react';
import { Artwork, Button, EmptyState, IconButton, MenuItem, Sheet, TextField } from '../ui';
import { episodeIndex, getSeries, useStore } from '../core/store';
import { player } from '../core/player';
import { useNav } from '../nav';
import { formatDuration } from '../core/util';
import { CategoryChips, inCategory } from './shared';
import { SeriesRow } from './Podcast';
import { EpisodeFilterBar, EpisodeRow, TopBar, plural, useEpisodeFilter } from './shared';
import { applyFilter, hasGuest } from '../core/filters';

export function SeriesList() {
  const state = useStore();
  const [filter, setFilter] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const openAdd = useNav((s) => s.openAdd);

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    return state.podcasts
      .filter((p) => inCategory(p.categoryIds, filter))
      .sort((a, b) => a.title.localeCompare(b.title))
      .map((p) => ({
        podcast: p,
        series: getSeries(state, p.id).filter((s) => !q || s.name.toLowerCase().includes(q) || p.title.toLowerCase().includes(q)),
      }))
      .filter((g) => g.series.length);
  }, [state.podcasts, state.episodes, state.rules, state.seriesRenames, filter, query]);

  const total = groups.reduce((n, g) => n + g.series.length, 0);

  return (
    <>
      <TopBar title="All series" back />
      <div className="content">
        {state.podcasts.length === 0 ? (
          <EmptyState
            title="No series yet"
            body="Once you add podcasts, their multi-part and numbered series show up here."
            action={<Button variant="primary" onClick={() => openAdd(true)}>Add podcast</Button>}
          />
        ) : (
          <div className="stack">
            <TextField id="series-search" type="search" value={query} onChange={setQuery} placeholder="Find a series, e.g. Russian Revolution" />
            <CategoryChips value={filter} onChange={setFilter} />
            {groups.map((g) => (
              <section key={g.podcast.id} className="stack-tight">
                <div className="grouphead">
                  <Artwork src={g.podcast.image} alt={g.podcast.title} size={28} />
                  <h2>{g.podcast.title}</h2>
                  <span className="muted small">{g.series.length}</span>
                </div>
                <div className="list">
                  {g.series.map((s) => (
                    <SeriesRow key={s.key} series={s} />
                  ))}
                </div>
              </section>
            ))}
            {total === 0 && <EmptyState title="No series match" body="Try another word, or pick All categories." />}
          </div>
        )}
      </div>
    </>
  );
}

export function SeriesDetail({ podcastId, seriesKey }: { podcastId: string; seriesKey: string }) {
  const state = useStore();
  const { pickPlaylist, say } = useNav();
  const [menu, setMenu] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const series = getSeries(state, podcastId).find((s) => s.key === seriesKey);
  const podcast = state.podcasts.find((p) => p.id === podcastId);
  const [name, setName] = useState(series?.name || '');
  const [filter, setFilter] = useEpisodeFilter({ sort: 'series' });

  if (!series || !podcast) return (
    <>
      <TopBar title="" back />
      <EmptyState title="This series is no longer in the feed" />
    </>
  );

  const index = episodeIndex(state.episodes);
  const ordered = state.settings.seriesOrder === 'newest' ? [...series.episodeIds].reverse() : series.episodeIds;
  const eps = ordered.map((id) => index.get(id)!).filter(Boolean);
  const shownEps = applyFilter(eps, filter, state.progress);
  const guestCount = eps.filter((e) => hasGuest(e.title)).length;
  const playOrder = series.episodeIds; // always play oldest → newest
  const played = series.episodeIds.filter((id) => state.progress[id]?.played).length;
  const totalSec = eps.reduce((n, e) => n + (e.duration || 0), 0);
  const started = played > 0 || series.episodeIds.some((id) => (state.progress[id]?.position || 0) > 5);

  return (
    <>
      <TopBar title="" back actions={<IconButton icon="more" label="Series options" onClick={() => setMenu(true)} />} />
      <div className="content">
        <div className="podhead">
          <Artwork src={podcast.image} alt={podcast.title} size={96} />
          <div className="podhead-text">
            <p className="eyebrow">{podcast.title}</p>
            <h1>{series.name}</h1>
            <p className="muted small">
              {plural(eps.length, 'episode')}
              {totalSec > 0 && ` · ${formatDuration(totalSec)}`}
              {played > 0 && ` · ${played} played`}
            </p>
          </div>
        </div>
        <div className="stack">
          <div className="btnrow">
            <Button variant="primary" icon="play" onClick={() => player.playList(playOrder)}>
              {started && played < eps.length ? 'Continue' : 'Play from part 1'}
            </Button>
            <Button icon="playlist" onClick={() => pickPlaylist({ kind: 'series', podcastId, seriesKey })}>
              Add to playlist
            </Button>
          </div>
          <EpisodeFilterBar value={filter} onChange={setFilter} sorts={['series', 'newest', 'oldest', 'recentlyPlayed', 'playedLongAgo']} guestCount={guestCount} />
          <div className="list">
            {shownEps.map((ep) => (
              <EpisodeRow key={ep.id} ep={ep} list={playOrder} />
            ))}
            {!shownEps.length && <p className="muted small" style={{ padding: 12, margin: 0 }}>No episodes match this filter.</p>}
          </div>
        </div>
      </div>

      <Sheet open={menu} onClose={() => { setMenu(false); setRenaming(false); }} title={series.name}>
        {renaming ? (
          <>
            <TextField id="series-rename" label="Series name" value={name} onChange={setName} autoFocus />
            <Button
              variant="primary"
              disabled={!name.trim()}
              onClick={() => {
                state.renameSeries(podcastId, seriesKey, name);
                setRenaming(false);
                setMenu(false);
                say('Renamed');
              }}
            >
              Save name
            </Button>
          </>
        ) : (
          <div className="menu">
            <MenuItem icon="edit" onClick={() => { setName(series.name); setRenaming(true); }}>Rename series</MenuItem>
            <MenuItem icon="queue" onClick={() => { state.enqueue(playOrder); setMenu(false); say(`Added ${plural(playOrder.length, 'episode')} to Up Next`); }}>
              Add all to Up Next
            </MenuItem>
            <MenuItem icon="check" onClick={() => { playOrder.forEach((id) => state.togglePlayed(id, true)); setMenu(false); }}>
              Mark all as played
            </MenuItem>
            <MenuItem icon="refresh" onClick={() => { playOrder.forEach((id) => state.togglePlayed(id, false)); setMenu(false); }}>
              Mark all as unplayed
            </MenuItem>
            <MenuItem
              icon="series"
              onClick={() => {
                state.updateSettings({ seriesOrder: state.settings.seriesOrder === 'oldest' ? 'newest' : 'oldest' });
                setMenu(false);
              }}
            >
              {state.settings.seriesOrder === 'oldest' ? 'Show newest first' : 'Show part 1 first'}
            </MenuItem>
          </div>
        )}
      </Sheet>
    </>
  );
}
