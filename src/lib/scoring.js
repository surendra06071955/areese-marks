// Scoring rules shared by the app and (mirrored in) Apps Script.
// A test has: mode 'cwu' (correct/wrong/unattempted, negative marking auto)
// or 'marks' (direct marks). subjects: [{code,name,q,plus,minus,max}]

export const PATTERNS = {
  JEE_MAIN: {
    label: 'JEE Main (75 Q, 300 marks)',
    mode: 'cwu',
    subjects: [
      { code: 'PHY', name: 'Physics', q: 25, plus: 4, minus: 1 },
      { code: 'CHE', name: 'Chemistry', q: 25, plus: 4, minus: 1 },
      { code: 'MAT', name: 'Maths', q: 25, plus: 4, minus: 1 },
    ],
  },
  NEET: {
    label: 'NEET (180 Q, 720 marks)',
    mode: 'cwu',
    subjects: [
      { code: 'PHY', name: 'Physics', q: 45, plus: 4, minus: 1 },
      { code: 'CHE', name: 'Chemistry', q: 45, plus: 4, minus: 1 },
      { code: 'BOT', name: 'Botany', q: 45, plus: 4, minus: 1 },
      { code: 'ZOO', name: 'Zoology', q: 45, plus: 4, minus: 1 },
    ],
  },
  JEE_ADV: {
    label: 'JEE Advanced (marks per paper)',
    mode: 'marks',
    subjects: [
      { code: 'PHY', name: 'Physics', max: 60 },
      { code: 'CHE', name: 'Chemistry', max: 60 },
      { code: 'MAT', name: 'Maths', max: 60 },
    ],
  },
  CLASS_TEST: {
    label: 'Class / chapter test (custom)',
    mode: 'marks',
    subjects: [{ code: 'SUB', name: 'Subject', max: 100 }],
  },
  BOARD: {
    label: 'Board pattern (Class 9-12)',
    mode: 'marks',
    subjects: [
      { code: 'PHY', name: 'Physics', max: 100 },
      { code: 'CHE', name: 'Chemistry', max: 100 },
      { code: 'MAT', name: 'Maths', max: 100 },
      { code: 'ENG', name: 'English', max: 100 },
    ],
  },
};

export function subjectMax(s, mode) {
  return mode === 'cwu' ? num(s.q) * num(s.plus) : num(s.max);
}

export function normalizeTest(t) {
  const subjects = (t.subjects || []).map((s) => ({
    code: String(s.code || '').toUpperCase().slice(0, 6),
    name: s.name || s.code,
    q: num(s.q),
    plus: num(s.plus),
    minus: num(s.minus),
    max: subjectMax(s, t.mode),
  }));
  return { ...t, subjects, total_max: subjects.reduce((a, s) => a + s.max, 0) };
}

export function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

// entry: {c,w} for cwu or {m} for marks. Returns {c,w,u,m,entered}
export function scoreSubject(test, s, entry) {
  entry = entry || {};
  if (test.mode === 'cwu') {
    const has = entry.c !== '' && entry.c != null || entry.w !== '' && entry.w != null;
    if (!has) return { c: '', w: '', u: '', m: '', entered: false };
    const c = num(entry.c), w = num(entry.w);
    const u = Math.max(0, s.q - c - w);
    return { c, w, u, m: c * s.plus - w * s.minus, entered: true };
  }
  const has = entry.m !== '' && entry.m != null;
  if (!has) return { c: '', w: '', u: '', m: '', entered: false };
  return { c: '', w: '', u: '', m: num(entry.m), entered: true };
}

export function scoreRow(test, row) {
  const subj = {};
  let total = 0, any = false;
  for (const s of test.subjects) {
    const r = scoreSubject(test, s, row.subj && row.subj[s.code]);
    subj[s.code] = r;
    if (r.entered) { total += r.m; any = true; }
  }
  const entered = any && !row.absent;
  return {
    ...row,
    subj,
    entered,
    total: entered ? total : '',
    pct: entered && test.total_max ? round(total / test.total_max * 100, 2) : '',
  };
}

// Competition ranking (1,2,2,4). NTA-style percentile: 100 * (#scores <= mine) / N.
export function rankRows(test, rows) {
  const scored = rows.map((r) => scoreRow(test, r));
  const ranked = scored.filter((r) => r.entered);
  const N = ranked.length;
  const sorted = [...ranked].sort((a, b) => b.total - a.total);
  sorted.forEach((r, i) => {
    r.rank = i > 0 && sorted[i - 1].total === r.total ? sorted[i - 1].rank : i + 1;
  });
  ranked.forEach((r) => {
    const le = ranked.filter((x) => x.total <= r.total).length;
    r.percentile = N ? round(100 * le / N, 2) : '';
  });
  for (const s of test.subjects) {
    const ss = ranked.filter((r) => r.subj[s.code].entered).sort((a, b) => b.subj[s.code].m - a.subj[s.code].m);
    ss.forEach((r, i) => {
      r.sub_rank = r.sub_rank || {};
      r.sub_rank[s.code] = i > 0 && ss[i - 1].subj[s.code].m === r.subj[s.code].m ? ss[i - 1].sub_rank[s.code] : i + 1;
    });
  }
  scored.forEach((r) => { if (!r.entered) { r.rank = ''; r.percentile = ''; r.sub_rank = {}; } });
  return { rows: scored, stats: stats(test, ranked) };
}

export function stats(test, ranked) {
  const N = ranked.length;
  const avg = N ? round(ranked.reduce((a, r) => a + r.total, 0) / N, 2) : '';
  const top = N ? Math.max(...ranked.map((r) => r.total)) : '';
  const sub_avg = {}, sub_top = {};
  for (const s of test.subjects) {
    const ms = ranked.filter((r) => r.subj[s.code].entered).map((r) => r.subj[s.code].m);
    sub_avg[s.code] = ms.length ? round(ms.reduce((a, b) => a + b, 0) / ms.length, 2) : '';
    sub_top[s.code] = ms.length ? Math.max(...ms) : '';
  }
  return { n: N, avg, top, sub_avg, sub_top };
}

export function round(v, d = 2) {
  const f = Math.pow(10, d);
  return Math.round(num(v) * f) / f;
}

// Validation for one cwu entry: returns error string or ''
export function validateEntry(test, s, entry) {
  if (!entry) return '';
  if (test.mode === 'cwu') {
    const c = num(entry.c), w = num(entry.w);
    if (c < 0 || w < 0) return 'Negative not allowed';
    if (c + w > s.q) return `C + W > ${s.q}`;
    return '';
  }
  const m = num(entry.m);
  if (m < 0 || m > s.max) return `0 to ${s.max}`;
  return '';
}

export function trend(pcts) {
  const a = pcts.filter((x) => x !== '' && x != null).map(Number);
  if (a.length < 3) return 'flat';
  const [p1, p2, p3] = a.slice(-3);
  if (p3 < p2 && p2 < p1) return 'down';
  if (p3 > p2 && p2 > p1) return 'up';
  return 'flat';
}
