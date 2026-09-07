import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { call, cfg, tgWebApp, ApiError } from './api';
import { db, kv } from './db';

const Ctx = createContext(null);
export const useStore = () => useContext(Ctx);

const EMPTY = { settings: {}, batches: [], students: [], tests: [], users: [] };

export function StoreProvider({ children }) {
  const [me, setMe] = useState(cfg.me);
  const [data, setData] = useState(EMPTY);
  const [booted, setBooted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
  const [pending, setPending] = useState([]);
  const [toastMsg, setToastMsg] = useState(null);
  const [tgTried, setTgTried] = useState(false);
  const toastTimer = useRef();

  const toast = useCallback((msg, type = '') => {
    setToastMsg({ msg, type });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(null), 3200);
  }, []);

  const refreshPending = useCallback(async () => setPending(await db.queue.orderBy('created').toArray()), []);

  const logout = useCallback(async () => {
    cfg.session = ''; cfg.me = null;
    setMe(null); setData(EMPTY);
    await kv.clear();
  }, []);

  // API call with unified error handling. Throws ApiError so callers can branch on kind.
  const api = useCallback(async (action, payload, opts = {}) => {
    try {
      return await call(action, payload, opts);
    } catch (e) {
      if (e instanceof ApiError && e.kind === 'auth' && !opts.silentAuth) { toast(e.message, 'err'); await logout(); }
      throw e;
    }
  }, [toast, logout]);

  const applyBootstrap = useCallback((b) => {
    const next = { settings: b.settings || {}, batches: b.batches || [], students: b.students || [], tests: b.tests || [], users: b.users || [] };
    setData(next);
    if (b.me) { setMe(b.me); cfg.me = b.me; }
    kv.set('bootstrap', next);
  }, []);

  const refresh = useCallback(async (quiet = false) => {
    if (!cfg.session) return;
    setLoading(true);
    try {
      const b = await api('bootstrap', {});
      applyBootstrap(b);
    } catch (e) {
      if (!quiet && e.kind !== 'offline') toast(e.message, 'err');
    } finally { setLoading(false); }
  }, [api, applyBootstrap, toast]);

  // Boot: cached data first, then network.
  useEffect(() => {
    (async () => {
      const cached = await kv.get('bootstrap');
      if (cached && cfg.session) setData(cached);
      await refreshPending();
      setBooted(true);
      if (cfg.session) refresh(true);
    })();
  }, []); // eslint-disable-line

  // Telegram Mini App auto-login
  useEffect(() => {
    if (tgTried || cfg.session) return;
    const t = tgWebApp();
    if (!t || !cfg.api) { setTgTried(true); return; }
    t.ready(); t.expand();
    (async () => {
      try {
        const r = await call('tg_login', { initData: t.initData });
        cfg.session = r.session; cfg.me = r.me; setMe(r.me);
        refresh(true);
      } catch (e) { toast(e.message, 'err'); }
      setTgTried(true);
    })();
  }, [tgTried]); // eslint-disable-line

  const login = useCallback(async (kind, form) => {
    const r = await call(kind, form);
    cfg.session = r.session; cfg.me = r.me; setMe(r.me);
    await refresh(true);
    return r.me;
  }, [refresh]);

  // Offline queue
  const enqueue = useCallback(async (action, payload, label) => {
    await db.queue.add({ action, data: payload, label, created: Date.now() });
    await refreshPending();
  }, [refreshPending]);

  const flushing = useRef(false);
  const flush = useCallback(async () => {
    if (flushing.current || !navigator.onLine || !cfg.session) return;
    flushing.current = true;
    try {
      const items = await db.queue.orderBy('created').toArray();
      let done = 0;
      for (const it of items) {
        try {
          await call(it.action, it.data);
          await db.queue.delete(it.id);
          if (it.action === 'save_marks') await db.drafts.delete(it.data.test_id);
          done++;
        } catch (e) {
          if (e.kind === 'offline') break;
          await db.queue.update(it.id, { error: e.message });
        }
      }
      if (done) { toast(`Synced ${done} pending change${done > 1 ? 's' : ''}`, 'ok'); refresh(true); }
    } finally { flushing.current = false; await refreshPending(); }
  }, [toast, refresh, refreshPending]);

  useEffect(() => {
    const on = () => { setOnline(true); flush(); };
    const off = () => setOnline(false);
    window.addEventListener('online', on); window.addEventListener('offline', off);
    if (navigator.onLine) flush();
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, [flush]);

  const value = useMemo(() => ({
    me, data, booted, loading, online, pending, toast, api, refresh, login, logout, enqueue, flush, refreshPending, applyBootstrap, setData,
    isStaff: me && (me.role === 'admin' || me.role === 'faculty'),
    isAdmin: me && me.role === 'admin',
    batchName: (id) => (data.batches.find((b) => b.batch_id === id) || {}).name || id,
  }), [me, data, booted, loading, online, pending, toast, api, refresh, login, logout, enqueue, flush, refreshPending, applyBootstrap]);

  return (
    <Ctx.Provider value={value}>
      {children}
      {toastMsg && <div className={`toast ${toastMsg.type}`} role="status">{toastMsg.msg}</div>}
    </Ctx.Provider>
  );
}
