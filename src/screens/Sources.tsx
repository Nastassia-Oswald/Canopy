import { useEffect, useState } from 'react';
import { Coffee, ExternalLink, Fuel, Map as MapIcon, Route as RouteIcon, Search, Users, type LucideIcon } from 'lucide-react';
import type { SourceId, SourceInfo } from '../../shared/types.ts';
import { ErrorState, Header, IconCircle, Loading } from '../components/ui.tsx';
import { api } from '../lib/api.ts';
import { ago } from '../lib/format.ts';

const ICON: Partial<Record<SourceId, LucideIcon>> = { osm: MapIcon, osrm: RouteIcon, nominatim: Search, canopy: Users };
const STATUS: Record<SourceInfo['status'], string> = { live: 'Live', 'not-loaded': 'Loads on demand', 'not-configured': 'Not set up', error: 'Unavailable' };

export function Sources() {
  const [data, setData] = useState<SourceInfo[]>();
  const [error, setError] = useState('');
  const load = () => api.sources().then(setData, (e: Error) => setError(e.message));
  useEffect(() => { load(); }, []);

  return (
    <>
      <main className="screen">
        <Header title="Data sources" sub="Where our info comes from" back="setup" />
        {!data && !error && <Loading label="Checking sources…" rows={4} />}
        {error && <ErrorState message={error} onRetry={load} />}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 18 }}>
          {data?.map((s) => (
            <a key={s.id} className="field" href={s.url || undefined} target="_blank" rel="noreferrer" style={{ padding: '6px 8px', gap: 9, textDecoration: 'none' }}>
              <IconCircle icon={ICON[s.id] ?? (s.id === 'canopy' ? Coffee : Fuel)} muted={s.status !== 'live'} size={28} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="t-name" style={{ fontSize: 12 }}>{s.label}</div>
                <div className="t-meta" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.provider} · {s.licence}</div>
                <div className="t-meta" style={{ fontSize: 9.5 }}>
                  {STATUS[s.status]}{s.updatedAt ? ` · updated ${ago(s.updatedAt)}` : ''}{s.detail && s.status !== 'error' ? ` · ${s.detail}` : ''}
                </div>
              </div>
              {s.url && <ExternalLink size={12} color="#A6A6A6" />}
            </a>
          ))}
        </div>
        {data && (
          <div className="t-meta" style={{ marginTop: 14, lineHeight: 1.5 }}>
            {data.map((s) => s.attribution).filter((v, i, a) => a.indexOf(v) === i).join(' · ')}
            <br />
            Prices can change. Always check the price at the pump.
          </div>
        )}
        <div className="scroll-pad" />
      </main>
      <div className="bottom">
        <a className="cta sec" href="mailto:?subject=Canopy%20data%20error" style={{ textDecoration: 'none' }}>Report a data error</a>
      </div>
    </>
  );
}
