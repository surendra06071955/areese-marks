import React, { useState } from 'react';
import { useStore } from '../lib/store';
import { cfg, call, tgWebApp } from '../lib/api';
import { Field, Seg } from '../components/ui';

export default function Login() {
  const { login, toast } = useStore();
  const [kind, setKind] = useState('login');
  const [apiUrl, setApiUrl] = useState(cfg.api);
  const [editApi, setEditApi] = useState(!cfg.api);
  const [f, setF] = useState({ user: '', pin: '', roll: '', phone: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const saveApi = async () => {
    const url = apiUrl.trim();
    if (!/^https?:\/\/\S+/.test(url)) { setErr('Paste the full Apps Script web app URL (ends with /exec)'); return; }
    setBusy(true); setErr('');
    try {
      const r = await call('ping', {}, { url });
      cfg.api = url; setEditApi(false);
      toast(`Connected to ${r.institute || 'server'}`, 'ok');
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setErr('');
    try {
      if (kind === 'login') await login('login', { user: f.user, pin: f.pin });
      else await login('student_login', { roll: f.roll, phone: f.phone });
    } catch (e2) { setErr(e2.message); }
    setBusy(false);
  };

  const tgLogin = async () => {
    const t = tgWebApp();
    if (!t) return;
    setBusy(true); setErr('');
    try { await login('tg_login', { initData: t.initData }); } catch (e) { setErr(e.message); }
    setBusy(false);
  };

  return (
    <div className="login">
      <div className="box">
        <div className="mark">
          <img src="./icon.svg" alt="" />
          <div><h1>AREESE Marks</h1><p>JEE · NEET · Class 9–12</p></div>
        </div>

        {editApi ? (
          <div className="stack">
            <Field label="Server URL (Apps Script /exec)" hint="From Google Sheet → Extensions → Apps Script → Deploy → Web app" error={err}>
              <input className="input" value={apiUrl} onChange={(e) => setApiUrl(e.target.value)} placeholder="https://script.google.com/macros/s/…/exec" autoCapitalize="off" autoCorrect="off" />
            </Field>
            <div className="row">
              <button className="btn primary" onClick={saveApi} disabled={busy}>{busy ? 'Checking…' : 'Connect'}</button>
              {cfg.api && <button className="btn ghost" onClick={() => { setEditApi(false); setErr(''); }}>Cancel</button>}
            </div>
          </div>
        ) : (
          <form className="stack" onSubmit={submit}>
            <Seg value={kind} onChange={(v) => { setKind(v); setErr(''); }} options={[{ value: 'login', label: 'Staff' }, { value: 'student_login', label: 'Student / Parent' }]} />
            {kind === 'login' ? (
              <>
                <Field label="User ID"><input className="input" value={f.user} onChange={set('user')} autoCapitalize="off" autoComplete="username" required /></Field>
                <Field label="PIN"><input className="input" type="password" inputMode="numeric" value={f.pin} onChange={set('pin')} autoComplete="current-password" required /></Field>
              </>
            ) : (
              <>
                <Field label="Roll number"><input className="input" value={f.roll} onChange={set('roll')} required /></Field>
                <Field label="Registered mobile" hint="Student or parent mobile given at admission"><input className="input" inputMode="numeric" value={f.phone} onChange={set('phone')} required /></Field>
              </>
            )}
            {err && <p className="errtext">{err}</p>}
            <button className="btn primary block" type="submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
            {tgWebApp() && <button type="button" className="btn block" onClick={tgLogin} disabled={busy}>Continue with Telegram</button>}
            <button type="button" className="btn ghost" onClick={() => setEditApi(true)}>Change server URL</button>
          </form>
        )}
      </div>
    </div>
  );
}
