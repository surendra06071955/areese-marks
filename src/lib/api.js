const K = 'am.';

export class ApiError extends Error {
  constructor(message, kind) { super(message); this.kind = kind; }
}

// Server URL priority: ?api=… in the opening link → saved in this browser → baked in at build (VITE_API_URL)
try {
  const q = new URLSearchParams(window.location.search).get('api');
  if (q && /^https:\/\/script\.google\.com\/macros\/s\/.+\/exec$/.test(q)) localStorage.setItem(K + 'api', q);
} catch { /* not in a browser */ }

export const cfg = {
  get api() { return localStorage.getItem(K + 'api') || import.meta.env.VITE_API_URL || ''; },
  set api(v) { localStorage.setItem(K + 'api', (v || '').trim()); },
  get session() { return localStorage.getItem(K + 'session') || ''; },
  set session(v) { v ? localStorage.setItem(K + 'session', v) : localStorage.removeItem(K + 'session'); },
  get me() { try { return JSON.parse(localStorage.getItem(K + 'me') || 'null'); } catch { return null; } },
  set me(v) { v ? localStorage.setItem(K + 'me', JSON.stringify(v)) : localStorage.removeItem(K + 'me'); },
};

export async function call(action, data = {}, opts = {}) {
  const url = opts.url || cfg.api;
  if (!url) throw new ApiError('API URL is not set. Open Settings and paste the Apps Script /exec URL.', 'config');
  if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new ApiError('You are offline', 'offline');
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action, data, session: opts.session ?? cfg.session }),
    });
  } catch (e) {
    throw new ApiError('Could not reach the server. Check internet or the API URL.', 'offline');
  }
  const text = await res.text();
  let j;
  try { j = JSON.parse(text); } catch {
    throw new ApiError('Server returned an unexpected page. Redeploy the web app with access "Anyone".', 'bad');
  }
  if (!j.ok) {
    const kind = /login|session/i.test(j.error || '') ? 'auth' : 'api';
    throw new ApiError(j.error || 'Request failed', kind);
  }
  return j.data;
}

export function tgWebApp() {
  const t = typeof window !== 'undefined' && window.Telegram && window.Telegram.WebApp;
  return t && t.initData ? t : null;
}
