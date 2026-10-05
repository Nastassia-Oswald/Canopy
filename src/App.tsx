import type React from 'react';
import { useEffect } from 'react';
import { Icon, Toast, type IconName } from './ui';
import { useStore } from './core/store';
import { useNav, type Tab } from './nav';
import { Topics, TopicScreen } from './screens/Topics';
import { PodcastScreen } from './screens/Podcast';
import { SeriesDetail, SeriesList } from './screens/Series';
import { PlaylistDetail, PlaylistPicker, Playlists } from './screens/Playlists';
import { Queue } from './screens/Queue';
import { Settings } from './screens/Settings';
import { Today } from './screens/Today';
import { AddPodcastSheet } from './screens/AddPodcast';
import { EpisodeSheet, MiniPlayer, NowPlaying } from './screens/Player';
import { applyUpdate, useUpdates } from './core/updates';

/** A new version is live: one tap to load it. */
function UpdateBanner() {
  const available = useUpdates((s) => s.available);
  if (!available) return null;
  return (
    <button type="button" className="update-banner" onClick={() => void applyUpdate()}>
      <span>Tapedeck {available} is ready</span>
      <b>Update</b>
    </button>
  );
}

// Playlists, Topics and Settings sit on the left as bare icons; Today is the round metal button on the right.
const TABS: Array<{ id: Tab; label: string; icon: IconName }> = [
  { id: 'playlists', label: 'Playlists', icon: 'playlist' },
  { id: 'topics', label: 'Topics', icon: 'topics' },
  { id: 'settings', label: 'Settings', icon: 'settings' },
  { id: 'today', label: 'Today', icon: 'today' },
];

const ROOTS: Record<Tab, () => React.JSX.Element> = {
  playlists: Playlists,
  topics: Topics,
  settings: Settings,
  today: Today,
};

export default function App() {
  const ready = useStore((s) => s.ready);
  const { tab, stacks, setTab, toast, toastTone } = useNav();
  const route = stacks[tab][stacks[tab].length - 1];

  useEffect(() => {
    document.querySelector('.content')?.scrollTo(0, 0);
  }, [tab, route]);

  if (!ready) return null;

  const Root = ROOTS[tab];
  let screen = <Root />;
  if (route?.name === 'topic') screen = <TopicScreen key={String(route.id)} id={route.id} />;
  if (route?.name === 'allseries') screen = <SeriesList />;
  if (route?.name === 'queue') screen = <Queue />;
  if (route?.name === 'podcast') screen = <PodcastScreen key={route.id} id={route.id} />;
  if (route?.name === 'series') screen = <SeriesDetail key={route.podcastId + route.key} podcastId={route.podcastId} seriesKey={route.key} />;
  if (route?.name === 'playlist') screen = <PlaylistDetail key={route.id} id={route.id} />;

  return (
    <div className="app">
      {screen}
      <MiniPlayer />
      <nav className="tabbar" aria-label="Main">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`tab${t.id === 'today' ? ' tab-today' : ''}${t.id === tab ? ' tab-on' : ''}`}
            onClick={() => setTab(t.id)}
            aria-current={t.id === tab ? 'page' : undefined}
          >
            <Icon name={t.icon} size={t.id === 'today' ? 24 : 26} />
            <span>{t.label}</span>
          </button>
        ))}
      </nav>
      <NowPlaying />
      <AddPodcastSheet />
      <EpisodeSheet />
      <PlaylistPicker />
      <Toast message={toast} tone={toastTone} />
      <UpdateBanner />
    </div>
  );
}
