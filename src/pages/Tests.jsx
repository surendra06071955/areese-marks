import React, { useEffect, useState } from 'react';
import { useStore } from '../lib/store';
import { Sheet, Field, Check, Seg, Icon, Empty, fmtDate } from '../components/ui';
import { PATTERNS, normalizeTest, subjectMax } from '../lib/scoring';

const today = () => new Date().toISOString().slice(0, 10);

function fromPattern(key) {
  const p = PATTERNS[key];
  return { pattern: key, mode: p.mode, subjects: p.subjects.map((s) => ({ ...s })) };
}

export default function Tests({ go, params }) {
  const { data, api, toast, setData, batchName, isAdmin } = useStore();
  const [edit, setEdit] = useState(null);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState('');

  useEffect(() => { if (params?.create) setEdit(newTest()); }, [params]);

  function newTest() {
    return { name: '', date: today(), batch_ids: data.batches.length === 1 ? [data.batches[0].batch_id] : [], ...fromPattern('JEE_MAIN') };
  }

  const list = [...data.tests].filter((t) => !filter || t.batch_ids.includes(filter))
    .sort((a, b) => String(b.date).localeCompare(String(a.date)) || b.test_id.localeCompare(a.test_id));

  const save = async () => {
    const t = normalizeTest(edit);
    if (!t.name.trim()) return toast('Give the test a name', 'err');
    if (!t.batch_ids.length) return toast('Select at least one batch', 'err');
    if (t.subjects.some((s) => !s.code || !s.max)) return toast('Each subject needs a code and marks', 'err');
    const codes = t.subjects.map((s) => s.code);
    if (new Set(codes).size !== codes.length) return toast('Subject codes must be unique', 'err');
    setBusy(true);
    try {
      const r = await api('save_test', { test: t });
      setData((d) => ({ ...d, tests: d.tests.some((x) => x.test_id === r.test.test_id) ? d.tests.map((x) => (x.test_id === r.test.test_id ? r.test : x)) : [...d.tests, r.test] }));
      toast(edit.test_id ? 'Test updated' : 'Test created', 'ok');
      setEdit(null);
      if (!edit.test_id) go('marks', { test_id: r.test.test_id });
    } catch (e) { toast(e.message, 'err'); }
    setBusy(false);
  };

  const del = async () => {
    if (!confirm(`Delete "${edit.name}"? The marks tab is hidden, not erased.`)) return;
    setBusy(true);
    try {
      await api('delete_test', { test_id: edit.test_id });
      setData((d) => ({ ...d, tests: d.tests.filter((x) => x.test_id !== edit.test_id) }));
      toast('Test deleted', 'ok'); setEdit(null);
    } catch (e) { toast(e.message, 'err'); }
    setBusy(false);
  };

  const setSub = (i, k, v) => setEdit({ ...edit, subjects: edit.subjects.map((s, j) => (j === i ? { ...s, [k]: v } : s)) });
  const total = edit ? edit.subjects.reduce((a, s) => a + subjectMax(s, edit.mode), 0) : 0;

  return (
    <div>
      <div className="page-head">
        <div><h1>Tests</h1><p>{list.length} test{list.length === 1 ? '' : 's'}</p></div>
        <button className="btn primary" onClick={() => setEdit(newTest())}><Icon name="plus" size={18} />New test</button>
      </div>

      {data.batches.length > 1 && (
        <div className="row mb">
          <select className="input" style={{ width: 'auto', minWidth: 160 }} value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="">All batches</option>
            {data.batches.map((b) => <option key={b.batch_id} value={b.batch_id}>{b.name}</option>)}
          </select>
        </div>
      )}

      {list.length === 0 ? <div className="list"><Empty title="No tests yet">Create one to start entering marks.</Empty></div> : (
        <div className="list">
          {list.map((t) => (
            <div key={t.test_id} className="item">
              <div className="grow">
                <span className="title">{t.name}</span>
                <span className="sub">{fmtDate(t.date)} · {t.batch_ids.map(batchName).join(', ')} · {t.subjects.map((s) => s.code).join('/')} · {t.total_max} marks</span>
              </div>
              <span className={`tag ${t.published ? 'green' : ''}`}>{t.published ? 'Published' : 'Draft'}</span>
              <button className="btn sm" onClick={() => go('marks', { test_id: t.test_id })}>Marks</button>
              <button className="btn sm" onClick={() => go('results', { test_id: t.test_id })}>Results</button>
              <button className="iconbtn" aria-label="Edit" onClick={() => setEdit({ ...t, subjects: t.subjects.map((s) => ({ ...s })) })}><Icon name="edit" size={18} /></button>
            </div>
          ))}
        </div>
      )}

      {edit && (
        <Sheet title={edit.test_id ? 'Edit test' : 'New test'} onClose={() => setEdit(null)}
          actions={<>
            {edit.test_id && isAdmin && <button className="btn danger" onClick={del} disabled={busy}>Delete</button>}
            <button className="btn primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : edit.test_id ? 'Save changes' : 'Create & enter marks'}</button>
          </>}>
          <div className="stack">
            <div className="grid2">
              <Field label="Test name"><input className="input" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} placeholder="Minor Test 3" /></Field>
              <Field label="Date"><input className="input" type="date" value={edit.date} onChange={(e) => setEdit({ ...edit, date: e.target.value })} /></Field>
            </div>
            <Field label="Batches">
              <div className="row">
                {data.batches.map((b) => (
                  <Check key={b.batch_id} checked={edit.batch_ids.includes(b.batch_id)} onChange={(on) => setEdit({ ...edit, batch_ids: on ? [...edit.batch_ids, b.batch_id] : edit.batch_ids.filter((x) => x !== b.batch_id) })}>{b.name}</Check>
                ))}
              </div>
            </Field>
            {!edit.test_id && (
              <Field label="Pattern">
                <select className="input" value={edit.pattern} onChange={(e) => setEdit({ ...edit, ...fromPattern(e.target.value) })}>
                  {Object.entries(PATTERNS).map(([k, p]) => <option key={k} value={k}>{p.label}</option>)}
                </select>
              </Field>
            )}
            <Field label="Marks entry" hint={edit.mode === 'cwu' ? 'Enter correct & wrong per subject; unattempted and negative marking are automatic.' : 'Enter marks per subject directly.'}>
              <Seg value={edit.mode} onChange={(mode) => setEdit({ ...edit, mode, subjects: edit.subjects.map((s) => ({ ...s, q: s.q || 25, plus: s.plus || 4, minus: s.minus ?? 1, max: s.max || 100 })) })}
                options={[{ value: 'cwu', label: 'Correct / Wrong' }, { value: 'marks', label: 'Direct marks' }]} />
            </Field>
            <Field label={`Subjects · total ${total} marks`}>
              <div className="tablewrap">
                <table className="t">
                  <thead><tr><th>Code</th><th>Name</th>{edit.mode === 'cwu' ? <><th className="n">Qs</th><th className="n">+</th><th className="n">−</th></> : <th className="n">Max</th>}<th /></tr></thead>
                  <tbody>
                    {edit.subjects.map((s, i) => (
                      <tr key={i}>
                        <td><input className="input" style={{ width: 70, minHeight: 36, padding: '6px 8px' }} value={s.code} onChange={(e) => setSub(i, 'code', e.target.value.toUpperCase())} /></td>
                        <td><input className="input" style={{ width: 120, minHeight: 36, padding: '6px 8px' }} value={s.name} onChange={(e) => setSub(i, 'name', e.target.value)} /></td>
                        {edit.mode === 'cwu' ? (
                          <>
                            <td><input className="input" type="number" style={{ width: 64, minHeight: 36, padding: '6px 8px' }} value={s.q} onChange={(e) => setSub(i, 'q', e.target.value)} /></td>
                            <td><input className="input" type="number" style={{ width: 56, minHeight: 36, padding: '6px 8px' }} value={s.plus} onChange={(e) => setSub(i, 'plus', e.target.value)} /></td>
                            <td><input className="input" type="number" style={{ width: 56, minHeight: 36, padding: '6px 8px' }} value={s.minus} onChange={(e) => setSub(i, 'minus', e.target.value)} /></td>
                          </>
                        ) : (
                          <td><input className="input" type="number" style={{ width: 72, minHeight: 36, padding: '6px 8px' }} value={s.max} onChange={(e) => setSub(i, 'max', e.target.value)} /></td>
                        )}
                        <td><button className="iconbtn" aria-label="Remove subject" onClick={() => setEdit({ ...edit, subjects: edit.subjects.filter((_, j) => j !== i) })}><Icon name="x" size={16} /></button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div><button className="btn sm mt" onClick={() => setEdit({ ...edit, subjects: [...edit.subjects, edit.mode === 'cwu' ? { code: '', name: '', q: 25, plus: 4, minus: 1 } : { code: '', name: '', max: 100 }] })}><Icon name="plus" size={14} />Add subject</button></div>
            </Field>
            {edit.test_id && <p className="hint">Subjects can only change while no marks are entered.</p>}
          </div>
        </Sheet>
      )}
    </div>
  );
}
