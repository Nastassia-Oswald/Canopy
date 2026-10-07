import type { ReactNode } from 'react';
import { Bed, Check, ChevronLeft, Coffee, Fuel, Info, LoaderCircle, Map as MapIcon, Plus, Route as RouteIcon, Star, Utensils, type LucideIcon } from 'lucide-react';
import { go, type Route } from '../lib/router.ts';
import { useStore } from '../lib/store.tsx';

export function IconCircle({ icon: Icon, muted, size = 32 }: { icon: LucideIcon; muted?: boolean; size?: number }) {
  return (
    <div className={`ic${muted ? ' muted' : ''}`} style={size !== 32 ? { width: size, height: size } : undefined} aria-hidden>
      <Icon size={size / 2} />
    </div>
  );
}

export function AddButton({ saved, onClick, label }: { saved: boolean; onClick: () => void; label: string }) {
  return (
    <button className={`add${saved ? ' saved' : ''}`} onClick={onClick} aria-pressed={saved} aria-label={saved ? `Remove ${label} from trip` : `Add ${label} to trip`}>
      {saved ? <Check size={18} /> : <Plus size={18} />}
    </button>
  );
}

export function Stars({ value, count }: { value: number; count?: string }) {
  return (
    <div className="stars" aria-label={`${value} stars`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} size={11} fill={i <= Math.round(value) ? '#221C21' : 'none'} color={i <= Math.round(value) ? '#221C21' : '#A6A6A6'} />
      ))}
      {count && <span className="t-meta" style={{ marginLeft: 4 }}>{count}</span>}
    </div>
  );
}

export function Header({ title, sub, back, right }: { title: string; sub?: ReactNode; back?: Route; right?: ReactNode }) {
  return (
    <div className="head">
      <div style={{ minWidth: 0 }}>
        {back && (
          <button className="text-btn" onClick={() => go(back)} style={{ display: 'inline-flex', alignItems: 'center', gap: 2, textDecoration: 'none', marginBottom: 6, marginLeft: -4 }}>
            <ChevronLeft size={16} /> Back
          </button>
        )}
        <div className="t-title">{title}</div>
        {sub && <div className="t-sub">{sub}</div>}
      </div>
      {right && <div className="head-actions">{right}</div>}
    </div>
  );
}

/** Round button that opens the saved trip, with a count badge. */
export function SavedButton() {
  const { saved } = useStore();
  return (
    <button className="round" onClick={() => go('saved')} aria-label={`Saved trip, ${saved.length} stops`}>
      <RouteIcon size={16} />
      {saved.length > 0 && <span className="count">{saved.length}</span>}
    </button>
  );
}

export function InfoButton() {
  return (
    <button className="round" onClick={() => go('sources')} aria-label="Data sources">
      <Info size={16} />
    </button>
  );
}

const NAV: { route: Route; icon: LucideIcon; label: string }[] = [
  { route: 'fuel', icon: Fuel, label: 'Fuel' },
  { route: 'rest', icon: Coffee, label: 'Rest' },
  { route: 'food', icon: Utensils, label: 'Food' },
  { route: 'stay', icon: Bed, label: 'Stay' },
  { route: 'map', icon: MapIcon, label: 'Map' },
];

export function NavBar({ active }: { active: Route }) {
  return (
    <nav className="nav" aria-label="Sections">
      {NAV.map(({ route, icon: Icon, label }) => (
        <button key={route} className={active === route ? 'on' : ''} onClick={() => go(route)} aria-label={label} aria-current={active === route ? 'page' : undefined}>
          <Icon size={active === route ? 18 : 20} />
        </button>
      ))}
    </nav>
  );
}

export function Notice({ children, icon: Icon = Info }: { children: ReactNode; icon?: LucideIcon }) {
  return (
    <div className="notice" role="status">
      <Icon size={13} style={{ marginTop: 1 }} />
      <div>{children}</div>
    </div>
  );
}

export function Loading({ label, rows = 3 }: { label: string; rows?: number }) {
  return (
    <div className="list" aria-busy="true" aria-label={label}>
      <div className="t-meta" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <LoaderCircle size={12} className="spin" /> {label}
      </div>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skeleton" />
      ))}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="empty">
      {message}
      {onRetry && (
        <div style={{ marginTop: 12 }}>
          <button className="pill on" onClick={onRetry}>Try again</button>
        </div>
      )}
    </div>
  );
}

/** Shown on list screens when no route has been planned yet. */
export function NoRoute() {
  return (
    <div className="empty">
      Plan a trip first.
      <div style={{ marginTop: 12 }}>
        <button className="pill on" onClick={() => go('setup')}>Plan a trip</button>
      </div>
    </div>
  );
}

export function Warnings({ warnings, demo }: { warnings?: string[]; demo?: boolean }) {
  const list = [...(demo ? ['Demo data — prices and places are examples.'] : []), ...(warnings ?? []).filter((w) => !w.startsWith('Showing demo'))];
  if (!list.length) return null;
  return <Notice>{list.map((w) => <div key={w}>{w}</div>)}</Notice>;
}
