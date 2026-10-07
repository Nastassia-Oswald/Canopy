import { useEffect, useState } from 'react';
import { Accessibility, Bed, ExternalLink, MapPin, SquareParking, Wifi } from 'lucide-react';
import { AddButton, ErrorState, Header, IconCircle, Loading, NavBar, NoRoute, SavedButton, Stars, Warnings } from '../components/ui.tsx';
import { bookingUrl, mapsUrl } from '../lib/format.ts';
import { useStore } from '../lib/store.tsx';

export function StayList() {
  const { route, places, loadPlaces, nightKm, setNightKm, toggleSaved, isSaved } = useStore();
  const state = places.hotel;
  const night = Math.round(nightKm ?? (route ? route.distanceKm * 0.6 : 0));
  const [draft, setDraft] = useState(night);

  useEffect(() => setDraft(night), [night]);
  useEffect(() => loadPlaces('hotel'), [loadPlaces]);

  if (!route) return <main className="screen"><NoRoute /></main>;
  const pois = state?.data?.pois ?? [];

  return (
    <>
      <main className="screen">
        <Header title="Stay" sub={`Night near km ${draft} of ${route.distanceKm}`} back="trip" right={<SavedButton />} />
        <label className="t-cap section-cap" htmlFor="night">Where do you want to stop?</label>
        <input
          id="night"
          type="range"
          min={20}
          max={Math.max(40, route.distanceKm - 20)}
          step={5}
          value={draft}
          onChange={(e) => setDraft(Number(e.target.value))}
          onPointerUp={() => setNightKm(draft)}
          onKeyUp={() => setNightKm(draft)}
          style={{ width: '100%', accentColor: '#221C21' }}
        />
        <Warnings warnings={state?.data?.meta.warnings} demo={route.demo} />
        {state?.loading && <Loading label="Finding places to stay on OpenStreetMap…" rows={2} />}
        {state?.error && !state.loading && <ErrorState message={`Couldn’t load hotels. ${state.error}`} onRetry={() => loadPlaces('hotel', true)} />}
        {state?.data && !state.loading && pois.length === 0 && <div className="empty">No hotels found here — try another stop.</div>}
        {!state?.loading && (
          <div className="list">
            {pois.slice(0, 40).map((p) => {
              const f = p.facts;
              return (
                <article key={p.id} className="card">
                  <div className="card-head">
                    <IconCircle icon={Bed} />
                    <div>
                      <div className="t-name">{p.name}</div>
                      <div className="t-meta">{[f.city, `${p.offRouteKm < 10 ? p.offRouteKm.toFixed(1) : Math.round(p.offRouteKm)} km off route`].filter(Boolean).join(' · ')}</div>
                    </div>
                  </div>
                  {(f.parking || f.wifi || f.stars || f.wheelchair) && (
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '14px 0 0' }}>
                      {f.parking && <div className="badge"><SquareParking size={10} />Parking</div>}
                      {f.wifi && <div className="badge"><Wifi size={10} />Wi-Fi</div>}
                      {f.wheelchair && <div className="badge"><Accessibility size={10} />Accessible</div>}
                    </div>
                  )}
                  <div className="card-foot" style={{ marginTop: 6 }}>
                    {f.stars ? <Stars value={f.stars} count={`${f.stars}★ hotel`} /> : <span className="t-meta">No star rating</span>}
                    <AddButton
                      saved={isSaved(p.id)}
                      label={p.name}
                      onClick={() => toggleSaved({ id: p.id, kind: 'hotel', name: p.name, subtitle: `Night${f.city ? ` · ${f.city}` : ''}`, lat: p.lat, lng: p.lng, kmAlong: p.kmAlong, offRouteKm: p.offRouteKm })}
                    />
                  </div>
                  <div className="card-links">
                    <a className="pill on sm" href={bookingUrl(p.name, f.city)} target="_blank" rel="noreferrer"><ExternalLink size={11} />Check price</a>
                    <a className="link" href={mapsUrl(p.lat, p.lng)} target="_blank" rel="noreferrer"><MapPin size={11} />Google Maps</a>
                  </div>
                </article>
              );
            })}
          </div>
        )}
        <div className="scroll-pad" />
      </main>
      <div className="bottom"><NavBar active="stay" /></div>
    </>
  );
}
