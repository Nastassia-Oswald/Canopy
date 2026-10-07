import { useCallback, useEffect, useState } from 'react';
import { Bug, CircleX, Coffee, MapPin, Sparkles, Toilet } from 'lucide-react';
import type { Poi, Report, ReportStatus } from '../../shared/types.ts';
import { AddButton, ErrorState, Header, IconCircle, Loading, NavBar, NoRoute, SavedButton, Warnings } from '../components/ui.tsx';
import { api } from '../lib/api.ts';
import { ago, mapsUrl, offRoute } from '../lib/format.ts';
import { useStore } from '../lib/store.tsx';

function StatusRow({ report }: { report?: Report }) {
  if (!report) return null;
  if (report.status === 'clean')
    return <div className="alert ok"><Sparkles size={14} />Very clean<span className="when">{ago(report.createdAt)}</span></div>;
  if (report.status === 'dirty')
    return <div className="alert"><Bug size={14} />Dirty toilets<span className="when">reported {ago(report.createdAt)}</span></div>;
  return <div className="alert"><CircleX size={14} />Toilets closed<span className="when">reported {ago(report.createdAt)}</span></div>;
}

function RestCard({ p, report, onReport }: { p: Poi; report?: Report; onReport: (s: ReportStatus) => void }) {
  const { toggleSaved, isSaved } = useStore();
  const [asking, setAsking] = useState(false);
  const f = p.facts;
  const wc = [f.wheelchair ? 'Accessible' : null].filter(Boolean).join(' · ');
  return (
    <article className="card">
      <div className="card-head">
        <IconCircle icon={Coffee} />
        <div>
          <div className="t-name">{p.name}</div>
          <div className="t-meta">{Math.round(p.kmAlong)} km · {offRoute(p.offRouteKm)}</div>
        </div>
      </div>
      <div className="rows">
        <StatusRow report={report} />
        {f.toilets && (
          <div className="row-w">
            <Toilet size={12} />WC
            {wc && <span style={{ color: 'var(--grey)', marginLeft: 4 }}>{wc}</span>}
            <span style={{ marginLeft: 'auto' }}>{f.toiletsFee === true ? 'Paid' : f.toiletsFee === false ? 'Free' : ''}</span>
          </div>
        )}
        <div className="row-w">
          {asking ? (
            <>
              <span>How are the toilets?</span>
              <div className="report-btns">
                {(['clean', 'dirty', 'closed'] as ReportStatus[]).map((s) => (
                  <button key={s} onClick={() => { onReport(s); setAsking(false); }}>{s[0]!.toUpperCase() + s.slice(1)}</button>
                ))}
              </div>
            </>
          ) : (
            <>
              <span style={{ color: 'var(--grey)' }}>{report ? 'Been here?' : 'No recent reports'}</span>
              <div className="report-btns"><button onClick={() => setAsking(true)}>Report</button></div>
            </>
          )}
        </div>
      </div>
      <div className="card-foot">
        <a className="link" href={mapsUrl(p.lat, p.lng)} target="_blank" rel="noreferrer"><MapPin size={11} />Google Maps</a>
        <AddButton
          saved={isSaved(p.id)}
          label={p.name}
          onClick={() => toggleSaved({ id: p.id, kind: 'rest', name: p.name, subtitle: report?.status === 'clean' ? 'Rest · Very clean' : 'Rest stop', lat: p.lat, lng: p.lng, kmAlong: p.kmAlong, offRouteKm: p.offRouteKm })}
        />
      </div>
    </article>
  );
}

export function RestList() {
  const { route, places, loadPlaces } = useStore();
  const state = places.rest;
  const [reports, setReports] = useState<Record<string, Report>>({});
  const [msg, setMsg] = useState('');

  useEffect(() => loadPlaces('rest'), [loadPlaces]);

  const pois = state?.data?.pois ?? [];
  const ids = pois.map((p) => p.id).join(',');
  useEffect(() => {
    if (!ids) return;
    api.reports(ids.split(',')).then(setReports, () => undefined);
  }, [ids]);

  const report = useCallback(async (poiId: string, status: ReportStatus) => {
    try {
      const r = await api.report(poiId, status);
      setReports((x) => ({ ...x, [poiId]: r }));
      setMsg('Thanks — your report helps other travellers.');
    } catch (e) {
      setMsg((e as Error).message);
    }
  }, []);

  if (!route) return <main className="screen"><NoRoute /></main>;

  return (
    <>
      <main className="screen">
        <Header title="Rest stops" sub={`${route.from.name} → ${route.to.name}`} back="trip" right={<SavedButton />} />
        <Warnings warnings={state?.data?.meta.warnings} demo={route.demo} />
        {msg && <Warnings warnings={[msg]} />}
        {state?.loading && !state.data && <Loading label="Finding rest areas and toilets on OpenStreetMap…" />}
        {state?.error && !state.data && <ErrorState message={`Couldn’t load rest stops. ${state.error}`} onRetry={() => loadPlaces('rest', true)} />}
        {state?.data && pois.length === 0 && <div className="empty">No rest areas found along this route.</div>}
        <div className="list">
          {pois.slice(0, 60).map((p) => <RestCard key={p.id} p={p} report={reports[p.id]} onReport={(s) => report(p.id, s)} />)}
        </div>
        <div className="scroll-pad" />
      </main>
      <div className="bottom"><NavBar active="rest" /></div>
    </>
  );
}
