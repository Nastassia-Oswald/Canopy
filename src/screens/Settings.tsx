import { useRef, useState } from 'react';
import { Artwork, Badge, Button, Chip, ChipRow, Glyph, Icon, IconButton, ListRow, Section, Segmented, Sheet, TextField, Toggle } from '../ui';
import { useStore } from '../core/store';
import { player } from '../core/player';
import { isPatreonUrl } from '../core/rss';
import { useNav } from '../nav';
import { APP_VERSION } from '../version';
import { applyUpdate, checkForUpdate, useUpdates } from '../core/updates';
import { formatBytes, removeDownload, useDownloads } from '../core/downloads';
import { episodeIndex } from '../core/store';
import { EpisodeRow, TopBar, plural } from './shared';

export function Settings() {
  const state = useStore();
  const say = useNav((s) => s.say);
  const [proxy, setProxy] = useState(state.settings.proxyUrl);
  const [busy, setBusy] = useState<string | null>(null);
  const [failedImports, setFailedImports] = useState<string[]>([]);
  const [topicsOpen, setTopicsOpen] = useState(false);
  const [patreonOpen, setPatreonOpen] = useState(false);
  const [offlineOpen, setOfflineOpen] = useState(false);
  const updates = useUpdates();
  const saved = useDownloads((s) => s.saved);
  const savedIds = Object.keys(saved);
  const savedBytes = Object.values(saved).reduce((n, x) => n + x.bytes, 0);
  const backupInput = useRef<HTMLInputElement>(null);
  const opmlInput = useRef<HTMLInputElement>(null);
  const patreonCount = state.podcasts.filter((p) => p.isPatreon).length;

  async function downloadBackup() {
    const json = await state.exportBackup();
    const blob = new Blob([json], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `tapedeck-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  const skipBack = String(state.settings.skipBack) as '10' | '15' | '30';
  const skipFwd = String(state.settings.skipForward) as '15' | '30' | '45';

  return (
    <>
      <TopBar title="Settings" big />
      <div className="content">
        <Section title="Look">
          <Segmented
            value={state.settings.theme || 'dark'}
            onChange={(v) => state.updateSettings({ theme: v })}
            options={[{ value: 'dark', label: 'Dark' }, { value: 'light', label: 'Light' }]}
          />
        </Section>

        <Section title="Playback">
          <div className="list" style={{ padding: '0 14px' }}>
            <Toggle id="st-next" label="Continue with the next part" checked={state.settings.autoplayNext} onChange={(v) => state.updateSettings({ autoplayNext: v })} />
            <Toggle id="st-hide" label="Hide played episodes" checked={state.settings.hidePlayed} onChange={(v) => state.updateSettings({ hidePlayed: v })} />
          </div>
        </Section>

        <Section title="Offline">
          <div className="list">
            <ListRow
              leading={<span className="art settings-icon"><Icon name="download" size={20} /></span>}
              title="Saved on this phone"
              subtitle={savedIds.length ? `${plural(savedIds.length, 'episode')} · ${formatBytes(savedBytes)}` : 'Nothing saved yet'}
              onClick={() => setOfflineOpen(true)}
              trailing={<IconButton icon="chevron" label="Saved on this phone" onClick={() => setOfflineOpen(true)} />}
            />
          </div>
          <div className="list" style={{ padding: '0 14px' }}>
            <Toggle id="st-dl" label="Delete once finished" checked={state.settings.deleteFinishedDownloads} onChange={(v) => state.updateSettings({ deleteFinishedDownloads: v })} />
          </div>
          <p className="field-hint" style={{ margin: 0 }}>Save an episode from its ⋯ menu, or a whole playlist with Save for offline. Keep Tapedeck open while it saves.</p>
        </Section>

        <Section title="Volume boost">
          <Segmented
            value={String(state.settings.boost) as '0' | '1' | '2'}
            onChange={(v) => player.setBoost(Number(v) as 0 | 1 | 2)}
            options={[{ value: '0', label: 'Off' }, { value: '1', label: 'Boost' }, { value: '2', label: 'Max' }]}
          />
          <p className="field-hint" style={{ margin: 0 }}>For quiet shows: makes voices louder than your phone’s maximum. A few hosts don’t allow it; their shows play at normal volume.</p>
        </Section>

        <Section title="Skip back">
          <Segmented
            value={['10', '15', '30'].includes(skipBack) ? skipBack : '15'}
            onChange={(v) => state.updateSettings({ skipBack: Number(v) })}
            options={[{ value: '10', label: '10 s' }, { value: '15', label: '15 s' }, { value: '30', label: '30 s' }]}
          />
        </Section>
        <Section title="Skip forward">
          <Segmented
            value={['15', '30', '45'].includes(skipFwd) ? skipFwd : '30'}
            onChange={(v) => state.updateSettings({ skipForward: Number(v) })}
            options={[{ value: '15', label: '15 s' }, { value: '30', label: '30 s' }, { value: '45', label: '45 s' }]}
          />
        </Section>

        <Section title="Patreon">
          <div className="list">
            <ListRow
              leading={<span className="art settings-icon"><Icon name="link" size={20} /></span>}
              title="Your Patreon feeds"
              subtitle={patreonCount ? `${plural(patreonCount, 'private feed')} linked` : 'Bonus episodes from your memberships'}
              onClick={() => setPatreonOpen(true)}
              trailing={<IconButton icon="chevron" label="Your Patreon feeds" onClick={() => setPatreonOpen(true)} />}
            />
          </div>
        </Section>

        <Section title="Your library">
          <div className="btnrow">
            <Button small icon="down" onClick={downloadBackup}>Save backup</Button>
            <Button small icon="up" onClick={() => backupInput.current?.click()}>Restore</Button>
            <Button small icon="plus" onClick={() => opmlInput.current?.click()} disabled={!!busy}>{busy || 'Import OPML'}</Button>
          </div>
          <p className="field-hint" style={{ margin: 0 }}>
            Your shows, topics and progress are saved on this phone only. OPML files from other apps bring their folders across as topics.
          </p>
          {failedImports.length > 0 && (
            <details className="help">
              <summary>{plural(failedImports.length, 'show')} couldn’t be loaded</summary>
              <ul>{failedImports.map((f) => <li key={f}>{f}</li>)}</ul>
              <p>Their feeds may have moved or be down for now. Try adding them by name.</p>
            </details>
          )}
          <input ref={backupInput} id="restore-file" type="file" accept="application/json,.json" hidden onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            try { await state.importBackup(await f.text()); say('Backup restored'); } catch (err) { say((err as Error).message, 'error'); }
            e.target.value = '';
          }} />
          <input ref={opmlInput} id="opml-file" type="file" hidden onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            setBusy('Reading file…');
            try {
              const { added, failed } = await state.importOpml(await f.text(), (done, total) => setBusy(`Importing ${done} of ${total}…`));
              setFailedImports(failed);
              say(`Added ${plural(added, 'show')}${failed.length ? `, ${failed.length} couldn't be loaded` : ''}`);
            } catch (err) { say((err as Error).message, 'error'); }
            setBusy(null);
            e.target.value = '';
          }} />
        </Section>

        <Section title="Topics" action={<Button variant="ghost" small onClick={() => setTopicsOpen(true)}>Edit</Button>}>
          <ChipRow>
            {state.categories.map((c) => (
              <Chip key={c.id} onClick={() => setTopicsOpen(true)}>{c.name}</Chip>
            ))}
          </ChipRow>
        </Section>

        <Section title="Feed proxy">
          <TextField
            id="proxy-url"
            value={proxy}
            onChange={setProxy}
            hint="Leave as /api/proxy when the app is on Vercel. Change it only if you run the proxy somewhere else."
          />
          {proxy !== state.settings.proxyUrl && proxy.trim() && (
            <Button small onClick={() => { state.updateSettings({ proxyUrl: proxy.trim() }); say('Saved'); }}>Save</Button>
          )}
        </Section>
        <Section title="App">
          <div className="btnrow" style={{ alignItems: 'center' }}>
            <Button small icon="refresh" disabled={updates.checking} onClick={async () => {
              if (updates.available || (await checkForUpdate())) void applyUpdate();
              else say('You’re on the latest version');
            }}>{updates.checking ? 'Checking…' : updates.available ? `Update to ${updates.available}` : 'Check for updates'}</Button>
            <span className="field-hint">Tapedeck {APP_VERSION}</span>
          </div>
        </Section>
      </div>
      <TopicsSheet open={topicsOpen} onClose={() => setTopicsOpen(false)} />
      <PatreonSheet open={patreonOpen} onClose={() => setPatreonOpen(false)} />
      <Sheet open={offlineOpen} onClose={() => setOfflineOpen(false)} title="Saved offline" tall>
        {savedIds.length ? (
          <>
            <p className="muted small" style={{ margin: 0 }}>{plural(savedIds.length, 'episode')} · {formatBytes(savedBytes)} on this phone. They play without internet.</p>
            <div className="list">
              {savedIds
                .map((id) => episodeIndex(state.episodes).get(id))
                .filter((e): e is NonNullable<typeof e> => !!e)
                .map((e) => <EpisodeRow key={e.id} ep={e} showArt />)}
            </div>
            <Button variant="danger" full icon="trash" onClick={() => { void removeDownload(savedIds); say('Offline copies removed'); }}>Remove all offline copies</Button>
          </>
        ) : (
          <p className="muted small" style={{ margin: 0 }}>Nothing saved yet. Open an episode’s ⋯ menu and choose Save for offline, or save a whole playlist from its page.</p>
        )}
      </Sheet>
    </>
  );
}

function TopicsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const state = useStore();
  const say = useNav((s) => s.say);
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [newCat, setNewCat] = useState('');
  const counts = (id: string) => state.podcasts.filter((p) => p.categoryIds.includes(id)).length;
  const add = () => {
    if (!newCat.trim()) return;
    state.addCategory(newCat);
    setNewCat('');
  };

  return (
    <Sheet open={open} onClose={onClose} title="Topics" tall>
      <p className="muted small">Tap a topic to rename it. The moon keeps a topic’s shows out of Today’s round-up and new episodes.</p>
      <div className="list">
        {state.categories.map((c) =>
          editing === c.id ? (
            <div key={c.id} className="row inline-form" style={{ padding: 8 }}>
              <TextField id={`cat-${c.id}`} value={name} onChange={setName} autoFocus onEnter={() => { state.renameCategory(c.id, name); setEditing(null); }} />
              <Button variant="primary" small onClick={() => { state.renameCategory(c.id, name); setEditing(null); }}>Save</Button>
            </div>
          ) : (
            <ListRow
              key={c.id}
              leading={<span className="art settings-icon"><Glyph id={c.id} name={c.name} className="tglyph tglyph-s" /></span>}
              title={c.name}
              meta={<><span>{plural(counts(c.id), 'show')}</span>{c.hideFromToday && <Badge>Not in Today</Badge>}</>}
              onClick={() => { setEditing(c.id); setName(c.name); }}
              trailing={
                <>
                  <IconButton
                    icon={c.hideFromToday ? 'moon' : 'today'}
                    label={c.hideFromToday ? `Show ${c.name} in Today` : `Keep ${c.name} out of Today`}
                    onClick={() => { state.setCategoryHidden(c.id, !c.hideFromToday); say(c.hideFromToday ? `${c.name} shows in Today again` : `${c.name} kept out of Today`); }}
                  />
                  <IconButton icon="trash" label={`Delete ${c.name}`} onClick={() => { state.deleteCategory(c.id); say(`Deleted ${c.name}`); }} />
                </>
              }
            />
          ),
        )}
      </div>
      <div className="inline-form">
        <TextField id="new-cat" label="New topic" value={newCat} onChange={setNewCat} placeholder="e.g. Folklore" onEnter={add} />
        <Button onClick={add} disabled={!newCat.trim()}>Add</Button>
      </div>
    </Sheet>
  );
}

function PatreonSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const state = useStore();
  const { say, push } = useNav();
  const [url, setUrl] = useState('');
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const feeds = state.podcasts.filter((p) => p.isPatreon).sort((a, b) => a.title.localeCompare(b.title));

  async function add() {
    if (!url.trim()) return;
    setAdding(true);
    setError(null);
    try {
      const p = await state.addPodcast(url.trim());
      setUrl('');
      say(`Added ${p.title}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setAdding(false);
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title="Patreon" tall>
      <p className="muted small">
        Each creator gives you a private feed link that carries your membership. Paste it here and bonus episodes arrive with the rest, marked Patreon.
      </p>
      {feeds.length > 0 && (
        <div className="list">
          {feeds.map((p) => (
            <ListRow
              key={p.id}
              leading={<Artwork src={p.image} alt={p.title} size={40} />}
              title={p.title}
              meta={<Badge tone="patreon">Patreon</Badge>}
              onClick={() => { onClose(); push({ name: 'podcast', id: p.id }); }}
            />
          ))}
        </div>
      )}
      {error && <p className="error" role="alert">{error}</p>}
      <TextField
        id="patreon-url"
        type="url"
        label="Private feed link"
        value={url}
        onChange={setUrl}
        placeholder="https://www.patreon.com/rss/…"
        onEnter={add}
        hint={url && !isPatreonUrl(url) ? 'This doesn’t look like a Patreon link, but it will still be added as a normal feed.' : 'Keep it to yourself: the link works as your login.'}
      />
      <Button variant="primary" full icon="plus" disabled={!url.trim() || adding} onClick={add}>{adding ? 'Adding…' : 'Add Patreon feed'}</Button>
      <details className="help">
        <summary>Where to find your link</summary>
        <ol>
          <li>In the Patreon app or website, open the creator’s page.</li>
          <li>Tap <b>More</b>, then <b>Add to podcast app</b>. On the website: <b>More → Your membership → Listen in other podcast apps → Other podcast apps</b>.</li>
          <li>Choose <b>Copy</b> and paste it above.</li>
        </ol>
      </details>
    </Sheet>
  );
}
