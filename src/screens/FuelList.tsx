import { useEffect, useMemo, useState } from 'react';
import { Fuel } from 'lucide-react';
import type { FuelStationOnRoute } from '../../shared/types.ts';
import { AddButton, ErrorState, Header, IconCircle, Loading, NavBar, NoRoute, SavedButton, Warnings } from '../components/ui.tsx';
import { euro, fullTankSaving, offRoute, perL, vsAverage } from '../lib/format.ts';
import { useStore } from '../lib/store.tsx';

type Sort = 'cheapest' | 'onroute' | 'nearest';

export function FuelList() {
  const { route, fuel, loadFuel, settings, toggleSaved, isSaved } = useStore();
  const [sort, setSort] = useState<Sort>('cheapest');
  const [limit, setLimit] = useState(30);

  useEffect(() => loadFuel(), [loadFuel]);

  const list = useMemo(() => {
    const d = fuel.data;
    if (!d) return [];
    const s = [...d.stations];
    const price = (x: FuelStationOnRoute) => x.prices[d.fuel] ?? 99;
    if (sort === 'cheapest') s.sort((a, b) => price(a) - price(b));
    if (sort === 'onroute') return s.filter((x) => x.offRouteKm < 0.4).sort((a, b) => a.kmAlong - b.kmAlong);
    if (sort === 'nearest') s.sort((a, b) => a.offRouteKm - b.offRouteKm || price(a) - price(b));
    return s;
  }, [fuel.data, sort]);

  if (!route) return <main className="screen"><NoRoute /></main>;
  const d = fuel.data;

  return (
    <>
      <main className="screen">
        <Header title="Fuel stops" sub={`${route.from.name} → ${route.to.name}`} back="trip" right={<SavedButton />} />
        <div className="pills" style={{ marginTop: 22 }} role="tablist">
          {(['cheapest', 'onroute', 'nearest'] as Sort[]).map((s) => (
            <button key={s} role="tab" aria-selected={sort === s} className={`pill${sort === s ? ' on' : ''}`} onClick={() => setSort(s)}>
              {s === 'cheapest' ? 'Cheapest' : s === 'onroute' ? 'On route' : 'Nearest'}
            </button>
          ))}
        </div>
        <Warnings warnings={d?.meta.warnings} demo={route.demo} />

        {fuel.loading && !d && <Loading label="Loading today’s prices from official feeds…" />}
        {fuel.error && !d && <ErrorState message={fuel.error} onRetry={() => loadFuel(true)} />}
        {d && list.length === 0 && <div className="empty">No stations found near this route for this fuel.</div>}

        {d && (
          <div className="list">
            {list.slice(0, limit).map((s) => {
              const price = s.prices[d.fuel]!;
              const avg = d.averages[s.country];
              const vs = vsAverage(price, avg, s.country);
              const saving = fullTankSaving(s, d.fuel, d.averages, settings.tankL);
              const dim = avg !== undefined && price > avg + 0.02;
              return (
                <article key={s.id} className={`card${dim ? ' dim' : ''}`}>
                  <div className="card-head">
                    <IconCircle icon={Fuel} muted={dim} />
                    <div>
                      <div className="t-name">{s.name}</div>
                      <div className="t-meta">
                        {[s.city, `${Math.round(s.kmAlong)} km`, s.motorway ? 'motorway' : offRoute(s.offRouteKm)].filter(Boolean).join(' · ')}
                      </div>
                    </div>
                  </div>
                  <div className="card-price">
                    <div className="t-price">{perL(price)}<span className="t-unit">/L</span></div>
                    <AddButton
                      saved={isSaved(s.id)}
                      label={s.name}
                      onClick={() =>
                        toggleSaved({
                          id: s.id, kind: 'fuel', name: s.name, subtitle: `Fuel · ${perL(price)}/L`,
                          lat: s.lat, lng: s.lng, kmAlong: s.kmAlong, offRouteKm: s.offRouteKm, pricePerL: price, saving,
                        })
                      }
                    />
                  </div>
                  <div className="card-foot">
                    {vs && <div className="badge">{vs.text}</div>}
                    <span className="t-meta">~{euro(price * settings.tankL)} full</span>
                  </div>
                </article>
              );
            })}
            {list.length > limit && (
              <button className="pill" style={{ alignSelf: 'center' }} onClick={() => setLimit((l) => l + 30)}>Show more</button>
            )}
          </div>
        )}
        <div className="scroll-pad" />
      </main>
      <div className="bottom"><NavBar active="fuel" /></div>
    </>
  );
}
