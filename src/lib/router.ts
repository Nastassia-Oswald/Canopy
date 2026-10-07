import { useEffect, useState } from 'react';

export type Route = 'setup' | 'trip' | 'fuel' | 'rest' | 'food' | 'stay' | 'saved' | 'map' | 'sources';
const ROUTES: Route[] = ['setup', 'trip', 'fuel', 'rest', 'food', 'stay', 'saved', 'map', 'sources'];

function read(): Route {
  const r = window.location.hash.replace(/^#\/?/, '') as Route;
  return ROUTES.includes(r) ? r : 'setup';
}

export function go(r: Route) {
  if (read() !== r) window.location.hash = `/${r}`;
  window.scrollTo({ top: 0 });
}

export function useRoute(): Route {
  const [r, setR] = useState<Route>(read);
  useEffect(() => {
    const on = () => setR(read());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return r;
}
