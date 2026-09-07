import React, { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { useStore } from '../lib/store';
import { Empty, fmtDate } from '../components/ui';
import StudentHome from './StudentHome';

export default function Analytics() {
  const { data, api, toast } = useStore();
  const [batch, setBatch] = useState(data.batches[0]?.batch_id || '');
  const [an, setAn] = useState(null);
  const [view, setView] = useState('all');
  const [openStudent, setOpenStudent] = useState(null);

  useEffect(() => {
    if (!batch) return;
    let alive = true;
    setAn(null);
    api('analytics', { batch_id: batch }).then((r) => alive && setAn(r)).catch((e) => { toast(e.message, 'err'); setAn({ tests: [], students: [] }); });
    return () => { alive = false; };
  }, [batch]); // eslint-disable-line

  if (openStudent) return <StudentHome studentId={openStudent} onBack={() => setOpenStudent(null)} />;

  const students = an ? an.students.filter((s) => view === 'all' || (view === 'down' ? s.trend === 'down' : s.trend === 'up')) : [];
  const chart = an ? an.tests.map((t) => ({ name: t.name.length > 10 ? t.name.slice(0, 10) + '…' : t.name, avg: t.avg_pct === '' ? null : t.avg_pct, n: t.n })) : [];
  const down = an ? an.students.filter((s) => s.trend === 'down').length : 0;

  return (
    <div>
      <div className="page-head">
        <div><h1>Analytics</h1><p>Batch trend and students who need attention</p></div>
        <select className="input" style={{ width: 'auto', minWidth: 160 }} value={batch} onChange={(e) => setBatch(e.target.value)}>
          {data.batches.map((b) => <option key={b.batch_id} value={b.batch_id}>{b.name}</option>)}
        </select>
      </div>

      {!batch ? <div className="list"><Empty title="No batch">Create a batch first.</Empty></div> : !an ? <div className="empty">Computing…</div> : an.tests.length === 0 ? <div className="list"><Empty title="No tests for this batch yet" /></div> : (
        <>
          <div className="grid3 mb">
            <div className="stat"><div className="v num">{an.tests.length}</div><div className="l">Tests held</div></div>
            <div className="stat"><div className="v num">{chart.filter((c) => c.avg != null).length ? Math.round(chart.filter((c) => c.avg != null).reduce((a, c) => a + c.avg, 0) / chart.filter((c) => c.avg != null).length) : '–'}%</div><div className="l">Batch average</div></div>
            <div className="stat"><div className="v num" style={{ color: down ? 'var(--pink)' : undefined }}>{down}</div><div className="l">Falling 3 tests in a row</div></div>
          </div>

          <div className="panel mb"><div className="panel-head"><h3>Batch average per test</h3><span className="small muted">% of max marks</span></div>
            <div className="panel-body"><div className="chart">
              <ResponsiveContainer>
                <BarChart data={chart} margin={{ top: 6, right: 8, left: -18, bottom: 0 }}>
                  <CartesianGrid stroke="#ECEEF2" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="avg" name="Batch avg %" fill="#2145C9" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div></div>
          </div>

          <div className="row between mb">
            <h2>Students</h2>
            <div className="seg">
              {[['all', 'All'], ['down', 'Falling'], ['up', 'Rising']].map(([v, l]) => <button key={v} className={view === v ? 'on' : ''} onClick={() => setView(v)}>{l}</button>)}
            </div>
          </div>
          <div className="tablewrap">
            <table className="t">
              <thead><tr><th>#</th><th>Name</th><th className="n">Avg %</th><th className="n">Tests</th><th>Last 3 (%)</th><th>Trend</th></tr></thead>
              <tbody>
                {students.map((s, i) => (
                  <tr key={s.student_id} onClick={() => setOpenStudent(s.student_id)} style={{ cursor: 'pointer' }}>
                    <td className="muted">{i + 1}</td>
                    <td><span style={{ fontWeight: 500 }}>{s.name}</span><span className="muted small"> · {s.roll}</span></td>
                    <td className="n">{s.avg_pct}</td>
                    <td className="n">{s.appeared}/{an.tests.length}</td>
                    <td className="num">{s.pcts.filter((p) => p != null).slice(-3).join(' → ')}</td>
                    <td>{s.trend === 'down' ? <span className="tag pink">Falling</span> : s.trend === 'up' ? <span className="tag green">Rising</span> : <span className="tag">Steady</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="hint mt">Last test: {fmtDate(an.tests[an.tests.length - 1].date)} · Tap a student for their full record.</p>
        </>
      )}
    </div>
  );
}
