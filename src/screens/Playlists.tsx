import { useRef, useState } from 'react';
import { Artwork, Button, EmptyState, GLYPHS, GLYPH_NAMES, Icon, IconButton, ListRow, MenuItem, PixelGlyph, Section, Sheet, TextField } from '../ui';
import { episodeIndex, expandPlaylist, getSeries, useStore } from '../core/store';
import { player } from '../core/player';
import type { Playlist, PlaylistItem } from '../core/types';
import { useNav } from '../nav';
import { cancel, download, formatBytes, useDownloads } from '../core/downloads';
import { EpisodeRow, RowActions, TopBar, plural } from './shared';

const HOLD_MS = 500;

/** Card layout: Fave is the big card, Listen later runs full width. */
function layoutFor(i: number, total: number): string {
  if (i === 0) return ' pcover-feature';
  if (i === 3 && total > 3) return ' pcover-wide';
  return '';
}

/** Fave, Sleep, your first playlist, then Listen later full width, Offline, then the rest. */
function coverOrder(playlists: Playlist[]): Playlist[] {
  const fave = playlists.find((p) => p.builtin === 'fave');
  const sleep = playlists.find((p) => p.builtin === 'sleep');
  const later = playlists.find((p) => p.builtin === 'later');
  const offline = playlists.find((p) => p.builtin === 'offline');
  const own = playlists.filter((p) => !p.builtin);
  if (!own.length) return [fave, sleep, later, offline].filter(Boolean) as Playlist[];
  return [fave, sleep, own[0], later, offline, ...own.slice(1)].filter(Boolean) as Playlist[];
}

/** The Tapedeck covers, in the library's order. */
export const COVERS: Array<[string, string]> = [
  ['halftone', 'Halftone'], ['contour', 'Contour'], ['ridges', 'Ridges'], ['mesh', 'Mesh'], ['scanline', 'Scanline'], ['dusk', 'Dusk'], ['flames', 'Flames'],
  ['daisies', 'Daisies'], ['swirl', 'Swirl'], ['stars', 'Stars'], ['caustics', 'Caustics'], ['warp', 'Warp'], ['chrome', 'Chrome'],
  ['gridspace', 'Grid'], ['sparkle', 'Sparkle'], ['blush', 'Blush'], ['lava', 'Lava'], ['sun', 'Sun'], ['portal', 'Portal'], ['neon', 'Neon'], ['veil', 'Veil'], ['smoke', 'Smoke'], ['print', 'Print'], ['dots', 'Dots'],
];
const coverSrc = (id: string) => `/covers/${id}.jpg`;
function coverImage(pl: Pick<Playlist, 'cover' | 'photo'>): string | undefined {
  return pl.photo || (pl.cover ? coverSrc(pl.cover) : undefined);
}

export function PlaylistCover({ pl, layout = '', onOpen, onEdit }: { pl: Pick<Playlist, 'name' | 'glyph' | 'cover' | 'photo'>; layout?: string; onOpen?: () => void; onEdit?: () => void }) {
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const held = useRef(false);
  const start = () => {
    held.current = false;
    if (onEdit) timer.current = setTimeout(() => { held.current = true; onEdit(); }, HOLD_MS);
  };
  const stop = () => clearTimeout(timer.current);
  const img = coverImage(pl);
  return (
    <button
      type="button"
      className={`pcover${layout}${img ? ' pcover-photo' : ''}`}
      style={img ? { backgroundImage: `url(${img})` } : undefined}
      onPointerDown={start}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onContextMenu={(e) => { if (onEdit) { e.preventDefault(); stop(); held.current = true; onEdit(); } }}
      onClick={() => { if (!held.current) onOpen?.(); }}
    >
      <span className="pcover-icon">{pl.glyph && <PixelGlyph k={pl.glyph} />}</span>
      <h3>{pl.name || 'Untitled'}</h3>
    </button>
  );
}

export function Playlists() {
  const state = useStore();
  const push = useNav((s) => s.push);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const covers = coverOrder(state.playlists);

  return (
    <>
      <TopBar title="Playlists" big actions={<IconButton icon="plus" label="New playlist" onClick={() => setCreating(true)} />} />
      <div className="content">
        <div className="plgrid">
          {covers.map((pl, i) => (
            <PlaylistCover
              key={pl.id}
              pl={pl}
              layout={layoutFor(i, covers.length)}
              onOpen={() => push({ name: 'playlist', id: pl.id })}
              onEdit={() => setEditing(pl.id)}
            />
          ))}
        </div>
        <p className="field-hint" style={{ marginTop: 16, textAlign: 'center' }}>Tap a cover to open it, hold it to rename or change the cover.</p>
      </div>
      <PlaylistEditSheet id={editing} creating={creating} onClose={() => { setEditing(null); setCreating(false); }} onCreated={(id) => push({ name: 'playlist', id })} />
    </>
  );
}

/** Shrinks a photo to a small JPEG so it fits in the phone's storage. */
async function shrinkPhoto(file: File, max = 640): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const scale = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * scale);
    c.height = Math.round(img.height * scale);
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.82);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function PlaylistEditSheet({ id, creating, onClose, onCreated }: { id: string | null; creating?: boolean; onClose: () => void; onCreated?: (id: string) => void }) {
  const state = useStore();
  const { say, pop } = useNav();
  const pl = id ? state.playlists.find((p) => p.id === id) : undefined;
  const open = !!pl || !!creating;
  const [name, setName] = useState('');
  const [glyph, setGlyph] = useState<string | undefined>('headphone');
  const [photo, setPhoto] = useState<string | undefined>();
  const [cover, setCover] = useState<string>('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [seed, setSeed] = useState<string | null>(null);

  // load the playlist's values each time the sheet opens
  const key = open ? pl?.id || 'new' : null;
  if (key !== seed) {
    setSeed(key);
    setName(pl?.name || '');
    setGlyph(pl ? pl.glyph : 'headphone');
    setPhoto(pl?.photo);
    setCover(pl?.cover || '');
    setConfirmDelete(false);
  }

  function save() {
    if (!name.trim()) return;
    if (pl) {
      state.updatePlaylist(pl.id, { name, glyph, cover, photo });
      say('Saved');
      onClose();
    } else {
      const made = state.createPlaylist(name);
      state.updatePlaylist(made.id, { glyph, cover, photo });
      onClose();
      onCreated?.(made.id);
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title={pl ? 'Edit playlist' : 'New playlist'} tall>
      <div className="pledit-preview"><PlaylistCover pl={{ name: name || 'Untitled', glyph, cover, photo }} /></div>
      <TextField id="pl-name" label="Name" value={name} onChange={setName} placeholder="e.g. Road trips" onEnter={save} />
      <Section title="Cover">
        <div className="coverpick" role="group" aria-label="Cover">
          <button type="button" className="coverpick-plain" aria-pressed={!cover && !photo} onClick={() => { setCover(''); setPhoto(undefined); }}><span>Plain</span></button>
          {COVERS.map(([id, label]) => (
            <button key={id} type="button" aria-pressed={!photo && cover === id} aria-label={`${label} cover`} style={{ backgroundImage: `url(${coverSrc(id)})` }} onClick={() => { setCover(id); setPhoto(undefined); }}>
              <span>{label}</span>
            </button>
          ))}
        </div>
        <div className="photo-row">
          <label className="btn btn-secondary" htmlFor="pl-photo"><Icon name="plus" size={18} /><span>{photo ? 'Change your photo' : 'Upload your own photo'}</span></label>
          <input className="sr-file" type="file" accept="image/*" id="pl-photo" onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (!f) return;
            try { setPhoto(await shrinkPhoto(f)); setCover(''); } catch { say('That photo couldn’t be opened', 'error'); }
          }} />
          {photo && <Button variant="ghost" onClick={() => setPhoto(undefined)}>Remove photo</Button>}
        </div>
      </Section>
      <Section title="Mark">
        <div className="glyphpick" role="group" aria-label="Mark">
          <button type="button" className="glyphpick-none" aria-pressed={!glyph} aria-label="No mark" onClick={() => setGlyph(undefined)}>None</button>
          {Object.keys(GLYPHS).map((k) => (
            <button key={k} type="button" aria-pressed={glyph === k} aria-label={GLYPH_NAMES[k]} title={GLYPH_NAMES[k]} onClick={() => setGlyph(k)}>
              <PixelGlyph k={k} />
            </button>
          ))}
        </div>
      </Section>
      <Button variant="primary" full disabled={!name.trim()} onClick={save}>{pl ? 'Save' : 'Create playlist'}</Button>
      {pl && !pl.builtin && (confirmDelete ? (
        <Button variant="danger" full onClick={() => { const wasOpen = pl.id; onClose(); state.deletePlaylist(wasOpen); if (useNav.getState().stacks[useNav.getState().tab].some((r) => r.name === 'playlist' && r.id === wasOpen)) pop(); say('Playlist deleted'); }}>Yes, delete “{pl.name}”</Button>
      ) : (
        <Button variant="danger" full onClick={() => setConfirmDelete(true)}>Delete playlist</Button>
      ))}
      {pl?.builtin && <p className="field-hint" style={{ margin: 0, textAlign: 'center' }}>Fave, Sleep, Listen later and Offline can be renamed but not deleted.</p>}
    </Sheet>
  );
}

export function PlaylistDetail({ id }: { id: string }) {
  const state = useStore();
  const { say } = useNav();
  const pl = state.playlists.find((p) => p.id === id);
  const [menu, setMenu] = useState(false);
  const [editing, setEditing] = useState(false);

  if (!pl) return (<><TopBar title="" back /><EmptyState title="Playlist deleted" /></>);
  if (pl.builtin === 'offline') return <OfflinePlaylist pl={pl} />;

  const ids = expandPlaylist(state, pl);
  const index = episodeIndex(state.episodes);

  return (
    <>
      <TopBar
        title={pl.name}
        back
        actions={
          <>
            {pl.items.length > 0 && <Button variant="ghost" small onClick={() => setEditing(!editing)}>{editing ? 'Done' : 'Reorder'}</Button>}
            <IconButton icon="edit" label="Rename or change the cover" onClick={() => setMenu(true)} />
          </>
        }
      />
      <div className="content">
        <div className="stack">
          <p className="muted small">{plural(ids.length, 'episode')} · plays top to bottom, whole series in order</p>
          {ids.length > 0 && (
            <div className="btnrow">
              <Button variant="primary" icon="play" onClick={() => player.playList(ids)}>Play</Button>
              <Button icon="queue" onClick={() => { state.enqueue(ids); say('Added to Up Next'); }}>Add to Up Next</Button>
              <OfflineButton ids={ids} />
            </div>
          )}
          {pl.items.length === 0 && (
            <EmptyState title="Nothing here yet" body="Open a series or an episode and choose Add to playlist." />
          )}
          {pl.items.map((item, i) => (
            <PlaylistEntry
              key={i}
              item={item}
              listName={pl.name}
              editing={editing}
              ids={ids}
              onUp={() => state.movePlaylistItem(id, i, i - 1)}
              onDown={() => state.movePlaylistItem(id, i, i + 1)}
              onRemove={() => state.removeFromPlaylist(id, i)}
              index={index}
            />
          ))}
        </div>
      </div>
      <PlaylistEditSheet id={menu ? id : null} onClose={() => setMenu(false)} />
    </>
  );
}

/** Offline fills itself: every episode saved on this phone, newest save first. */
function OfflinePlaylist({ pl }: { pl: Playlist }) {
  const state = useStore();
  const { say } = useNav();
  const { saved, progress, waiting } = useDownloads();
  const [menu, setMenu] = useState(false);
  const index = episodeIndex(state.episodes);
  const ids = Object.entries(saved).filter(([id]) => index.has(id)).sort((a, b) => b[1].savedAt - a[1].savedAt).map(([id]) => id);
  const bytes = ids.reduce((n, id) => n + saved[id].bytes, 0);
  const busy = Object.keys(progress).length + waiting.length;
  return (
    <>
      <TopBar title={pl.name} back actions={<IconButton icon="edit" label="Rename or change the cover" onClick={() => setMenu(true)} />} />
      <div className="content">
        <div className="stack">
          <p className="muted small">{plural(ids.length, 'episode')}{ids.length ? ` · ${formatBytes(bytes)} on this phone` : ''} · plays without internet{busy ? ` · saving ${busy} more` : ''}</p>
          {ids.length > 0 && (
            <div className="btnrow">
              <Button variant="primary" icon="play" onClick={() => player.playList(ids)}>Play</Button>
              <Button icon="queue" onClick={() => { state.enqueue(ids); say('Added to Up Next'); }}>Add to Up Next</Button>
            </div>
          )}
          {ids.length === 0 && (
            <EmptyState title="Nothing saved yet" body="Open an episode, tap ⋯ and choose Save for offline. It will show up here." />
          )}
          {ids.length > 0 && (
            <div className="list">
              {ids.map((id) => <EpisodeRow key={id} ep={index.get(id)!} showArt list={ids} />)}
            </div>
          )}
        </div>
      </div>
      <PlaylistEditSheet id={menu ? pl.id : null} onClose={() => setMenu(false)} />
    </>
  );
}

/** Save a whole playlist for offline, and show how far along it is. */
function OfflineButton({ ids }: { ids: string[] }) {
  const { saved, progress, waiting } = useDownloads();
  const say = useNav((s) => s.say);
  const done = ids.filter((id) => saved[id]).length;
  const busy = ids.filter((id) => progress[id] !== undefined || waiting.includes(id));
  if (busy.length) {
    return <Button icon="close" onClick={() => busy.forEach(cancel)}>Saving {done + 1} of {ids.length} · Stop</Button>;
  }
  if (done === ids.length) return <Button icon="check" disabled>Saved offline</Button>;
  return (
    <Button icon="download" onClick={() => { download(ids); say(`Saving ${ids.length - done} episodes for offline`); }}>
      {done ? `Save the other ${ids.length - done}` : 'Save for offline'}
    </Button>
  );
}

function PlaylistEntry(props: {
  item: PlaylistItem;
  listName: string;
  editing: boolean;
  ids: string[];
  index: Map<string, import('../core/types').Episode>;
  onUp: () => void;
  onDown: () => void;
  onRemove: () => void;
}) {
  const state = useStore();
  const push = useNav((s) => s.push);
  const say = useNav((s) => s.say);
  const remove = () => { props.onRemove(); say(`Removed from ${props.listName}`); };
  const removeBtn = <span className="dismiss-slot"><IconButton icon="close" label={`Remove from ${props.listName}`} onClick={remove} /></span>;
  const edit = props.editing && (
    <div className="editctl">
      <IconButton icon="up" label="Move up" onClick={props.onUp} />
      <IconButton icon="down" label="Move down" onClick={props.onDown} />
    </div>
  );

  if (props.item.kind === 'episode') {
    const ep = props.index.get(props.item.episodeId);
    if (!ep) return null;
    return (
      <div className="list">
        <EpisodeRow ep={ep} showArt list={props.ids} onDismiss={remove} dismissLabel={`Remove from ${props.listName}`} />
        {edit}
      </div>
    );
  }
  if (props.item.kind === 'podcast') {
    const pod = state.podcasts.find((p) => p.id === (props.item as { podcastId: string }).podcastId);
    if (!pod) return null;
    const unplayed = (state.episodes[pod.id] || []).filter((e) => !state.progress[e.id]?.played).map((e) => e.id);
    return (
      <div className="list">
        <ListRow
          leading={<Artwork src={pod.image} alt={pod.title} size={48} />}
          title={pod.title}
          subtitle="Whole show · newest unplayed first"
          meta={<span>{unplayed.length ? plural(unplayed.length, 'unplayed episode') : 'All listened'}</span>}
          done={!unplayed.length}
          onClick={() => push({ name: 'podcast', id: pod.id })}
          trailing={
            <RowActions
              what="the whole show"
              listened={!unplayed.length}
              onToggle={() => {
                const all = (state.episodes[pod.id] || []).map((e) => e.id);
                state.setPlayedMany(unplayed.length ? unplayed : all, !!unplayed.length);
                say(unplayed.length ? `${pod.title}: all marked as listened` : `${pod.title}: marked as not listened`);
              }}
              onPlay={() => player.playList(unplayed)}
              before={removeBtn}
            />
          }
        />
        {edit}
      </div>
    );
  }
  const { podcastId, seriesKey } = props.item;
  const series = getSeries(state, podcastId).find((s) => s.key === seriesKey);
  const podcast = state.podcasts.find((p) => p.id === podcastId);
  if (!series) return null;
  const played = series.episodeIds.filter((i) => state.progress[i]?.played).length;
  return (
    <div className="list">
      <ListRow
        leading={<Artwork src={podcast?.image} alt={podcast?.title || series.name} size={48} />}
        title={series.name}
        subtitle={`Series · ${podcast?.title || ''}`}
        meta={<span>{plural(series.episodeIds.length, 'episode')}{played ? ` · ${played} played` : ''}</span>}
        done={played === series.episodeIds.length}
        onClick={() => push({ name: 'series', podcastId, key: seriesKey })}
        trailing={
          <RowActions
            what="the whole series"
            listened={played === series.episodeIds.length}
            onToggle={() => state.setPlayedMany(series.episodeIds, played !== series.episodeIds.length)}
            onPlay={() => player.playList(series.episodeIds)}
            before={removeBtn}
          />
        }
      />
      {edit}
    </div>
  );
}

export function PlaylistPicker() {
  const state = useStore();
  const { playlistPicker: item, pickPlaylist, say } = useNav();
  const [name, setName] = useState('');
  const close = () => pickPlaylist(null);
  let label = '';
  if (item?.kind === 'series') label = getSeries(state, item.podcastId).find((s) => s.key === item.seriesKey)?.name || '';
  if (item?.kind === 'episode') label = episodeIndex(state.episodes).get(item.episodeId)?.title || '';
  if (item?.kind === 'podcast') label = state.podcasts.find((p) => p.id === item.podcastId)?.title || '';

  return (
    <Sheet open={!!item} onClose={close} title="Add to playlist">
      <p className="muted small">{label}</p>
      {state.playlists.length > 0 && (
        <div className="menu">
          {state.playlists.filter((pl) => pl.builtin !== 'offline').map((pl) => (
            <MenuItem key={pl.id} icon="playlist" onClick={() => { state.addToPlaylist(pl.id, item!); close(); say(`Added to ${pl.name}`); }}>
              {pl.name}
            </MenuItem>
          ))}
        </div>
      )}
      <div className="inline-form">
        <TextField id="picker-new" value={name} onChange={setName} placeholder={item?.kind === 'series' ? label || 'New playlist' : 'New playlist'} onEnter={createAndAdd} />
        <Button variant="primary" onClick={createAndAdd}>Create</Button>
      </div>
    </Sheet>
  );

  function createAndAdd() {
    if (!item) return;
    const pl = state.createPlaylist(name.trim() || label || 'New playlist', [item]);
    setName('');
    close();
    say(`Created ${pl.name}`);
  }
}
