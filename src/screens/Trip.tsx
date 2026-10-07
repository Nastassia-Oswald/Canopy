import { useEffect, useMemo } from 'react';
import { Bed, Coffee, Fuel, Utensils, type LucideIcon } from 'lucide-react';
import { IconCircle, Header, NoRoute, SavedButton, Warnings } from '../components/ui.tsx';
import { duration, euro, fullTankSaving, perL } from '../lib/format.ts';
import { go, type Route } from '../lib/router.ts';
import { useStore } from '../lib/store.tsx';

export function Trip() {
  const { route, settings, fuel, loadFuel, places, loadPlaces, saved, totalSaving, nightKm } = useStore();

  useEffect(() => {
    loadFuel();
    if (settings.lookingFor.includes('rest')) loadPlaces('rest');
  }, [loadFuel, loadPlaces, settings.lookingFor]);

  const best = useMemo(() => {
    const d = fuel.data;
    if (!d) return null;
    const onRoute = d.stations.filter((s) => s.offRouteKm < 2);
    let max = 0;
    let cheapest = Infinity;
    for (const s of onRoute) {
      max = Math.max(max, fullTankSaving(s, d.fuel, d.averages, settings.tankL));
      cheapest = Math.min(cheapest, s.prices[d.fuel] ?? Infinity);
    }
    return { max, cheapest: Number.isFinite(cheapest) ? cheapest : null, count: onRoute.length };
  }, [fuel.data, settings.tankL]);

  if (!route) return <main className="screen"><NoRoute /></main>;

  const fuelStops = saved.filter((s) => s.kind === 'fuel').length;
  const restCount = places.rest?.data?.pois.length;
  const night = nightKm ?? route.distanceKm * 0.6;

  const tiles: { route: Route; icon: LucideIcon; title: string; meta: string; show: boolean }[] = [
    {
      route: 'fuel', icon: Fuel, title: 'Fuel', show: settings.lookingFor.includes('fuel'),
      meta: fuel.loading ? 'Loading prices…' : fuelStops ? `${fuelStops} stop${fuelStops > 1 ? 's' : ''} · −${euro(totalSaving)}` : best?.cheapest ? `${best.count} stations · from ${perL(best.cheapest)}` : fuel.error ? 'Prices unavailable' : '—',
    },
    {
      route: 'rest', icon: Coffee, title: 'Rest', show: settings.lookingFor.includes('rest'),
      meta: places.rest?.loading ? 'Loading…' : restCount !== undefined ? `${restCount} rest stops` : 'Toilets & rest areas',
    },
    { route: 'food', icon: Utensils, title: 'Food', show: settings.lookingFor.includes('food'), meta: 'Near the route' },
    { route: 'stay', icon: Bed, title: 'Stay', show: settings.lookingFor.includes('stay'), meta: `Night near km ${Math.round(night)}` },
  ];

  const savingValue = totalSaving > 0 ? totalSaving : best?.max ?? 0;

  return (
    <>
      <main className="screen">
        <Header title="Your trip" sub={`${route.from.name} → ${route.to.name} · ${route.distanceKm} km`} back="setup" right={<SavedButton />} />

        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, alignItems: 'center', marginTop: 24 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div className="field" style={{ padding: '10px 12px', display: 'block' }}>
              <div className="t-cap">From</div>
              <div className="t-name" style={{ fontSize: 15, marginTop: 2 }}>{route.from.name}</div>
            </div>
            <div className="field" style={{ padding: '10px 12px', display: 'block' }}>
              <div className="t-cap">To</div>
              <div className="t-name" style={{ fontSize: 15, marginTop: 2 }}>{route.to.name}</div>
            </div>
          </div>
          <div className="saving-circle" aria-label={`Saving ${euro(savingValue)}`}>
            <div className="t-cap" style={{ color: 'var(--grey)' }}>{totalSaving > 0 ? 'You save' : 'Save up to'}</div>
            <div className="v">{fuel.loading && !fuel.data && totalSaving === 0 ? '…' : euro(savingValue)}</div>
          </div>
        </div>

        <div className="tiles">
          {tiles.filter((t) => t.show).map((t) => (
            <button key={t.route} className="card tile" onClick={() => go(t.route)}>
              <IconCircle icon={t.icon} />
              <div>
                <div className="t-name">{t.title}</div>
                <div className="t-meta">{t.meta}</div>
              </div>
            </button>
          ))}
        </div>

        <div className="t-meta" style={{ marginTop: 12 }}>
          Drive time about {duration(route.durationMin)} · savings vs national average, {settings.tankL} L tank
        </div>
        <Warnings warnings={fuel.data?.meta.warnings} demo={route.demo} />
        {fuel.error && <Warnings warnings={[`Fuel prices: ${fuel.error}`]} />}
      </main>
      <div className="bottom">
        <button className="cta" onClick={() => go('saved')}>Save trip</button>
      </div>
    </>
  );
}
