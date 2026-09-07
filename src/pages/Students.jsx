import React, { useMemo, useRef, useState } from 'react';
import { useStore } from '../lib/store';
import { Sheet, Field, Icon, Empty } from '../components/ui';
import { readSheet, mapStudentRows, exportRows, studentTemplate } from '../lib/excel';

const blank = { roll: '', name: '', batch_id: '', class: '', stream: '', father: '', phone: '', parent_phone: '' };

export default function Students() {
  const { data, api, toast, setData, isAdmin, batchName } = useStore();
  const [batch, setBatch] = useState('');
  const [q, setQ] = useState('');
  const [edit, setEdit] = useState(null);
  const [importRows, setImportRows] = useState(null);
  const [busy, setBusy] = useState(false);
  const [batchForm, setBatchForm] = useState(null);
  const fileRef = useRef();

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return data.students
      .filter((x) => !batch || x.batch_id === batch)
      .filter((x) => !s || x.name.toLowerCase().includes(s) || String(x.roll).toLowerCase().includes(s) || String(x.phone).includes(s))
      .sort((a, b) => a.batch_id.localeCompare(b.batch_id) || String(a.roll).localeCompare(String(b.roll), undefined, { numeric: true }));
  }, [data.students, batch, q]);

  const save = async (rows) => {
    setBusy(true);
    try {
      const r = await api('save_students', { rows });
      setData((d) => ({ ...d, students: r.students }));
      toast(`Saved ${rows.length} student${rows.length > 1 ? 's' : ''}`, 'ok');
      setEdit(null); setImportRows(null);
    } catch (e) { toast(e.message, 'err'); }
    setBusy(false);
  };

  const onFile = async (e) => {
    const file = e.target.files[0]; e.target.value = '';
    if (!file) return;
    try {
      const rows = mapStudentRows(await readSheet(file), data.batches);
      if (!rows.length) return toast('No rows found. Need columns: roll, name, batch, class, stream, father, phone, parent_phone', 'err');
      const bad = rows.filter((r) => !data.batches.some((b) => b.batch_id === r.batch_id));
      if (bad.length) return toast(`${bad.length} rows have an unknown batch (e.g. "${bad[0].batch_id}"). Use batch IDs or exact names.`, 'err');
      setImportRows(rows);
    } catch (err) { toast('Could not read file: ' + err.message, 'err'); }
  };

  const exportAll = () => exportRows(list.map((s) => ({ student_id: s.student_id, roll: s.roll, name: s.name, batch: batchName(s.batch_id), class: s.class, stream: s.stream, father: s.father, phone: s.phone, parent_phone: s.parent_phone, tg_linked: s.tg_id ? 'yes' : '', parent_tg_linked: s.parent_tg_id ? 'yes' : '' })), `students_${batch || 'all'}.xlsx`, 'Students');

  const saveBatch = async () => {
    setBusy(true);
    try {
      const r = await api('save_batch', { batch: batchForm });
      setData((d) => ({ ...d, batches: r.batches }));
      toast('Batch saved', 'ok'); setBatchForm(null);
    } catch (e) { toast(e.message, 'err'); }
    setBusy(false);
  };

  const bot = data.settings.bot_username;
  const copy = async (text) => { try { await navigator.clipboard.writeText(text); toast('Copied', 'ok'); } catch { toast(text); } };

  return (
    <div>
      <div className="page-head">
        <div><h1>Students</h1><p>{list.length} shown · {data.students.length} total</p></div>
        <div className="row">
          <button className="btn sm" onClick={() => fileRef.current.click()}><Icon name="upload" size={16} />Import Excel</button>
          <button className="btn sm" onClick={exportAll}><Icon name="download" size={16} />Export</button>
          <button className="btn primary sm" onClick={() => setEdit({ ...blank, batch_id: batch || data.batches[0]?.batch_id || '' })}><Icon name="plus" size={16} />Add</button>
        </div>
      </div>
      <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" hidden onChange={onFile} />

      <div className="row mb">
        <select className="input" style={{ width: 'auto', minWidth: 160 }} value={batch} onChange={(e) => setBatch(e.target.value)}>
          <option value="">All batches</option>
          {data.batches.map((b) => <option key={b.batch_id} value={b.batch_id}>{b.name}</option>)}
        </select>
        <input className="input" style={{ flex: 1, minWidth: 160 }} placeholder="Search name, roll, mobile" value={q} onChange={(e) => setQ(e.target.value)} />
        {isAdmin && <button className="btn sm" onClick={() => setBatchForm({ name: '', class: '11', stream: 'JEE' })}>New batch</button>}
      </div>

      {list.length === 0 ? (
        <div className="list"><Empty title="No students here">Add one, or import your Excel list. <button className="btn ghost sm" onClick={() => studentTemplate(data.batches)}>Download template</button></Empty></div>
      ) : (
        <div className="list">
          {list.map((s) => (
            <button key={s.student_id} className="item" onClick={() => setEdit({ ...s })}>
              <span className="tag num">{s.roll}</span>
              <div className="grow">
                <span className="title">{s.name}</span>
                <span className="sub">{batchName(s.batch_id)}{s.class ? ` · Class ${s.class}` : ''}{s.phone ? ` · ${s.phone}` : ''}</span>
              </div>
              {(s.tg_id || s.parent_tg_id) && <span className="tag blue">TG</span>}
            </button>
          ))}
        </div>
      )}

      {edit && (
        <Sheet title={edit.student_id ? 'Edit student' : 'Add student'} onClose={() => setEdit(null)}
          actions={<>
            {edit.student_id && <button className="btn danger" onClick={() => save([{ ...edit, active: '0' }])} disabled={busy}>Remove</button>}
            <button className="btn primary" onClick={() => save([edit])} disabled={busy || !edit.name || !edit.batch_id}>{busy ? 'Saving…' : 'Save'}</button>
          </>}>
          <div className="stack">
            <div className="grid2">
              <Field label="Roll no"><input className="input" value={edit.roll} onChange={(e) => setEdit({ ...edit, roll: e.target.value })} /></Field>
              <Field label="Batch">
                <select className="input" value={edit.batch_id} onChange={(e) => { const b = data.batches.find((x) => x.batch_id === e.target.value); setEdit({ ...edit, batch_id: e.target.value, class: edit.class || b?.class || '', stream: edit.stream || b?.stream || '' }); }}>
                  <option value="">Select</option>
                  {data.batches.map((b) => <option key={b.batch_id} value={b.batch_id}>{b.name}</option>)}
                </select>
              </Field>
            </div>
            <Field label="Name"><input className="input" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
            <div className="grid2">
              <Field label="Class"><input className="input" value={edit.class} onChange={(e) => setEdit({ ...edit, class: e.target.value })} placeholder="9 / 10 / 11 / 12" /></Field>
              <Field label="Stream"><input className="input" value={edit.stream} onChange={(e) => setEdit({ ...edit, stream: e.target.value.toUpperCase() })} placeholder="JEE / NEET / BOARD" /></Field>
            </div>
            <Field label="Father's name"><input className="input" value={edit.father} onChange={(e) => setEdit({ ...edit, father: e.target.value })} /></Field>
            <div className="grid2">
              <Field label="Student mobile"><input className="input" inputMode="numeric" value={edit.phone} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} /></Field>
              <Field label="Parent mobile"><input className="input" inputMode="numeric" value={edit.parent_phone} onChange={(e) => setEdit({ ...edit, parent_phone: e.target.value })} /></Field>
            </div>
            {edit.student_id && (
              <div className="panel"><div className="panel-body stack">
                <div className="row between"><b className="small">Telegram</b><span className="small muted">{edit.tg_id ? 'Student linked' : 'Student not linked'} · {edit.parent_tg_id ? 'Parent linked' : 'Parent not linked'}</span></div>
                {bot ? (
                  <div className="row">
                    <button className="btn sm" onClick={() => copy(`https://t.me/${bot}?start=${edit.student_id}`)}><Icon name="copy" size={14} />Student link</button>
                    <button className="btn sm" onClick={() => copy(`https://t.me/${bot}?start=P-${edit.student_id}`)}><Icon name="copy" size={14} />Parent link</button>
                  </div>
                ) : <span className="hint">Set the bot username in Settings to get one-tap link codes. Students can also send /link mobile to the bot.</span>}
              </div></div>
            )}
          </div>
        </Sheet>
      )}

      {importRows && (
        <Sheet title={`Import ${importRows.length} students`} onClose={() => setImportRows(null)}
          actions={<><button className="btn" onClick={() => setImportRows(null)}>Cancel</button><button className="btn primary" onClick={() => save(importRows)} disabled={busy}>{busy ? 'Importing…' : 'Import all'}</button></>}>
          <p className="small muted mb">Existing students (same batch + roll) will be updated, others added.</p>
          <div className="tablewrap preview">
            <table className="t">
              <thead><tr><th>Roll</th><th>Name</th><th>Batch</th><th>Class</th><th>Mobile</th></tr></thead>
              <tbody>{importRows.slice(0, 200).map((r, i) => <tr key={i}><td>{r.roll}</td><td>{r.name}</td><td>{batchName(r.batch_id)}</td><td>{r.class}</td><td>{r.phone}</td></tr>)}</tbody>
            </table>
          </div>
        </Sheet>
      )}

      {batchForm && (
        <Sheet title="New batch" onClose={() => setBatchForm(null)} actions={<button className="btn primary" onClick={saveBatch} disabled={busy || !batchForm.name}>Save batch</button>}>
          <div className="stack">
            <Field label="Batch name"><input className="input" value={batchForm.name} onChange={(e) => setBatchForm({ ...batchForm, name: e.target.value })} placeholder="e.g. JEE 11 Super30" /></Field>
            <div className="grid2">
              <Field label="Class"><input className="input" value={batchForm.class} onChange={(e) => setBatchForm({ ...batchForm, class: e.target.value })} /></Field>
              <Field label="Stream"><input className="input" value={batchForm.stream} onChange={(e) => setBatchForm({ ...batchForm, stream: e.target.value.toUpperCase() })} /></Field>
            </div>
          </div>
        </Sheet>
      )}
    </div>
  );
}
