import { useState } from 'react';
import { Bed, CalendarDays, Coffee, Fuel, Route as RouteIcon, Share2, Utensils, X, type LucideIcon } from 'lucide-react';
import type { SavedStopKind } from '../../shared/types.ts';
import { Header, IconCircle, NoRoute, Notice } from '../components/ui.tsx';
import { euro } from '../lib/format.ts';
import { go } from '../lib/router.ts';
import { useStore } from '../lib/store.tsx';

const ICONS: Record<SavedStopKind, LucideIcon> = { fuel: Fuel, rest: Coffee, food: Utensils, hotel: Bed };

export function Saved() {
  const { route, saved, removeSaved, totalSaving, settings } = useStore();
  const [msg, setMsg] = useState('');
  if (!route) return <main className="screen"><NoRoute /></main>;

  const date = new Date(settings.date + 'T12:00:00');
  const nights = saved.filter((s) => s.kind === 'hotel').length;
  const dateLabel = `${date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}${nights ? ` · ${nights + 1} days` : ''}`;

  const share = async () => {
    const lines = [
      `Canopy trip: ${route.from.name} → ${route.to.name} (${route.distanceKm} km), ${dateLabel}`,
      ...saved.map((s) => `• ${Math.round(s.kmAlong)} km — ${s.name} (${s.subtitle})`),
      totalSaving > 0 ? `Fuel saving: ${euro(totalSaving)}` : '',
    ].filter(Boolean);
    const text = lines.join('\n');
    try {
      if (navigator.share) await navigator.share({ title: 'My Canopy trip', text });
      else {
        await navigator.clipboard.writeText(text);
        setMsg('Trip copied — paste it anywhere.');
      }
    } catch {
      /* user cancelled */
    }
  };

  return (
    <>
      <main className="screen">
        <Header
          title="Saved trip"
          sub={`${route.from.name} → ${route.to.name}`}
          back="trip"
          right={<button className="round" onClick={share} aria-label="Share trip"><Share2 size={16} /></button>}
        />
        <div className="pills" style={{ marginTop: 16 }}>
          <span className="pill sm"><CalendarDays size={11} />{dateLabel}</span>
          <span className="pill sm"><RouteIcon size={11} />{route.distanceKm} km</span>
          {totalSaving > 0 && <span className="pill on sm">−{euro(totalSaving)}</span>}
        </div>
        {msg && <Notice>{msg}</Notice>}

        <div className="tl">
          <div className="tl-row end"><div className="dot"><span /></div><div className="t-name">{route.from.name}</div><div className="tl-km">Start</div></div>
          {saved.map((s) => (
            <div key={s.id} className="tl-row">
              <IconCircle icon={ICONS[s.kind]} />
              <div style={{ minWidth: 0 }}>
                <div className="t-name">{s.name}</div>
                <div className="t-meta">{s.subtitle}</div>
              </div>
              <div className="tl-km">{Math.round(s.kmAlong)} km</div>
              <button className="x-btn" onClick={() => removeSaved(s.id)} aria-label={`Remove ${s.name}`}><X size={14} /></button>
            </div>
          ))}
          <div className="tl-row end"><div className="dot"><span /></div><div className="t-name">{route.to.name}</div><div className="tl-km">{route.distanceKm} km</div></div>
        </div>

        {saved.length === 0 && (
          <div className="empty" style={{ paddingTop: 20 }}>
            No stops yet. Tap + on any fuel, rest, food or hotel card to add it.
            <div style={{ marginTop: 12 }}><button className="pill on" onClick={() => go('fuel')}>Find fuel</button></div>
          </div>
        )}
        <div className="scroll-pad" />
      </main>
      <div className="bottom">
        <button className="cta" onClick={share} disabled={!saved.length}><Share2 size={14} />Share trip</button>
      </div>
    </>
  );
}
