// Dark (Chill Black) or light. The choice is saved with the settings, and a quick copy is kept
// so the right look shows from the first moment the app opens.
const KEY = 'tapedeck-theme';
const BAR = { dark: '#222222', light: '#f3f1f8' };

export function rememberedTheme(): 'dark' | 'light' {
  try { return localStorage.getItem(KEY) === 'light' ? 'light' : 'dark'; } catch { return 'dark'; }
}

export function applyTheme(theme: 'dark' | 'light' | undefined) {
  const t = theme === 'light' ? 'light' : 'dark';
  document.documentElement.dataset.theme = t;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', BAR[t]);
  try { localStorage.setItem(KEY, t); } catch { /* private mode: fine, the saved setting still applies */ }
}
