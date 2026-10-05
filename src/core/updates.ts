// Keeping the installed app up to date. iPhones often resume a home-screen app without reloading it,
// so the usual "new version" check never runs. This checks /version.json itself and, when a newer
// version is live, swaps it in. Your library is stored separately and is never touched.
import { create } from 'zustand';
import { APP_VERSION } from '../version';

export const useUpdates = create<{ available: string | null; checking: boolean }>()(() => ({ available: null, checking: false }));

let swRegistration: ServiceWorkerRegistration | undefined;
export function setRegistration(r: ServiceWorkerRegistration | undefined) {
  swRegistration = r;
}

/** Asks the server which version is live. Returns true when it's newer than this one. */
export async function checkForUpdate(): Promise<boolean> {
  useUpdates.setState({ checking: true });
  try {
    void swRegistration?.update().catch(() => undefined);
    const r = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!r.ok) return false;
    const { version } = (await r.json()) as { version?: string };
    const newer = !!version && version !== APP_VERSION;
    useUpdates.setState({ available: newer ? version! : null });
    return newer;
  } catch {
    return false;
  } finally {
    useUpdates.setState({ checking: false });
  }
}

/** Throws away the old saved copy of the app (not your library) and loads the new one. */
export async function applyUpdate() {
  try {
    const regs = (await navigator.serviceWorker?.getRegistrations()) || [];
    await Promise.all(regs.map((r) => r.unregister()));
    const keys = (await caches?.keys()) || [];
    // keep cached artwork; drop the app's own files
    await Promise.all(keys.filter((k) => k !== 'artwork').map((k) => caches.delete(k)));
  } catch {
    /* reload anyway */
  }
  location.replace(`/?v=${Date.now()}`);
}

export function watchForUpdates() {
  void checkForUpdate();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void checkForUpdate();
  });
  setInterval(() => void checkForUpdate(), 30 * 60 * 1000);
}
