import { useMemo, useState } from 'react';
import { Artwork, Badge, Button, EmptyState, Glyph, IconButton, ListRow, Section, Sheet, Spinner, TextField, Toggle } from '../ui';
import { getSeries, useStore } from '../core/store';
import { player, usePlayer } from '../core/player';
import { hiddenFromToday, newEpisodes, roundupEpisodes, roundupShows, NEW_WINDOW_DAYS } from '../core/lists';
import type { Episode } from '../core/types';
import { formatDuration } from '../core/util';
import { useNav } from '../nav';
import { EpisodeRow, TopBar, plural } from './shared';

const PAGE_DAYS = 4;

function dayKey(ms: number) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}
function dayLabel(ms: number) {
  return new Date(ms).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

export function Today() {
  const state = useStore();
  const { openAdd, say } = useNav();
  const [editRoundup, setEditRoundup] = useState(false);
  const [days, setDays] = useState(PAGE_DAYS);

  const roundup = useMemo(() => roundupEpisodes(state), [state.episodes, state.podcasts, state.roundup, state.progress, state.categories, state.roundupDismissed]);
  const shows = roundupShows(state);
  const roundupIds = new Set(roundup.map((e) => e.id));
  // round-up episodes are already on screen, so New skips them
  const fresh = useMemo(() => newEpisodes(state).filter((e) => !roundupIds.has(e.id)), [state.episodes, state.progress, state.newClearedAt, state.categories, state.podcasts, roundup]);

  const groups = useMemo(() => {
    const out: Array<{ key: string; label: string; eps: Episode[] }> = [];
    for (const e of fresh) {
      const k = dayKey(e.pubDate);
      const last = out[out.length - 1];
      if (last?.key === k) last.eps.push(e);
      else out.push({ key: k, label: dayLabel(e.pubDate), eps: [e] });
    }
    return out;
  }, [fresh]);

  const busy = Object.values(state.refreshing).some(Boolean);
  const roundupLeft = roundup.filter((e) => !state.progress[e.id]?.played);
  const roundupSec = roundupLeft.reduce((n, e) => n + (e.duration || 0), 0);

  return (
    <>
      <TopBar
        title="Today"
        big
        actions={
          busy ? (
            <span className="iconbtn"><Spinner /></span>
          ) : (
            <IconButton
              icon="refresh"
              label="Check for new episodes"
              onClick={async () => {
                const { failed } = await state.refreshAll();
                failed.length ? say(`Couldn't update ${plural(failed.length, 'show')}`, 'error') : say('Up to date');
              }}
            />
          )
        }
      />
      <div className="content">
        {state.podcasts.length === 0 ? (
          <EmptyState
            title="Nothing here yet"
            body="Add your shows and their new episodes land here, with a daily round-up of your news."
            action={<Button variant="primary" icon="plus" onClick={() => openAdd(true)}>Add a show</Button>}
          />
        ) : (
          <>
            {/* Daily round-up */}
            <div className="tcard tcard-wide roundup-card">
              <span className="tcard-top">
                <Glyph id="news" />
                <span>{dayLabel(Date.now())}</span>
              </span>
              <h3>Daily round-up</h3>
              <span className="tcard-sub">
                {roundup.length === 0
                  ? shows.length
                    ? 'Nothing new from your round-up shows yet today.'
                    : 'Pick the shows you want back to back each morning.'
                  : roundupLeft.length === 0
                    ? `All ${plural(roundup.length, 'episode')} played. See you tomorrow.`
                    : `${plural(roundupLeft.length, 'episode')} left${roundupSec ? ', ' + formatDuration(roundupSec) : ''}, played back to back.`}
              </span>
              <span className="roundup-actions">
                {roundupLeft.length > 0 && (
                  <Button variant="primary" icon="play" onClick={() => player.playList(roundup.map((e) => e.id))}>Play round-up</Button>
                )}
                <Button small variant="ghost" onClick={() => setEditRoundup(true)}>{shows.length ? 'Edit shows' : 'Choose shows'}</Button>
              </span>
            </div>
            {roundup.length > 0 && (
              <div className="list roundup-list" style={{ marginTop: 'var(--space-2)' }}>
                {roundup.map((ep) => (
                  <EpisodeRow
                    key={ep.id}
                    ep={ep}
                    showArt
                    list={roundup.map((e) => e.id)}
                    onDismiss={() => { state.dismissFromRoundup(ep.id); say('Taken off today’s round-up'); }}
                  />
                ))}
              </div>
            )}

            {/* New episodes, by day */}
            {groups.length === 0 ? (
              <EmptyState title="Nothing new today" body={`New episodes from the last ${NEW_WINDOW_DAYS} days land here. Tap refresh to check now.`} />
            ) : (
              <>
                <div className="dayhead">
                  <span>New episodes · {fresh.length}</span>
                  <span className="dayhead-actions">
                    <Button small variant="ghost" onClick={() => player.playList(fresh.map((e) => e.id))}>Play all</Button>
                    <Button small variant="ghost" onClick={() => { state.clearNew(); say('New episodes cleared'); }}>Clear</Button>
                  </span>
                </div>
                {groups.slice(0, days).map((g, gi) => (
                  <section key={g.key}>
                    <div className="dayhead">
                      <span>{g.label}</span>
                      <span>{g.eps.length} new</span>
                    </div>
                    <div className="list">
                      {g.eps.map((ep) => <EpisodeRow key={ep.id} ep={ep} showArt />)}
                    </div>
                  </section>
                ))}
                {groups.length > days && (
                  <Button full onClick={() => setDays(days + PAGE_DAYS)} >Earlier days</Button>
                )}
              </>
            )}
          </>
        )}
      </div>
      <RoundupSheet open={editRoundup} onClose={() => setEditRoundup(false)} />
    </>
  );
}


function RoundupSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const state = useStore();
  const current = roundupShows(state).map((p) => p.id);
  const hidden = hiddenFromToday(state);
  const others = state.podcasts.filter((p) => !current.includes(p.id) && !hidden.has(p.id)).sort((a, b) => a.title.localeCompare(b.title));
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const found = q ? others.filter((p) => (p.title + ' ' + (p.author || '')).toLowerCase().includes(q)) : others;
  const setIds = (ids: string[]) => state.setRoundup(ids);
  const move = (i: number, d: number) => {
    const ids = [...current];
    const j = i + d;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    setIds(ids);
  };

  return (
    <Sheet open={open} onClose={onClose} title="Daily round-up" tall>
      <p className="muted small">
        Each day the round-up takes the newest episode from these shows, if it came out in the last 30 hours, and plays them in this order.
        {state.roundup === null && ' Right now it uses your News shows.'}
      </p>
      {current.length > 0 && (
        <Section title="In your round-up">
          <div className="list">
            {current.map((id, i) => {
              const p = state.podcasts.find((x) => x.id === id)!;
              return (
                <ListRow
                  key={id}
                  leading={<Artwork src={p.image} alt={p.title} size={40} />}
                  title={p.title}
                  trailing={
                    <>
                      <IconButton icon="up" label="Move up" onClick={() => move(i, -1)} />
                      <IconButton icon="down" label="Move down" onClick={() => move(i, 1)} />
                      <IconButton icon="close" label={`Remove ${p.title}`} onClick={() => setIds(current.filter((x) => x !== id))} />
                    </>
                  }
                />
              );
            })}
          </div>
        </Section>
      )}
      {others.length > 0 && (
        <Section title="Add shows">
          <TextField id="ru-search" type="search" value={query} onChange={setQuery} placeholder="Find a show" />
          {found.length === 0 && <p className="muted small">No show matches “{query.trim()}”.</p>}
          {found.length > 0 && (
            <div className="list pad">
              {found.map((p) => (
                <Toggle key={p.id} id={`ru-${p.id}`} label={p.title} checked={false} onChange={() => setIds([...current, p.id])} />
              ))}
            </div>
          )}
        </Section>
      )}
      {state.roundupDismissed.length > 0 && (
        <Button onClick={() => { state.restoreRoundup(); onClose(); }}>Bring back episodes I ticked off</Button>
      )}
      <Button variant="primary" onClick={onClose}>Done</Button>
    </Sheet>
  );
}
