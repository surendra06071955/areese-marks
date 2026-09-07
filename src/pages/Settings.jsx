import React, { useState } from 'react';
import { useStore } from '../lib/store';
import { cfg } from '../lib/api';
import { db } from '../lib/db';
import { Sheet, Field, Check, Icon } from '../components/ui';

export default function Settings() {
  const { me, data, api, toast, setData, isAdmin, logout, pending, flush, refreshPending, online } = useStore();
  const [inst, setInst] = useState({ institute_name: data.settings.institute_name || '', session: data.settings.session || '', bot_username: data.settings.bot_username || '' });
  const [user, setUser] = useState(null);
  const [busy, setBusy] = useState(false);

  const saveInst = async () => {
    setBusy(true);
    try { const r = await api('save_settings', { settings: inst }); setData((d) => ({ ...d, settings: r.settings })); toast('Saved', 'ok'); }
    catch (e) { toast(e.message, 'err'); }
    setBusy(false);
  };

  const saveUser = async () => {
    setBusy(true);
    try { const r = await api('save_user', { user }); setData((d) => ({ ...d, users: r.users })); toast('User saved', 'ok'); setUser(null); }
    catch (e) { toast(e.message, 'err'); }
    setBusy(false);
  };

  const discard = async (id) => { await db.queue.delete(id); await refreshPending(); };

  return (
    <div>
      <div className="page-head"><div><h1>Settings</h1><p>{me.name} · {me.role}</p></div><button className="btn sm" onClick={logout}><Icon name="logout" size={16} />Sign out</button></div>

      <div className="panel mb">
        <div className="panel-head"><h3>Pending sync</h3><span className={`row small ${online ? '' : 'muted'}`}><span className={`dot ${online ? '' : 'off'}`} />{online ? 'Online' : 'Offline'}</span></div>
        <div className="panel-body stack">
          {pending.length === 0 ? <p className="small muted">Everything is saved to the server.</p> : pending.map((p) => (
            <div key={p.id} className="row between">
              <span className="small">{p.label || p.action}{p.error ? <span className="errtext"> · {p.error}</span> : ''}</span>
              <button className="btn sm danger" onClick={() => discard(p.id)}>Discard</button>
            </div>
          ))}
          {pending.length > 0 && <button className="btn sm" onClick={flush} disabled={!online}>Retry now</button>}
        </div>
      </div>

      <div className="panel mb">
        <div className="panel-head"><h3>Server</h3></div>
        <div className="panel-body stack">
          <p className="small" style={{ wordBreak: 'break-all' }}>{cfg.api}</p>
          <button className="btn sm" onClick={async () => { await logout(); cfg.api = ''; }}>Change server URL (signs out)</button>
        </div>
      </div>

      {isAdmin && (
        <>
          <div className="panel mb">
            <div className="panel-head"><h3>Institute</h3></div>
            <div className="panel-body stack">
              <Field label="Institute name (shown on report cards)"><input className="input" value={inst.institute_name} onChange={(e) => setInst({ ...inst, institute_name: e.target.value })} /></Field>
              <div className="grid2">
                <Field label="Session"><input className="input" value={inst.session} onChange={(e) => setInst({ ...inst, session: e.target.value })} placeholder="2026-27" /></Field>
                <Field label="Telegram bot username" hint="Without @. Enables one-tap link codes."><input className="input" value={inst.bot_username} onChange={(e) => setInst({ ...inst, bot_username: e.target.value.replace('@', '') })} placeholder="areese_marks_bot" /></Field>
              </div>
              <div><button className="btn primary" onClick={saveInst} disabled={busy}>Save</button></div>
            </div>
          </div>

          <div className="panel mb">
            <div className="panel-head"><h3>Staff logins</h3><button className="btn sm" onClick={() => setUser({ user_id: '', name: '', pin: '', role: 'faculty', batches: [], subjects: [] })}><Icon name="plus" size={14} />Add</button></div>
            <div className="list" style={{ border: 0, borderRadius: 0 }}>
              {data.users.map((u) => (
                <button key={u.user_id} className="item" onClick={() => setUser({ ...u, pin: '', batches: String(u.batches || '').split(',').filter(Boolean), subjects: String(u.subjects || '').split(',').filter(Boolean) })}>
                  <div className="grow"><span className="title">{u.name} <span className="muted small">· {u.user_id}</span></span><span className="sub">{u.role}{u.batches ? ` · ${u.batches}` : ' · all batches'}{u.subjects ? ` · ${u.subjects}` : ''}{u.active === '0' ? ' · disabled' : ''}</span></div>
                  <Icon name="edit" size={16} />
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      <p className="hint">AREESE Marks v1.0 · Data lives in your Google Sheet. Open it any time to view or fix records.</p>

      {user && (
        <Sheet title={user.user_id && data.users.some((u) => u.user_id === user.user_id) ? 'Edit staff login' : 'New staff login'} onClose={() => setUser(null)}
          actions={<button className="btn primary" onClick={saveUser} disabled={busy || !user.user_id || !user.name}>Save</button>}>
          <div className="stack">
            <div className="grid2">
              <Field label="User ID"><input className="input" value={user.user_id} onChange={(e) => setUser({ ...user, user_id: e.target.value.trim().toLowerCase() })} autoCapitalize="off" /></Field>
              <Field label={user.pin === '' && data.users.some((u) => u.user_id === user.user_id) ? 'New PIN (blank = keep)' : 'PIN'}><input className="input" inputMode="numeric" value={user.pin} onChange={(e) => setUser({ ...user, pin: e.target.value })} /></Field>
            </div>
            <Field label="Name"><input className="input" value={user.name} onChange={(e) => setUser({ ...user, name: e.target.value })} /></Field>
            <Field label="Role">
              <div className="seg">{['faculty', 'admin'].map((r) => <button key={r} className={user.role === r ? 'on' : ''} onClick={() => setUser({ ...user, role: r })}>{r}</button>)}</div>
            </Field>
            <Field label="Batches (none = all)">
              <div className="row">{data.batches.map((b) => <Check key={b.batch_id} checked={user.batches.includes(b.batch_id)} onChange={(on) => setUser({ ...user, batches: on ? [...user.batches, b.batch_id] : user.batches.filter((x) => x !== b.batch_id) })}>{b.name}</Check>)}</div>
            </Field>
            <Field label="Subjects they can enter (none = all)" hint="Comma separated codes, e.g. PHY,CHE"><input className="input" value={user.subjects.join(',')} onChange={(e) => setUser({ ...user, subjects: e.target.value.toUpperCase().split(',').map((x) => x.trim()).filter(Boolean) })} /></Field>
            <Field label="Telegram ID (optional)" hint="Send /id to the bot to get it. Lets this person sign in inside Telegram."><input className="input" inputMode="numeric" value={user.tg_id || ''} onChange={(e) => setUser({ ...user, tg_id: e.target.value })} /></Field>
            <Check checked={user.active !== '0'} onChange={(on) => setUser({ ...user, active: on ? '1' : '0' })}>Active</Check>
          </div>
        </Sheet>
      )}
    </div>
  );
}
