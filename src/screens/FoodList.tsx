import { useEffect } from 'react';
import { Clock, MapPin, Utensils } from 'lucide-react';
import { AddButton, ErrorState, Header, IconCircle, Loading, NavBar, NoRoute, SavedButton, Warnings } from '../components/ui.tsx';
import { cuisineLabel, mapsUrl, offRoute } from '../lib/format.ts';
import { useStore } from '../lib/store.tsx';

export function FoodList() {
  const { route, places, loadPlaces, toggleSaved, isSaved } = useStore();
  const state = places.food;
  useEffect(() => loadPlaces('food'), [loadPlaces]);

  if (!route) return <main className="screen"><NoRoute /></main>;
  const pois = state?.data?.pois ?? [];

  return (
    <>
      <main className="screen">
        <Header title="Food stops" sub={`${route.from.name} → ${route.to.name}`} back="trip" right={<SavedButton />} />
        <Warnings warnings={state?.data?.meta.warnings} demo={route.demo} />
        {state?.loading && !state.data && <Loading label="Finding cafés and restaurants near the route…" />}
        {state?.error && !state.data && <ErrorState message={`Couldn’t load food stops. ${state.error}`} onRetry={() => loadPlaces('food', true)} />}
        {state?.data && pois.length === 0 && <div className="empty">No food stops found near this route.</div>}
        <div className="list">
          {pois.slice(0, 80).map((p) => {
            const tags = [...(p.facts.cuisine ?? []).slice(0, 2).map(cuisineLabel), ...(p.facts.vegetarian ? ['Vegetarian'] : [])];
            return (
              <article key={p.id} className="card">
                <div className="card-head">
                  <IconCircle icon={Utensils} />
                  <div>
                    <div className="t-name">{p.name}</div>
                    <div className="t-meta">{[p.facts.city, `${Math.round(p.kmAlong)} km`, offRoute(p.offRouteKm)].filter(Boolean).join(' · ')}</div>
                  </div>
                </div>
                {tags.length > 0 && (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '14px 0 0' }}>
                    {tags.map((t) => <div key={t} className="badge">{t}</div>)}
                  </div>
                )}
                {p.facts.openingHours && (
                  <div className="t-meta" style={{ display: 'flex', gap: 4, alignItems: 'center', marginTop: 10 }}>
                    <Clock size={10} />{p.facts.openingHours}
                  </div>
                )}
                <div className="card-foot" style={{ marginTop: 6 }}>
                  <a className="link" href={mapsUrl(p.lat, p.lng)} target="_blank" rel="noreferrer"><MapPin size={11} />Google Maps</a>
                  <AddButton
                    saved={isSaved(p.id)}
                    label={p.name}
                    onClick={() => toggleSaved({ id: p.id, kind: 'food', name: p.name, subtitle: `Food${p.facts.city ? ` · ${p.facts.city}` : ''}`, lat: p.lat, lng: p.lng, kmAlong: p.kmAlong, offRouteKm: p.offRouteKm })}
                  />
                </div>
              </article>
            );
          })}
        </div>
        <div className="scroll-pad" />
      </main>
      <div className="bottom"><NavBar active="food" /></div>
    </>
  );
}
