import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../lib/store';
import { db, kv } from '../lib/db';
import { Icon, fmtDate, Empty } from '../components/ui';
import { rankRows, validateEntry, num } from '../lib/scoring';
import { readSheet } from '../lib/excel';

export default function MarksEntry({ params, go }) {
  const { data, api, toast, me, enqueue, batchName, online } = useStore();
  const test = data.tests.find((t) => t.test_id === params?.test_id);
  const [rows, setRows] = useState(null);
  const [dirty, setDirty] = useState({});
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState('');
  const [source, setSource] = useState('');
  const fileRef = useRef();
  const gridRef = useRef();
  const cwu = test?.mode === 'cwu';
  const canSub = (code) => me.role === 'admin' || !me.subjects?.length || me.subjects.includes(code);

  // Load server rows (or cache) then overlay local draft
  useEffect(() => {
    if (!test) return;
    let alive = true;
    (async () => {
      let base = null;
      try { base = await api('get_marks', { test_id: test.test_id }); await kv.set('marks_' + test.test_id, base); setSource('server'); }
      catch (e) { base = await kv.get('marks_' + test.test_id); setSource(base ? 'cache' : 'none'); if (!base) toast(e.message, 'err'); }
      if (!alive) return;
      const list = base ? base.rows.map(toRaw) : data.students.filter((s) => test.batch_ids.includes(s.batch_id)).map((s) => ({ student_id: s.student_id, roll: s.roll, name: s.name, absent: false, subj: {} }));
      const draft = await db.drafts.get(test.test_id);
      const d = {};
      if (draft) {
        list.forEach((r) => { if (draft.rows[r.student_id]) { Object.assign(r, draft.rows[r.student_id]); d[r.student_id] = true; } });
        if (Object.keys(d).length) toast('Unsaved entries restored from this device');
      }
      list.sort((a, b) => String(a.roll).localeCompare(String(b.roll), undefined, { numeric: true }));
      setRows(list); setDirty(d);
    })();
    return () => { alive = false; };
  }, [test?.test_id]); // eslint-disable-line

  function toRaw(r) {
    const subj = {};
    (test.subjects || []).forEach((s) => {
      const x = r.subj?.[s.code] || {};
      subj[s.code] = cwu ? { c: x.entered ? x.c : '', w: x.entered ? x.w : '' } : { m: x.entered ? x.m : '' };
    });
    return { student_id: r.student_id, roll: r.roll, name: r.name, absent: !!r.absent, subj };
  }

  const computed = useMemo(() => (test && rows ? rankRows(test, rows) : null), [test, rows]);
  const shown = useMemo(() => {
    if (!computed) return [];
    const s = q.trim().toLowerCase();
    return computed.rows.filter((r) => !s || r.name.toLowerCase().includes(s) || String(r.roll).toLowerCase().includes(s));
  }, [computed, q]);

  const persistDraft = (nextRows, nextDirty) => {
    const d = {};
    nextRows.forEach((r) => { if (nextDirty[r.student_id]) d[r.student_id] = { absent: r.absent, subj: r.subj }; });
    if (Object.keys(d).length) db.drafts.put({ test_id: test.test_id, rows: d, at: Date.now() }); else db.drafts.delete(test.test_id);
  };

  const update = (sid, fn) => {
    setRows((rs) => {
      const next = rs.map((r) => (r.student_id === sid ? fn({ ...r, subj: { ...r.subj } }) : r));
      const nd = { ...dirty, [sid]: true };
      setDirty(nd); persistDraft(next, nd);
      return next;
    });
  };
  const setCell = (sid, code, k, v) => update(sid, (r) => { r.subj[code] = { ...(r.subj[code] || {}), [k]: v === '' ? '' : v.replace(/[^\d.-]/g, '') }; return r; });
  const setAbsent = (sid, v) => update(sid, (r) => { r.absent = v; return r; });

  const save = async () => {
    const changed = rows.filter((r) => dirty[r.student_id]).map((r) => ({ student_id: r.student_id, absent: r.absent, subj: r.subj }));
    if (!changed.length) return toast('Nothing to save');
    for (const r of rows) for (const s of test.subjects) { const e = validateEntry(test, s, r.subj[s.code]); if (e && dirty[r.student_id]) return toast(`${r.name} · ${s.code}: ${e}`, 'err'); }
    setBusy(true);
    try {
      const res = await api('save_marks', { test_id: test.test_id, rows: changed });
      await kv.set('marks_' + test.test_id, res);
      setRows(res.rows.map(toRaw).sort((a, b) => String(a.roll).localeCompare(String(b.roll), undefined, { numeric: true })));
      setDirty({}); await db.drafts.delete(test.test_id);
      toast(`Saved ${changed.length} student${changed.length > 1 ? 's' : ''}`, 'ok');
    } catch (e) {
      if (e.kind === 'offline') {
        await enqueue('save_marks', { test_id: test.test_id, rows: changed }, `${test.name} · ${changed.length} students`);
        toast('Offline — saved on this device, will sync when online', 'ok');
      } else toast(e.message, 'err');
    }
    setBusy(false);
  };

  // Keyboard: Enter / ↓ moves down the same column, ↑ moves up
  const onKey = (e) => {
    if (!['Enter', 'ArrowDown', 'ArrowUp'].includes(e.key)) return;
    e.preventDefault();
    const col = e.target.dataset.col, row = Number(e.target.dataset.row);
    const nextRow = row + (e.key === 'ArrowUp' ? -1 : 1);
    const el = gridRef.current.querySelector(`input[data-col="${col}"][data-row="${nextRow}"]`);
    if (el) { el.focus(); el.select(); }
  };

  // Excel import: match on roll or student_id; headers CODE_C / CODE_W (cwu) or CODE (marks)
  const onFile = async (e) => {
    const file = e.target.files[0]; e.target.value = '';
    if (!file) return;
    try {
      const sheet = await readSheet(file);
      const norm = (k) => String(k).toUpperCase().replace(/[^A-Z0-9]/g, '');
      let matched = 0;
      const byRoll = {}; rows.forEach((r) => { byRoll[String(r.roll).trim().toLowerCase()] = r.student_id; byRoll[r.student_id.toLowerCase()] = r.student_id; });
      const updates = {};
      sheet.forEach((line) => {
        const keys = Object.keys(line);
        const rollKey = keys.find((k) => ['ROLL', 'ROLLNO', 'STUDENTID', 'ID'].includes(norm(k)));
        const sid = rollKey && byRoll[String(line[rollKey]).trim().toLowerCase()];
        if (!sid) return;
        const subj = {};
        test.subjects.forEach((s) => {
          const find = (suffixes) => keys.find((k) => suffixes.includes(norm(k)));
          if (cwu) {
            const kc = find([s.code + 'C', s.code + 'CORRECT']), kw = find([s.code + 'W', s.code + 'WRONG']);
            if (kc || kw) subj[s.code] = { c: kc ? String(line[kc]) : '0', w: kw ? String(line[kw]) : '0' };
          } else {
            const km = find([s.code, s.code + 'M', s.code + 'MARKS']);
            if (km) subj[s.code] = { m: String(line[km]) };
          }
        });
        const abKey = keys.find((k) => ['ABSENT', 'AB'].includes(norm(k)));
        updates[sid] = { subj, absent: abKey ? /^(1|y|yes|ab|absent|true)$/i.test(String(line[abKey]).trim()) : undefined };
        matched++;
      });
      if (!matched) return toast('No rows matched. Need a Roll column and columns like PHY_C, PHY_W (or PHY for direct marks).', 'err');
      setRows((rs) => {
        const next = rs.map((r) => {
          const u = updates[r.student_id]; if (!u) return r;
          const subj = { ...r.subj }; Object.keys(u.subj).forEach((c) => { if (canSub(c)) subj[c] = u.subj[c]; });
          return { ...r, subj, absent: u.absent == null ? r.absent : u.absent };
        });
        const nd = { ...dirty }; Object.keys(updates).forEach((sid) => { nd[sid] = true; });
        setDirty(nd); persistDraft(next, nd);
        return next;
      });
      toast(`Filled ${matched} students from Excel — review and save`, 'ok');
    } catch (err) { toast('Could not read file: ' + err.message, 'err'); }
  };

  if (!test) return <Empty title="Test not found"><button className="btn" onClick={() => go('tests')}>Back to tests</button></Empty>;
  if (!rows) return <div className="empty">Loading marks…</div>;

  const dirtyCount = Object.keys(dirty).length;
  const enteredCount = computed.rows.filter((r) => r.entered || r.absent).length;

  return (
    <div>
      <div className="page-head">
        <div className="row" style={{ gap: 10 }}>
          <button className="iconbtn" aria-label="Back" onClick={() => go('tests')}><Icon name="back" /></button>
          <div>
            <h1>{test.name}</h1>
            <p>{fmtDate(test.date)} · {test.batch_ids.map(batchName).join(', ')} · {enteredCount}/{rows.length} entered{source === 'cache' ? ' · offline copy' : ''}</p>
          </div>
        </div>
        <div className="row">
          <button className="btn sm" onClick={() => fileRef.current.click()}><Icon name="upload" size={16} />Fill from Excel</button>
          <button className="btn sm" onClick={() => go('results', { test_id: test.test_id })}>Results</button>
          <button className="btn primary" onClick={save} disabled={busy || !dirtyCount}>{busy ? 'Saving…' : dirtyCount ? `Save ${dirtyCount}` : 'Saved'}</button>
        </div>
      </div>
      <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" hidden onChange={onFile} />

      <div className="row mb between">
        <input className="input" style={{ maxWidth: 280 }} placeholder="Jump to name or roll" value={q} onChange={(e) => setQ(e.target.value)} />
        <span className="small muted hint-long">{cwu ? 'Type Correct and Wrong — unattempted, negative marking, total and rank update as you type.' : 'Type marks per subject — total and rank update as you type.'} Enter ↵ moves down.</span>
      </div>

      <div className="grid" ref={gridRef}>
        <table>
          <thead>
            <tr>
              <th className="name" rowSpan={2}>Student</th>
              <th rowSpan={2}>Absent</th>
              {test.subjects.map((s) => <th key={s.code} className="sub" colSpan={cwu ? 4 : 1}>{s.name} <span className="muted">/{s.max}</span></th>)}
              <th rowSpan={2}>Total</th><th rowSpan={2}>Rank</th>
            </tr>
            <tr>
              {test.subjects.map((s) => cwu ? <React.Fragment key={s.code}><th>C</th><th>W</th><th>U</th><th>M</th></React.Fragment> : <th key={s.code}>Marks</th>)}
            </tr>
          </thead>
          <tbody>
            {shown.map((r, i) => (
              <tr key={r.student_id} className={r.absent ? 'absent' : ''}>
                <td className="name"><span>{r.name}</span><span className="roll">Roll {r.roll}{dirty[r.student_id] ? ' · edited' : ''}</span></td>
                <td className="ab"><input type="checkbox" checked={!!r.absent} onChange={(e) => setAbsent(r.student_id, e.target.checked)} aria-label={`${r.name} absent`} /></td>
                {test.subjects.map((s) => {
                  const raw = rows.find((x) => x.student_id === r.student_id).subj[s.code] || {};
                  const err = validateEntry(test, s, raw);
                  const dis = r.absent || !canSub(s.code);
                  return cwu ? (
                    <React.Fragment key={s.code}>
                      <td><input className={`cell ${err ? 'err' : ''}`} inputMode="numeric" data-col={s.code + 'c'} data-row={i} value={raw.c ?? ''} disabled={dis} onChange={(e) => setCell(r.student_id, s.code, 'c', e.target.value)} onKeyDown={onKey} onFocus={(e) => e.target.select()} aria-label={`${r.name} ${s.code} correct`} /></td>
                      <td><input className={`cell ${err ? 'err' : ''}`} inputMode="numeric" data-col={s.code + 'w'} data-row={i} value={raw.w ?? ''} disabled={dis} onChange={(e) => setCell(r.student_id, s.code, 'w', e.target.value)} onKeyDown={onKey} onFocus={(e) => e.target.select()} aria-label={`${r.name} ${s.code} wrong`} /></td>
                      <td className="calc">{r.subj[s.code].entered ? r.subj[s.code].u : ''}</td>
                      <td className="calc strong">{r.subj[s.code].entered ? r.subj[s.code].m : ''}</td>
                    </React.Fragment>
                  ) : (
                    <td key={s.code}><input className={`cell ${err ? 'err' : ''}`} inputMode="decimal" data-col={s.code} data-row={i} value={raw.m ?? ''} disabled={dis} onChange={(e) => setCell(r.student_id, s.code, 'm', e.target.value)} onKeyDown={onKey} onFocus={(e) => e.target.select()} aria-label={`${r.name} ${s.code} marks`} /></td>
                  );
                })}
                <td className="calc strong">{r.entered ? r.total : r.absent ? 'AB' : ''}</td>
                <td className="calc">{r.rank || ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!online && <p className="hint mt">Offline: your entries stay on this phone and sync when internet returns.</p>}
      {num(computed.stats.n) > 0 && <p className="small muted mt">Batch average {computed.stats.avg} · Top {computed.stats.top} · {computed.stats.n} appeared</p>}
    </div>
  );
}
