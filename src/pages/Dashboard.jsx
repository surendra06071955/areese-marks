import React from 'react';
import { useStore } from '../lib/store';
import { Empty, Icon, fmtDate } from '../components/ui';

export default function Dashboard({ go }) {
  const { me, data, pending, online, batchName, refresh, loading } = useStore();
  const tests = [...data.tests].sort((a, b) => String(b.date).localeCompare(String(a.date)) || b.test_id.localeCompare(a.test_id)).slice(0, 6);
  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <div>
      <div className="page-head">
        <div><h1>{greet}, {me.name.split(' ')[0]}</h1><p>{data.settings.institute_name || 'AREESE'} · {data.settings.session || ''}</p></div>
        <button className="btn sm" onClick={() => refresh()} disabled={loading}><Icon name="refresh" size={16} />{loading ? 'Refreshing…' : 'Refresh'}</button>
      </div>

      <div className="grid3 mb">
        <div className="stat"><div className="v num">{data.students.length}</div><div className="l">Students</div></div>
        <div className="stat"><div className="v num">{data.batches.length}</div><div className="l">Batches</div></div>
        <div className="stat"><div className="v num">{data.tests.length}</div><div className="l">Tests</div></div>
      </div>

      {(!online || pending.length > 0) && (
        <div className="panel mb"><div className="panel-body row between">
          <span className="small">{!online ? 'Offline — entries are kept on this device' : ''}{pending.length ? ` · ${pending.length} change${pending.length > 1 ? 's' : ''} waiting to sync` : ''}</span>
          <button className="btn sm" onClick={() => go('settings')}>Details</button>
        </div></div>
      )}

      <div className="row mb">
        <button className="btn primary" onClick={() => go('tests', { create: true })}><Icon name="plus" size={18} />New test</button>
        <button className="btn" onClick={() => go('students')}>Students</button>
        <button className="btn" onClick={() => go('analytics')}>Analytics</button>
      </div>

      <h2 className="mb">Recent tests</h2>
      {tests.length === 0 ? (
        <div className="list"><Empty title="No tests yet">Create a test, then enter marks from your phone or laptop.</Empty></div>
      ) : (
        <div className="list">
          {tests.map((t) => (
            <button key={t.test_id} className="item" onClick={() => go('results', { test_id: t.test_id })}>
              <div className="grow">
                <span className="title">{t.name}</span>
                <span className="sub">{fmtDate(t.date)} · {t.batch_ids.map(batchName).join(', ')} · {t.total_max} marks</span>
              </div>
              <span className={`tag ${t.published ? 'green' : ''}`}>{t.published ? 'Published' : 'Draft'}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
