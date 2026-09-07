import React, { useEffect, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { useStore } from '../lib/store';
import { kv } from '../lib/db';
import { Sheet, Bubble, Empty, Icon, fmtDate } from '../components/ui';
import ReportCard from '../components/ReportCard';

export default function StudentHome({ studentId, onBack }) {
  const { me, api, toast, logout } = useStore();
  const sid = studentId || me.student_id;
  const [rep, setRep] = useState(null);
  const [open, setOpen] = useState(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try { const r = await api('student_report', { student_id: sid }); await kv.set('report_' + sid, r); if (alive) setRep(r); }
      catch (e) { const c = await kv.get('report_' + sid); if (alive) { setRep(c || { tests: [], student: { name: me.name } }); if (!c) toast(e.message, 'err'); } }
    })();
    return () => { alive = false; };
  }, [sid]); // eslint-disable-line

  if (!rep) return <div className="empty">Loading results…</div>;
  const tests = rep.tests || [];
  const appeared = tests.filter((t) => !t.absent);
  const chart = appeared.map((t) => ({ name: t.name.length > 10 ? t.name.slice(0, 10) + '…' : t.name, pct: t.pct, avg: t.stats?.avg && t.total_max ? Math.round(t.stats.avg / t.total_max * 1000) / 10 : null }));
  const last = appeared[appeared.length - 1];

  return (
    <div>
      <div className="page-head">
        <div className="row" style={{ gap: 10 }}>
          {onBack && <button className="iconbtn" aria-label="Back" onClick={onBack}><Icon name="back" /></button>}
          <div><h1>{rep.student?.name}</h1><p>Roll {rep.student?.roll} · {rep.batch?.name || ''}{rep.student?.class ? ` · Class ${rep.student.class}` : ''}</p></div>
        </div>
        {!onBack && <button className="btn sm" onClick={logout}><Icon name="logout" size={16} />Sign out</button>}
      </div>

      {tests.length === 0 ? <div className="list"><Empty title="No results published yet">Results appear here as soon as the institute publishes a test.</Empty></div> : (
        <>
          {last && (
            <div className="grid3 mb">
              <div className="stat"><div className="v num">{last.rank || '–'}<span className="muted" style={{ fontSize: 14 }}>/{last.stats?.n}</span></div><div className="l">Latest rank</div></div>
              <div className="stat"><div className="v num">{last.pct}%</div><div className="l">{last.total}/{last.total_max} in {last.name}</div></div>
              <div className="stat"><div className="v num">{appeared.length ? Math.round(appeared.reduce((a, t) => a + Number(t.pct), 0) / appeared.length) : '–'}%</div><div className="l">Average over {appeared.length} test{appeared.length === 1 ? '' : 's'}</div></div>
            </div>
          )}
          {chart.length > 1 && (
            <div className="panel mb"><div className="panel-head"><h3>Percentage per test</h3><span className="small muted">You vs batch average</span></div>
              <div className="panel-body"><div className="chart">
                <ResponsiveContainer>
                  <LineChart data={chart} margin={{ top: 6, right: 12, left: -18, bottom: 0 }}>
                    <CartesianGrid stroke="#ECEEF2" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Line type="monotone" dataKey="pct" name="You" stroke="#2145C9" strokeWidth={2.5} dot={{ r: 3 }} />
                    <Line type="monotone" dataKey="avg" name="Batch avg" stroke="#8A92A6" strokeWidth={1.5} strokeDasharray="4 3" dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div></div>
            </div>
          )}
          <div className="list">
            {[...tests].reverse().map((t) => (
              <button key={t.test_id} className="item" onClick={() => setOpen(t)}>
                <Bubble rank={t.rank} total={t.stats?.n} />
                <div className="grow">
                  <span className="title">{t.name}</span>
                  <span className="sub">{fmtDate(t.date)} · {t.absent ? 'Absent' : `${t.total}/${t.total_max} · ${t.pct}% · percentile ${t.percentile}`}</span>
                </div>
                {!t.published && <span className="tag amber">Draft</span>}
              </button>
            ))}
          </div>
        </>
      )}

      {open && (
        <Sheet title="Report card" onClose={() => setOpen(null)}>
          <ReportCard institute={rep.settings?.institute_name} student={rep.student} batchName={rep.batch?.name} test={open} row={open} stats={open.stats}
            onShared={(r) => toast(r.startsWith('error') ? r.slice(6) : r === 'downloaded' ? 'Image downloaded' : 'Shared', r.startsWith('error') ? 'err' : 'ok')} />
        </Sheet>
      )}
    </div>
  );
}
