import React, { useEffect, useMemo, useState } from 'react';
import { useStore } from '../lib/store';
import { kv } from '../lib/db';
import { Sheet, Icon, Bubble, Empty, fmtDate } from '../components/ui';
import ReportCard from '../components/ReportCard';
import { exportRows } from '../lib/excel';

export default function Results({ params, go }) {
  const { data, api, toast, setData, batchName } = useStore();
  const [testId, setTestId] = useState(params?.test_id || '');
  const test = data.tests.find((t) => t.test_id === testId);
  const [res, setRes] = useState(null);
  const [open, setOpen] = useState(null);
  const [pub, setPub] = useState(null);
  const [busy, setBusy] = useState(false);
  const [sort, setSort] = useState('rank');

  useEffect(() => { if (params?.test_id) setTestId(params.test_id); }, [params?.test_id]);
  useEffect(() => {
    if (!test) { setRes(null); return; }
    let alive = true;
    setRes(null);
    (async () => {
      try { const r = await api('get_marks', { test_id: test.test_id }); await kv.set('marks_' + test.test_id, r); if (alive) setRes(r); }
      catch (e) { const c = await kv.get('marks_' + test.test_id); if (alive) { setRes(c || { rows: [], stats: {} }); if (!c) toast(e.message, 'err'); } }
    })();
    return () => { alive = false; };
  }, [test?.test_id]); // eslint-disable-line

  const rows = useMemo(() => {
    if (!res) return [];
    const r = res.rows.filter((x) => x.entered || x.absent);
    if (sort === 'rank') return [...r].sort((a, b) => (a.rank || 1e9) - (b.rank || 1e9) || String(a.roll).localeCompare(String(b.roll), undefined, { numeric: true }));
    if (sort === 'roll') return [...r].sort((a, b) => String(a.roll).localeCompare(String(b.roll), undefined, { numeric: true }));
    return [...r].sort((a, b) => (b.subj[sort]?.m ?? -1e9) - (a.subj[sort]?.m ?? -1e9));
  }, [res, sort]);

  const publish = async (publishFlag, notify) => {
    setBusy(true);
    try {
      const r = await api('publish_test', { test_id: test.test_id, publish: publishFlag, notify });
      setData((d) => ({ ...d, tests: d.tests.map((t) => (t.test_id === r.test.test_id ? r.test : t)) }));
      toast(publishFlag ? `Published${notify ? ` · sent ${r.sent} Telegram message${r.sent === 1 ? '' : 's'}${r.failed ? `, ${r.failed} failed` : ''}` : ''}` : 'Unpublished', 'ok');
      setPub(null);
    } catch (e) { toast(e.message, 'err'); }
    setBusy(false);
  };

  const exportXlsx = () => {
    const cwu = test.mode === 'cwu';
    const out = rows.map((r) => {
      const o = { Rank: r.rank, Roll: r.roll, Name: r.name };
      test.subjects.forEach((s) => {
        const x = r.subj[s.code] || {};
        if (cwu) { o[`${s.code}_C`] = x.c; o[`${s.code}_W`] = x.w; o[`${s.code}_U`] = x.u; }
        o[`${s.code}`] = x.m; o[`${s.code}_Rank`] = r.sub_rank?.[s.code] || '';
      });
      o.Total = r.absent ? 'AB' : r.total; o.Percent = r.pct; o.Percentile = r.percentile;
      return o;
    });
    exportRows(out, `${test.name.replace(/\s+/g, '_')}_results.xlsx`, 'Results');
  };

  const student = open && data.students.find((s) => s.student_id === open.student_id);
  const tests = [...data.tests].sort((a, b) => String(b.date).localeCompare(String(a.date)) || b.test_id.localeCompare(a.test_id));

  return (
    <div>
      <div className="page-head">
        <div><h1>Results</h1>{test && <p>{fmtDate(test.date)} · {test.batch_ids.map(batchName).join(', ')} · {res ? `${res.stats.n || 0} appeared` : 'loading…'}</p>}</div>
        {test && (
          <div className="row">
            <button className="btn sm" onClick={() => go('marks', { test_id: test.test_id })}><Icon name="edit" size={16} />Marks</button>
            <button className="btn sm" onClick={exportXlsx} disabled={!rows.length}><Icon name="download" size={16} />Excel</button>
            <button className={`btn sm ${test.published ? '' : 'primary'}`} onClick={() => setPub({ publish: !test.published, notify: !test.published })}>{test.published ? 'Unpublish' : 'Publish'}</button>
          </div>
        )}
      </div>

      <div className="row mb">
        <select className="input" style={{ width: 'auto', minWidth: 200, maxWidth: '100%' }} value={testId} onChange={(e) => setTestId(e.target.value)}>
          <option value="">Choose a test</option>
          {tests.map((t) => <option key={t.test_id} value={t.test_id}>{t.name} · {fmtDate(t.date)}</option>)}
        </select>
        {test && (
          <select className="input" style={{ width: 'auto' }} value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="rank">By rank</option><option value="roll">By roll</option>
            {test.subjects.map((s) => <option key={s.code} value={s.code}>By {s.name}</option>)}
          </select>
        )}
      </div>

      {!test ? <div className="list"><Empty title="Pick a test">Rankings, report cards and publishing live here.</Empty></div>
        : !res ? <div className="empty">Loading…</div>
        : rows.length === 0 ? <div className="list"><Empty title="No marks yet"><button className="btn primary sm" onClick={() => go('marks', { test_id: test.test_id })}>Enter marks</button></Empty></div> : (
        <>
          <div className="grid3 mb">
            <div className="stat"><div className="v num">{res.stats.top}</div><div className="l">Topper · {rows.find((r) => r.rank === 1)?.name?.split(' ')[0] || ''}</div></div>
            <div className="stat"><div className="v num">{res.stats.avg}</div><div className="l">Batch average /{test.total_max}</div></div>
            <div className="stat"><div className="v num">{res.stats.n}</div><div className="l">Appeared · {rows.filter((r) => r.absent).length} absent</div></div>
          </div>
          <div className="tablewrap">
            <table className="t">
              <thead>
                <tr><th className="sticky">Rank</th><th>Name</th>{test.subjects.map((s) => <th key={s.code} className="n">{s.code}<span className="muted"> /{s.max}</span></th>)}<th className="n">Total</th><th className="n">%</th><th className="n">Pctl</th></tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.student_id} className={r.absent ? 'dim' : ''} onClick={() => setOpen(r)} style={{ cursor: 'pointer' }}>
                    <td className="sticky"><Bubble rank={r.rank} total={res.stats.n} /></td>
                    <td><span style={{ fontWeight: 500 }}>{r.name}</span><span className="muted small"> · {r.roll}</span></td>
                    {test.subjects.map((s) => <td key={s.code} className="n">{r.absent ? '–' : r.subj[s.code]?.entered ? r.subj[s.code].m : '–'}{!r.absent && r.sub_rank?.[s.code] === 1 && <span className="tag pink" style={{ marginLeft: 6 }}>top</span>}</td>)}
                    <td className="n" style={{ fontWeight: 600 }}>{r.absent ? 'AB' : r.total}</td>
                    <td className="n">{r.absent ? '' : r.pct}</td>
                    <td className="n">{r.absent ? '' : r.percentile}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="hint mt">Tap a row for the report card · subject averages: {test.subjects.map((s) => `${s.code} ${res.stats.sub_avg?.[s.code] ?? '–'}`).join(' · ')}</p>
        </>
      )}

      {open && student && (
        <Sheet title="Report card" onClose={() => setOpen(null)}>
          <ReportCard institute={data.settings.institute_name} student={student} batchName={batchName(student.batch_id)} test={test} row={open} stats={res.stats}
            onShared={(r) => toast(r.startsWith('error') ? r.slice(6) : r === 'downloaded' ? 'Image downloaded' : 'Shared', r.startsWith('error') ? 'err' : 'ok')} />
        </Sheet>
      )}

      {pub && (
        <Sheet title={pub.publish ? 'Publish results' : 'Unpublish results'} onClose={() => setPub(null)}
          actions={<><button className="btn" onClick={() => setPub(null)}>Cancel</button><button className="btn primary" onClick={() => publish(pub.publish, pub.notify)} disabled={busy}>{busy ? 'Working…' : pub.publish ? 'Publish' : 'Unpublish'}</button></>}>
          {pub.publish ? (
            <div className="stack">
              <p className="small">Students and parents can then see this test in the app and the bot.</p>
              <label className={`check ${pub.notify ? 'on' : ''}`}><input type="checkbox" checked={pub.notify} onChange={(e) => setPub({ ...pub, notify: e.target.checked })} />Send each linked student/parent their result on Telegram now</label>
              <p className="hint">{data.students.filter((s) => test.batch_ids.includes(s.batch_id) && (s.tg_id || s.parent_tg_id)).length} students in this batch have Telegram linked.</p>
            </div>
          ) : <p className="small">The test goes back to draft. Already-sent Telegram messages stay.</p>}
        </Sheet>
      )}
    </div>
  );
}
