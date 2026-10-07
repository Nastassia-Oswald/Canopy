import { useEffect, useRef, useState } from 'react';
import { ArrowRight, CalendarDays, Car, Flag, LoaderCircle, LocateFixed, MapPin, Users, type LucideIcon } from 'lucide-react';
import { FUEL_LABELS, type FuelType, type Place } from '../../shared/types.ts';
import { IconCircle, InfoButton, Notice } from '../components/ui.tsx';
import { api } from '../lib/api.ts';
import { go } from '../lib/router.ts';
import { useStore, type LookingFor } from '../lib/store.tsx';

function PlaceField({ label, icon, value, onChange, active, allowLocate }: {
  label: string; icon: LucideIcon; value: Place | null; onChange: (p: Place | null) => void; active?: boolean; allowLocate?: boolean;
}) {
  const [text, setText] = useState(value?.name ?? '');
  const [hits, setHits] = useState<Place[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const timer = useRef<number>();

  useEffect(() => setText(value?.name ?? ''), [value]);

  const search = (q: string) => {
    setText(q);
    onChange(null);
    window.clearTimeout(timer.current);
    if (q.trim().length < 3) { setHits([]); return; }
    timer.current = window.setTimeout(async () => {
      setBusy(true);
      setErr('');
      try {
        const r = await api.geocode(q);
        setHits(r);
        setOpen(true);
      } catch (e) {
        setErr((e as Error).message);
      } finally {
        setBusy(false);
      }
    }, 450);
  };

  const locate = () => {
    if (!navigator.geolocation) return setErr('Location is not available on this device.');
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      (p) => { setBusy(false); onChange({ name: 'My location', lat: p.coords.latitude, lng: p.coords.longitude }); },
      () => { setBusy(false); setErr('Couldn’t get your location.'); },
      { timeout: 10000 },
    );
  };

  const id = `f-${label.toLowerCase()}`;
  return (
    <div>
      <div className={`field${active ? ' on' : ''}`}>
        <IconCircle icon={icon} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <label className="t-cap" htmlFor={id}>{label}</label>
          <input
            id={id}
            value={text}
            placeholder="City or address"
            autoComplete="off"
            onChange={(e) => search(e.target.value)}
            onFocus={() => hits.length && setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            aria-autocomplete="list"
            aria-expanded={open}
          />
        </div>
        {busy && <LoaderCircle size={14} className="spin" />}
        {allowLocate && !busy && (
          <button className="map-btn" style={{ width: 32, height: 32 }} onClick={locate} aria-label="Use my location">
            <LocateFixed size={14} />
          </button>
        )}
        {open && hits.length > 0 && (
          <div className="suggest" role="listbox">
            {hits.map((h) => (
              <button key={`${h.lat},${h.lng}`} role="option" aria-selected={false} onMouseDown={(e) => e.preventDefault()} onClick={() => { onChange(h); setOpen(false); }}>
                <div className="t-name">{h.name}</div>
                <div className="t-meta" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.label}</div>
              </button>
            ))}
          </div>
        )}
      </div>
      {err && <div className="t-meta" style={{ margin: '4px 8px 0' }}>{err}</div>}
    </div>
  );
}

const FUELS = Object.keys(FUEL_LABELS) as FuelType[];
const TANKS = [40, 50, 60, 70, 80];
const LOOK: { id: LookingFor; label: string }[] = [
  { id: 'fuel', label: 'Fuel' }, { id: 'rest', label: 'Rest' }, { id: 'food', label: 'Food' }, { id: 'stay', label: 'Stay' },
];

export function Setup() {
  const { settings, setSettings, planRoute, planning } = useStore();
  const [error, setError] = useState('');
  const ready = Boolean(settings.from && settings.to);

  const find = async (demo = false) => {
    setError('');
    try {
      await planRoute(demo);
      go('trip');
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const toggle = (id: LookingFor) =>
    setSettings({ lookingFor: settings.lookingFor.includes(id) ? settings.lookingFor.filter((x) => x !== id) : [...settings.lookingFor, id] });

  return (
    <>
      <main className="screen">
        <div className="head">
          <div>
            <div className="t-title">Plan your trip</div>
            <div className="t-sub">Cheap fuel, real food, great stays.</div>
          </div>
          <InfoButton />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 28 }}>
          <PlaceField label="From" icon={MapPin} value={settings.from} onChange={(from) => setSettings({ from })} allowLocate />
          <PlaceField label="To" icon={Flag} value={settings.to} onChange={(to) => setSettings({ to })} active />
        </div>

        <div className="t-cap section-cap">Trip details</div>
        <div className="pills">
          <label className="pill on" style={{ position: 'relative' }}>
            <CalendarDays size={11} />
            <input
              type="date"
              value={settings.date}
              onChange={(e) => setSettings({ date: e.target.value })}
              aria-label="Date"
              style={{ background: 'transparent', border: 'none', color: '#fff', fontSize: 10, width: 92, colorScheme: 'dark' }}
            />
          </label>
          <label className="pill" aria-label="Fuel type">
            <Car size={11} />
            <select value={settings.fuel} onChange={(e) => setSettings({ fuel: e.target.value as FuelType })} style={{ border: 'none', background: 'transparent', fontSize: 10, textTransform: 'uppercase' }}>
              {FUELS.map((f) => <option key={f} value={f}>{FUEL_LABELS[f]}</option>)}
            </select>
          </label>
          <button className="pill" onClick={() => setSettings({ tankL: TANKS[(TANKS.indexOf(settings.tankL) + 1) % TANKS.length]! })} aria-label="Tank size">
            {settings.tankL} L tank
          </button>
          <button className="pill sm" onClick={() => setSettings({ travellers: (settings.travellers % 6) + 1 })} aria-label="Travellers">
            <Users size={11} /> {settings.travellers}
          </button>
        </div>

        <div className="t-cap section-cap">Looking for</div>
        <div className="pills" style={{ flexWrap: 'nowrap' }}>
          {LOOK.map((l) => (
            <button key={l.id} className={`pill${settings.lookingFor.includes(l.id) ? ' on' : ''}`} style={{ flex: 1, minWidth: 0 }} onClick={() => toggle(l.id)} aria-pressed={settings.lookingFor.includes(l.id)}>
              {l.label}
            </button>
          ))}
        </div>

        {error && (
          <Notice>
            {error}
            <div style={{ marginTop: 6 }}>
              <button className="text-btn" onClick={() => find(true)}>Try the demo trip (Lyon → Barcelona)</button>
            </div>
          </Notice>
        )}
        <div style={{ flex: 1 }} />
        <div style={{ textAlign: 'center', marginTop: 20 }}>
          <button className="text-btn" onClick={() => find(true)}>No ideas? Try Lyon → Barcelona (demo)</button>
        </div>
      </main>
      <div className="bottom">
        <button className="cta" disabled={!ready || planning.loading} onClick={() => find(false)}>
          {planning.loading ? <><LoaderCircle size={14} className="spin" /> Finding the route…</> : <>Find stops <ArrowRight size={14} /></>}
        </button>
      </div>
    </>
  );
}
