import { useState } from 'react';
import { Artwork, Button, Chip, ChipRow, ListRow, Section, Segmented, Sheet, Spinner, TextField } from '../ui';
import { useStore } from '../core/store';
import { isPatreonUrl } from '../core/rss';
import { useNav } from '../nav';

interface Result {
  title: string;
  author: string;
  feedUrl: string;
  image: string;
  genre: string;
}

type Mode = 'search' | 'link';

export function AddPodcastSheet() {
  const { addSheet, openAdd, push, say } = useNav();
  const state = useStore();
  const [mode, setMode] = useState<Mode>('search');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Result[] | null>(null);
  const [url, setUrl] = useState('');
  const [cats, setCats] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    openAdd(false);
    setError(null);
  };

  async function search() {
    const q = query.trim();
    if (!q) return;
    setBusy('search');
    setError(null);
    try {
      const base = state.settings.proxyUrl.replace(/\/$/, '');
      const r = await fetch(`${base}?q=${encodeURIComponent(q)}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Search is unavailable right now.');
      setResults(j.results);
    } catch (e) {
      setError((e as Error).message || 'Search is unavailable right now. Paste the RSS link instead.');
    } finally {
      setBusy(null);
    }
  }

  async function add(feedUrl: string) {
    setBusy(feedUrl);
    setError(null);
    try {
      const existing = state.podcasts.find((p) => p.feedUrl === feedUrl.trim());
      const p = await state.addPodcast(feedUrl, cats);
      close();
      setUrl('');
      setQuery('');
      setResults(null);
      setCats([]);
      say(existing ? `${p.title} is already in your library` : `Added ${p.title}`);
      push({ name: 'podcast', id: p.id });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const toggleCat = (id: string) => setCats((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));

  return (
    <Sheet open={addSheet} onClose={close} title="Add podcast" tall>
      <Segmented<Mode>
        value={mode}
        onChange={(m) => { setMode(m); setError(null); }}
        options={[
          { value: 'search', label: 'Search' },
          { value: 'link', label: 'RSS or Patreon link' },
        ]}
      />

      <Section title="Category">
        <ChipRow>
          {state.categories.map((c) => (
            <Chip key={c.id} selected={cats.includes(c.id)} onClick={() => toggleCat(c.id)}>{c.name}</Chip>
          ))}
        </ChipRow>
        <p className="muted small">Optional. If you skip it, Tapedeck suggests one from the feed.</p>
      </Section>

      {error && <p className="error" role="alert">{error}</p>}

      {mode === 'search' ? (
        <>
          <div className="inline-form">
            <TextField id="add-search" type="search" value={query} onChange={setQuery} placeholder="e.g. Revolutions, Lions Led by Donkeys" onEnter={search} autoFocus />
            <Button variant="primary" onClick={search} disabled={!query.trim() || busy === 'search'}>
              {busy === 'search' ? <Spinner /> : 'Search'}
            </Button>
          </div>
          {results && (
            <div className="list">
              {results.length === 0 && <p className="muted small" style={{ padding: 12, margin: 0 }}>No podcasts found. Try the RSS link instead.</p>}
              {results.map((r) => {
                const have = state.podcasts.some((p) => p.feedUrl === r.feedUrl);
                return (
                  <ListRow
                    key={r.feedUrl}
                    leading={<Artwork src={r.image} alt={r.title} size={52} />}
                    title={r.title}
                    subtitle={r.author}
                    meta={<span>{r.genre}</span>}
                    trailing={
                      busy === r.feedUrl ? <span className="iconbtn"><Spinner /></span> :
                      <Button small variant={have ? 'secondary' : 'primary'} disabled={have || !!busy} onClick={() => add(r.feedUrl)}>
                        {have ? 'Added' : 'Add'}
                      </Button>
                    }
                  />
                );
              })}
            </div>
          )}
        </>
      ) : (
        <>
          <TextField
            id="add-url"
            type="url"
            label="RSS link"
            value={url}
            onChange={setUrl}
            placeholder="https://…"
            onEnter={() => url.trim() && add(url)}
            autoFocus
            hint={isPatreonUrl(url) ? 'Patreon link recognised. It is private to you: don’t share it.' : undefined}
          />
          <Button variant="primary" full disabled={!url.trim() || !!busy} onClick={() => add(url)}>
            {busy ? <Spinner /> : 'Add podcast'}
          </Button>
          <details className="help">
            <summary>How to get your Patreon RSS link</summary>
            <ol>
              <li>In the Patreon app or website, open the creator’s page (for example Lions Led by Donkeys).</li>
              <li>Tap <b>More</b>, then <b>Add to podcast app</b>. On the website: <b>More → Your membership → Listen in other podcast apps → Other podcast apps</b>.</li>
              <li>Choose <b>Copy</b>. On Android the link is copied straight away.</li>
              <li>Come back here and paste it above.</li>
            </ol>
            <p>The link contains a personal key, so episodes stay tied to your membership. If you cancel or the link changes, paste the new one in the podcast’s settings.</p>
          </details>
        </>
      )}
    </Sheet>
  );
}
