import { useState } from 'react';
import { Button, EmptyState, IconButton, Section } from '../ui';
import { episodeIndex, useStore } from '../core/store';
import { EpisodeRow, TopBar, plural } from './shared';
import { formatDuration } from '../core/util';

export function Queue() {
  const state = useStore();
  const [editing, setEditing] = useState(false);
  const index = episodeIndex(state.episodes);
  const current = state.nowPlaying ? index.get(state.nowPlaying) : undefined;
  const upNext = state.queue.map((id) => index.get(id)).filter((e): e is NonNullable<typeof e> => !!e);
  const total = upNext.reduce((n, e) => n + (e.duration || 0), 0);

  return (
    <>
      <TopBar
        title="Up Next"
        back
        actions={upNext.length > 0 && <Button variant="ghost" small onClick={() => setEditing(!editing)}>{editing ? 'Done' : 'Edit'}</Button>}
      />
      <div className="content">
        {current && (
          <Section title="Now playing">
            <div className="list">
              <EpisodeRow ep={current} showArt />
            </div>
          </Section>
        )}
        <Section
          title={upNext.length ? `${plural(upNext.length, 'episode')}${total ? ' · ' + formatDuration(total) : ''}` : undefined}
          action={editing && <Button variant="ghost" small onClick={() => { state.setQueue([]); setEditing(false); }}>Clear all</Button>}
        >
          {upNext.length === 0 ? (
            <EmptyState title="Nothing up next" body="Play a series or playlist and the rest of it lines up here." />
          ) : (
            <div className="list">
              {upNext.map((ep, i) => (
                <div key={ep.id}>
                  <EpisodeRow ep={ep} showArt />
                  {editing && (
                    <div className="editctl">
                      <IconButton icon="up" label="Move up" onClick={() => state.moveInQueue(i, i - 1)} />
                      <IconButton icon="down" label="Move down" onClick={() => state.moveInQueue(i, i + 1)} />
                      <IconButton icon="trash" label="Remove from Up Next" onClick={() => state.removeFromQueue(i)} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </Section>
      </div>
    </>
  );
}
