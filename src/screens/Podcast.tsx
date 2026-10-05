import { useMemo, useState } from 'react';
import {
  Artwork, Badge, Button, Chip, ChipRow, EmptyState, IconButton, ListRow, MenuItem, ProgressBar, Section,
  Segmented, Sheet, Spinner, TextField, Toggle,
} from '../ui';
import { getSeries, isFave, useStore } from '../core/store';
import type { Series } from '../core/types';
import { useNav } from '../nav';
import { player, usePlayer } from '../core/player';
import { EpisodeFilterBar, EpisodeRow, RowActions, TopBar, plural, useEpisodeFilter } from './shared';
import { applyFilter, hasGuest, type EpisodeFilter } from '../core/filters';

type View = 'episodes' | 'series';

/** One series: the show's cover, name and progress, then listened (the whole series) and play (from where you are). */
export function SeriesRow({ series, showPodcast }: { series: Series; showPodcast?: boolean }) {
  const progress = useStore((s) => s.progress);
  const podcast = useStore((s) => s.podcasts.find((p) => p.id === series.podcastId));
  const nowPlaying = useStore((s) => s.nowPlaying);
  const setPlayedMany = useStore((s) => s.setPlayedMany);
  const isPlaying = usePlayer((s) => s.playing);
  const { push, say } = useNav();
  const played = series.episodeIds.filter((id) => progress[id]?.played).length;
  const total = series.episodeIds.length;
  const done = total > 0 && played === total;
  const playingHere = !!nowPlaying && series.episodeIds.includes(nowPlaying) && isPlaying;
  return (
    <ListRow
      leading={<Artwork src={podcast?.image} alt={podcast?.title || series.name} size={48} />}
      title={series.name}
      subtitle={showPodcast ? podcast?.title : undefined}
      meta={
        <>
          <span>{plural(total, 'episode')}</span>
          {played > 0 && played < total && (
            <>
              <ProgressBar value={played / total} />
              <span>{`${played} played`}</span>
            </>
          )}
        </>
      }
      done={done}
      onClick={() => push({ name: 'series', podcastId: series.podcastId, key: series.key })}
      trailing={
        <RowActions
          what="the whole series"
          listened={done}
          onToggle={() => { setPlayedMany(series.episodeIds, !done); say(done ? `${series.name}: marked as not listened` : `${series.name}: all ${total} marked as listened`); }}
          playing={playingHere}
          onPlay={() => (playingHere ? player.toggle() : player.playList(series.episodeIds))}
        />
      }
    />
  );
}

export function PodcastScreen({ id }: { id: string }) {
  const state = useStore();
  const podcast = state.podcasts.find((p) => p.id === id);
  const episodes = state.episodes[id] || [];
  const series = getSeries(state, id);
  const [view, setView] = useState<View>('episodes');
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [query, setQuery] = useState('');
  const [manage, setManage] = useState(false);
  const { say, pop, pickPlaylist } = useNav();
  const [filter, setFilterState] = useEpisodeFilter({ hideGuests: podcast?.hideGuests, sort: podcast?.episodeSort || 'newest' });
  const setFilter = (f: EpisodeFilter) => {
    setFilterState(f);
    // "No guests" and the episode order are remembered for this show only
    if (f.hideGuests !== filter.hideGuests) state.updatePodcast(id, { hideGuests: f.hideGuests });
    if (f.sort !== filter.sort && f.sort !== 'series') state.updatePodcast(id, { episodeSort: f.sort });
  };
  const guestCount = useMemo(() => episodes.filter((e) => hasGuest(e.title)).length, [episodes]);

  const filtered = useMemo(
    () => applyFilter(episodes, { ...filter, query }, state.progress),
    [episodes, query, filter, state.progress],
  );

  const filteredSeries = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? series.filter((s) => s.name.toLowerCase().includes(q)) : series;
  }, [series, query]);

  if (!podcast) return <EmptyState title="This podcast was removed" />;

  const cats = state.categories.filter((c) => podcast.categoryIds.includes(c.id));
  const fave = isFave(state, id);
  const refreshing = state.refreshing[id];

  return (
    <>
      <TopBar
        title=""
        back
        actions={
          <>
            {refreshing ? (
              <span className="iconbtn">
                <Spinner />
              </span>
            ) : (
              <IconButton
                icon="refresh"
                label="Check for new episodes"
                onClick={() =>
                  state
                    .refreshPodcast(id)
                    .then(() => say('Up to date'))
                    .catch((e: Error) => say(e.message, 'error'))
                }
              />
            )}
            <span className={fave ? 'favbtn favbtn-on' : 'favbtn'}>
              <IconButton
                icon="heart"
                label={fave ? 'Remove from Fave' : 'Add to Fave'}
                onClick={() => { state.toggleFavorite(id); say(fave ? 'Removed from Fave' : 'Added to Fave'); }}
              />
            </span>
            <IconButton icon="playlist" label="Add show to a playlist" onClick={() => pickPlaylist({ kind: 'podcast', podcastId: id })} />
            <IconButton icon="trash" label="Remove show" onClick={() => setConfirmRemove(true)} />
            <IconButton icon="more" label="Podcast settings" onClick={() => setManage(true)} />
          </>
        }
      />
      <div className="content">
        <div className="podhead">
          <Artwork src={podcast.image} alt={podcast.title} size={112} />
          <div className="podhead-text">
            <h1>{podcast.title}</h1>
            {podcast.author && <p className="muted small">{podcast.author}</p>}
            <div className="badges">
              {podcast.isPatreon && <Badge tone="patreon">Patreon feed</Badge>}
              {cats.map((c) => (
                <Badge key={c.id}>{c.name}</Badge>
              ))}
              {!cats.length && (
                <button type="button" className="linkish small" onClick={() => setManage(true)}>
                  Add a category
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="stack">
          <Segmented<View>
            value={view}
            onChange={setView}
            options={[
              { value: 'episodes', label: `Episodes · ${episodes.length}` },
              { value: 'series', label: `Series · ${series.length}` },
            ]}
          />
          <TextField
            id={`search-${id}`}
            type="search"
            value={query}
            onChange={setQuery}
            placeholder={view === 'series' ? 'Search series and episodes' : 'Search episodes'}
          />
          {view === 'episodes' && (
            <EpisodeFilterBar value={filter} onChange={setFilter} sorts={['newest', 'oldest', 'recentlyPlayed', 'playedLongAgo']} guestCount={guestCount} />
          )}

          {view === 'series' ? (
            filteredSeries.length || query.trim() ? (
              <>
                {filteredSeries.length > 0 && (
                  <div className="list">
                    {filteredSeries.map((s) => (
                      <SeriesRow key={s.key} series={s} />
                    ))}
                  </div>
                )}
                {query.trim() && (
                  <Section title={`Episodes matching “${query.trim()}” · ${filtered.length}`}>
                    {filtered.length ? (
                      <div className="list">
                        {filtered.slice(0, 50).map((ep) => <EpisodeRow key={ep.id} ep={ep} />)}
                      </div>
                    ) : (
                      <p className="muted small" style={{ margin: 0 }}>No episodes match.</p>
                    )}
                  </Section>
                )}
              </>
            ) : (
              <EmptyState
                title={query ? 'No series match' : 'No series found yet'}
                body="Tapedeck groups multi-part and numbered episodes automatically. If this show names its series differently, add a rule."
                action={<Button onClick={() => setManage(true)}>Add a series rule</Button>}
              />
            )
          ) : (
            <div className="list">
              {filtered.map((ep) => (
                <EpisodeRow key={ep.id} ep={ep} />
              ))}
              {!filtered.length && (
                <EmptyState
                  title="No episodes match"
                  body={filter.status !== 'all' || filter.hideGuests ? 'Try All, or turn off No guests.' : undefined}
                />
              )}
            </div>
          )}
        </div>
      </div>
      <PodcastSettings podcastId={id} open={manage} onClose={() => setManage(false)} />
      <Sheet open={confirmRemove} onClose={() => setConfirmRemove(false)} title="Remove show?">
        <p className="muted small" style={{ margin: 0 }}>{podcast.title} and its episodes leave your library, playlists and Up Next. You can add it again any time.</p>
        <Button variant="danger" full icon="trash" onClick={() => { setConfirmRemove(false); pop(); state.removePodcast(id); say('Show removed'); }}>Remove show</Button>
        <Button full onClick={() => setConfirmRemove(false)}>Keep it</Button>
      </Sheet>
    </>
  );
}

function PodcastSettings({ podcastId, open, onClose }: { podcastId: string; open: boolean; onClose: () => void }) {
  const state = useStore();
  const podcast = state.podcasts.find((p) => p.id === podcastId);
  const rules = state.rules.filter((r) => r.podcastId === podcastId);
  const { pop, say } = useNav();
  const [ruleName, setRuleName] = useState('');
  const [rulePattern, setRulePattern] = useState('');
  const [regex, setRegex] = useState(false);
  const [feedUrl, setFeedUrl] = useState(podcast?.feedUrl || '');
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [newCat, setNewCat] = useState('');

  if (!podcast) return null;

  const episodes = state.episodes[podcastId] || [];
  const preview = rulePattern.trim()
    ? episodes.filter((e) => {
        if (!regex) return e.title.toLowerCase().includes(rulePattern.toLowerCase());
        try {
          return new RegExp(rulePattern, 'i').test(e.title);
        } catch {
          return false;
        }
      }).length
    : 0;

  const toggleCat = (cid: string) => {
    const has = podcast.categoryIds.includes(cid);
    state.updatePodcast(podcastId, { categoryIds: has ? podcast.categoryIds.filter((c) => c !== cid) : [...podcast.categoryIds, cid] });
  };

  return (
    <Sheet open={open} onClose={onClose} title={podcast.title} titleClass="ep-title" tall>
      <Section title="Categories">
        <ChipRow>
          {state.categories.map((c) => (
            <Chip key={c.id} selected={podcast.categoryIds.includes(c.id)} onClick={() => toggleCat(c.id)}>
              {c.name}
            </Chip>
          ))}
        </ChipRow>
        <div className="inline-form">
          <TextField id="pod-newcat" value={newCat} onChange={setNewCat} placeholder="New category" onEnter={() => addCat()} />
          <Button onClick={addCat} disabled={!newCat.trim()}>
            Add
          </Button>
        </div>
      </Section>

      <Section title="Series rules">
        <p className="muted small">
          Group episodes into a series by a word in their titles. For example, name “Gallipoli” and match “Gallipoli”.
        </p>
        {rules.length > 0 && (
          <div className="list">
            {rules.map((r) => (
              <ListRow
                key={r.id}
                title={r.name}
                subtitle={`${r.mode === 'regex' ? 'Pattern' : 'Title contains'}: ${r.pattern}`}
                trailing={<IconButton icon="trash" label="Delete rule" onClick={() => state.deleteRule(r.id)} />}
              />
            ))}
          </div>
        )}
        <TextField id="rule-name" label="Series name" value={ruleName} onChange={setRuleName} placeholder="e.g. Gallipoli" />
        <TextField
          id="rule-pattern"
          label={regex ? 'Title pattern (regular expression)' : 'Title contains'}
          value={rulePattern}
          onChange={setRulePattern}
          placeholder={regex ? '^Gallipoli|Dardanelles' : 'e.g. Gallipoli'}
          hint={rulePattern.trim() ? `Matches ${plural(preview, 'episode')}` : undefined}
        />
        <Toggle id="rule-regex" label="Use a regular expression" checked={regex} onChange={setRegex} />
        <Button
          variant="primary"
          disabled={!ruleName.trim() || !rulePattern.trim()}
          onClick={() => {
            state.addRule({ podcastId, name: ruleName.trim(), pattern: rulePattern.trim(), mode: regex ? 'regex' : 'contains' });
            say(`Added “${ruleName.trim()}”`);
            setRuleName('');
            setRulePattern('');
          }}
        >
          Add rule
        </Button>
      </Section>

      <Section title="Feed">
        <TextField
          id="pod-feed"
          label="RSS address"
          type="url"
          value={feedUrl}
          onChange={setFeedUrl}
          hint={podcast.isPatreon ? 'Private Patreon link. If episodes stop loading, copy a fresh one from Patreon and paste it here.' : undefined}
        />
        <Button
          disabled={feedUrl.trim() === podcast.feedUrl || !feedUrl.trim()}
          onClick={() => {
            state.updatePodcast(podcastId, { feedUrl: feedUrl.trim() });
            state
              .refreshPodcast(podcastId)
              .then(() => say('Feed updated'))
              .catch((e: Error) => say(e.message, 'error'));
          }}
        >
          Save address
        </Button>
      </Section>

      <Section title="Remove">
        {confirmRemove ? (
          <div className="menu">
            <p className="small" style={{ padding: '8px 12px', margin: 0 }}>
              Remove {podcast.title}? Its episodes leave your playlists and queue.
            </p>
            <MenuItem
              icon="trash"
              danger
              onClick={() => {
                onClose();
                pop();
                state.removePodcast(podcastId);
                say('Podcast removed');
              }}
            >
              Remove podcast
            </MenuItem>
            <MenuItem onClick={() => setConfirmRemove(false)}>Keep it</MenuItem>
          </div>
        ) : (
          <Button variant="danger" onClick={() => setConfirmRemove(true)}>
            Remove podcast
          </Button>
        )}
      </Section>
    </Sheet>
  );

  function addCat() {
    if (!newCat.trim()) return;
    const c = state.addCategory(newCat);
    state.updatePodcast(podcastId, { categoryIds: [...podcast!.categoryIds, c.id] });
    setNewCat('');
  }
}
