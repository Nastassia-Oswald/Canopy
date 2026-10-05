import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import './ui/tokens.css';
import './ui/ui.css';
import './screens/screens.css';
import App from './App';
import { loadStore, useStore } from './core/store';
import { applySeeds } from './core/seeds';
import { loadDownloads } from './core/downloads';
import { restorePlayer } from './core/player';
import { setRegistration, watchForUpdates } from './core/updates';
import { applyTheme, rememberedTheme } from './core/theme';

// the look is applied before the first paint, from the phone's quick copy of the setting
applyTheme(rememberedTheme());
useStore.subscribe((s, prev) => { if (s.settings.theme !== prev.settings.theme) applyTheme(s.settings.theme); });

// Listen later tidies itself: an episode leaves it once it's finished.
useStore.subscribe((s, prev) => {
  if (s.progress === prev.progress) return;
  const later = s.playlists.find((p) => p.builtin === 'later');
  if (!later?.items.some((it) => it.kind === 'episode' && s.progress[it.episodeId]?.played)) return;
  useStore.setState({ playlists: s.playlists.map((p) => (p !== later ? p : { ...p, items: p.items.filter((it) => !(it.kind === 'episode' && s.progress[it.episodeId]?.played)) })) });
});

registerSW({ immediate: true, onRegisteredSW: (_url, r) => setRegistration(r) });
watchForUpdates();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

Promise.all([loadStore(), loadDownloads()]).then(() => {
  applyTheme(useStore.getState().settings.theme);
  restorePlayer();
  // Pick up new episodes when the app opens, if the last check was over 30 minutes ago.
  const s = useStore.getState();
  const stale = s.podcasts.some((p) => Date.now() - p.lastFetched > 30 * 60 * 1000);
  if (stale) s.refreshAll().then(applySeeds);
  else applySeeds();
});
