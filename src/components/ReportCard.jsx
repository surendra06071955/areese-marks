import React, { useRef, useState } from 'react';
import { nodeToPng, shareImage } from '../lib/share';
import { Bubble, Icon, fmtDate } from './ui';

export default function ReportCard({ institute, student, batchName, test, row, stats, onShared, showActions = true }) {
  const ref = useRef();
  const [busy, setBusy] = useState(false);
  const cwu = test.mode === 'cwu';

  const share = async () => {
    setBusy(true);
    try {
      const png = await nodeToPng(ref.current);
      const r = await shareImage(png, `${student.name.replace(/\s+/g, '_')}_${test.name.replace(/\s+/g, '_')}.png`, `${test.name} — ${student.name}`);
      onShared && onShared(r);
    } catch (e) { if (!/abort|cancel/i.test(e.message)) onShared && onShared('error:' + e.message); }
    setBusy(false);
  };

  return (
    <div>
      <div className="rcwrap">
        <div className="rc" ref={ref}>
          <div className="rc-top">
            <div className="inst">{institute || 'AREESE Gurukulam'}<small>{test.name}{test.date ? ` · ${fmtDate(test.date)}` : ''}</small></div>
            <div className="rankbig"><Bubble rank={row.rank} total={stats?.n} /><small>{row.rank ? `Rank of ${stats?.n || '–'}` : 'No rank'}</small></div>
          </div>
          <div className="who">
            <b>{student.name}</b>
            <span>Roll {student.roll}{batchName ? ` · ${batchName}` : ''}</span>
          </div>
          {row.absent ? <div className="absent">Absent</div> : (
            <table>
              <thead>
                <tr><th>Subject</th>{cwu && <th>C / W / U</th>}<th>Marks</th><th>Avg</th><th>Rank</th></tr>
              </thead>
              <tbody>
                {test.subjects.map((s) => {
                  const x = row.subj?.[s.code] || {};
                  return (
                    <tr key={s.code}>
                      <td>{s.name}</td>
                      {cwu && <td className="cwu">{x.entered ? `${x.c} / ${x.w} / ${x.u}` : '–'}</td>}
                      <td>{x.entered ? <b>{x.m}</b> : '–'}<span className="cwu">/{s.max}</span></td>
                      <td>{stats?.sub_avg?.[s.code] ?? '–'}</td>
                      <td>{row.sub_rank?.[s.code] || '–'}</td>
                    </tr>
                  );
                })}
                <tr className="total">
                  <td>Total</td>{cwu && <td />}
                  <td>{row.total}<span className="cwu">/{test.total_max}</span></td>
                  <td>{stats?.avg ?? '–'}</td>
                  <td>{row.pct !== '' ? `${row.pct}%` : '–'}</td>
                </tr>
              </tbody>
            </table>
          )}
          <div className="foot">
            <span>Percentile {row.percentile !== '' && row.percentile != null ? row.percentile : '–'}</span>
            <span>Topper {stats?.top ?? '–'} · Avg {stats?.avg ?? '–'}</span>
          </div>
        </div>
      </div>
      {showActions && (
        <div className="row" style={{ justifyContent: 'center' }}>
          <button className="btn primary" onClick={share} disabled={busy}><Icon name="share" size={18} />{busy ? 'Preparing…' : 'Share card'}</button>
        </div>
      )}
    </div>
  );
}
