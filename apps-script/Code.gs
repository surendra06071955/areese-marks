/**
 * AREESE Marks — Apps Script backend (container-bound to the Google Sheet).
 * Paste this whole file as Code.gs, then: run setup() once, Deploy > Web app
 * (Execute as: Me, Access: Anyone). Put the /exec URL in the app's Settings.
 *
 * Sheets = database. One tab per test holds raw marks; totals/ranks are
 * recomputed from raw columns on every read, so humans can edit the tab.
 */

var VERSION = '1.0.0';
var TABS = {
  Settings: ['key', 'value'],
  Users: ['user_id', 'name', 'pin', 'role', 'batches', 'subjects', 'tg_id', 'active'],
  Batches: ['batch_id', 'name', 'class', 'stream', 'session', 'active'],
  Students: ['student_id', 'roll', 'name', 'batch_id', 'class', 'stream', 'father', 'phone', 'parent_phone', 'tg_id', 'parent_tg_id', 'active', 'created_at'],
  Tests: ['test_id', 'name', 'date', 'batch_ids', 'pattern', 'mode', 'subjects_json', 'total_max', 'published', 'created_by', 'created_at', 'sheet'],
  Log: ['time', 'user', 'action', 'detail']
};
var SESSION_DAYS = 30;

// ───────────────────────── Setup (run once) ─────────────────────────
function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  Object.keys(TABS).forEach(function (name) {
    var sh = ss.getSheetByName(name) || ss.insertSheet(name);
    if (sh.getLastRow() === 0) {
      sh.getRange(1, 1, 1, TABS[name].length).setValues([TABS[name]]).setFontWeight('bold');
      sh.setFrozenRows(1);
      if (name !== 'Log') sh.getRange('A:Z').setNumberFormat('@');
    }
  });
  var first = ss.getSheets()[0];
  if (first.getName() === 'Sheet1' && first.getLastRow() === 0) ss.deleteSheet(first);
  getSecret();
  if (readTable('Settings').length === 0) {
    appendRows('Settings', [
      ['institute_name', 'AREESE Gurukulam'],
      ['session', '2026-27'],
      ['app_url', '']
    ]);
  }
  if (readTable('Users').length === 0) {
    appendRows('Users', [['admin', 'Admin', '1234', 'admin', '', '', '', '1']]);
  }
  if (readTable('Batches').length === 0) {
    appendRows('Batches', [
      ['B01', 'JEE 11', '11', 'JEE', '2026-27', '1'],
      ['B02', 'JEE 12', '12', 'JEE', '2026-27', '1'],
      ['B03', 'NEET 11', '11', 'NEET', '2026-27', '1'],
      ['B04', 'NEET 12', '12', 'NEET', '2026-27', '1']
    ]);
  }
  Logger.log('Setup done. Default login: admin / 1234 — change the PIN in the Users tab.');
}

/** Run after deploying: sets the Telegram webhook to this web app. */
function setWebhook() {
  var url = prop('API_URL');
  if (!url) throw new Error('Set Script Property API_URL to your /exec URL first (Project Settings > Script properties).');
  var hook = url + '?tg=' + encodeURIComponent(getSecret());
  var r = tgApi('setWebhook', { url: hook, drop_pending_updates: true });
  Logger.log(JSON.stringify(r));
}

// ───────────────────────── HTTP entry points ─────────────────────────
function doGet(e) {
  return json({ ok: true, name: 'AREESE Marks API', version: VERSION, time: new Date().toISOString() });
}

function doPost(e) {
  try {
    var body = JSON.parse(e.postData && e.postData.contents || '{}');
    if (e.parameter && e.parameter.tg) {
      if (e.parameter.tg !== getSecret()) return json({ ok: false });
      handleTelegramUpdate(body);
      return json({ ok: true });
    }
    var out = route(body.action, body.data || {}, body.session);
    return json({ ok: true, data: out });
  } catch (err) {
    return json({ ok: false, error: String(err && err.message || err) });
  }
}

function json(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

function route(action, data, session) {
  switch (action) {
    case 'ping': return { version: VERSION, institute: settings().institute_name };
    case 'login': return login(data);
    case 'tg_login': return tgLogin(data);
    case 'student_login': return studentLogin(data);
  }
  var me = requireSession(session);
  switch (action) {
    case 'bootstrap': return bootstrap(me);
    case 'save_students': return staff(me), saveStudents(me, data);
    case 'save_batch': return staff(me), saveBatch(me, data);
    case 'save_user': return admin(me), saveUser(me, data);
    case 'save_settings': return admin(me), saveSettings(me, data);
    case 'save_test': return staff(me), saveTest(me, data);
    case 'delete_test': return admin(me), deleteTest(me, data);
    case 'get_marks': return staff(me), getMarks(me, data.test_id);
    case 'save_marks': return staff(me), saveMarks(me, data);
    case 'publish_test': return staff(me), publishTest(me, data);
    case 'student_report': return studentReport(me, data.student_id);
    case 'analytics': return staff(me), analytics(me, data.batch_id);
    default: throw new Error('Unknown action: ' + action);
  }
}

// ───────────────────────── Auth ─────────────────────────
function login(d) {
  var u = findUser(String(d.user || '').trim());
  if (!u || String(u.pin) !== String(d.pin || '').trim() || u.active === '0') throw new Error('Wrong user or PIN');
  return session(userToMe(u));
}

function studentLogin(d) {
  var roll = String(d.roll || '').trim().toLowerCase();
  var phone = String(d.phone || '').replace(/\D/g, '').slice(-10);
  if (!roll || phone.length !== 10) throw new Error('Enter roll number and 10-digit registered mobile');
  var s = readTable('Students').filter(function (r) {
    return String(r.roll).trim().toLowerCase() === roll && r.active !== '0' &&
      (String(r.phone).replace(/\D/g, '').slice(-10) === phone || String(r.parent_phone).replace(/\D/g, '').slice(-10) === phone);
  })[0];
  if (!s) throw new Error('No student found with that roll + mobile');
  return session({ id: s.student_id, name: s.name, role: 'student', student_id: s.student_id, batches: [s.batch_id], subjects: [] });
}

function tgLogin(d) {
  var tg = verifyInitData(d.initData || '');
  var id = String(tg.id);
  var u = readTable('Users').filter(function (r) { return String(r.tg_id) === id && r.active !== '0'; })[0];
  if (u) return session(userToMe(u));
  var studs = readTable('Students');
  var s = studs.filter(function (r) { return String(r.tg_id) === id && r.active !== '0'; })[0];
  if (s) return session({ id: s.student_id, name: s.name, role: 'student', student_id: s.student_id, batches: [s.batch_id], subjects: [] });
  var p = studs.filter(function (r) { return String(r.parent_tg_id) === id && r.active !== '0'; })[0];
  if (p) return session({ id: 'P-' + p.student_id, name: (p.father || 'Parent') + ' (' + p.name + ')', role: 'parent', student_id: p.student_id, batches: [p.batch_id], subjects: [] });
  throw new Error('This Telegram account is not linked. Open the bot and send /start with your link, or /link <mobile>.');
}

function verifyInitData(initData) {
  var token = prop('BOT_TOKEN');
  if (!token) throw new Error('BOT_TOKEN not set in Script properties');
  var pairs = initData.split('&').map(function (p) { var i = p.indexOf('='); return [p.slice(0, i), decodeURIComponent(p.slice(i + 1))]; });
  var hash = '', rest = [];
  pairs.forEach(function (kv) { if (kv[0] === 'hash') hash = kv[1]; else rest.push(kv[0] + '=' + kv[1]); });
  rest.sort();
  var secret = Utilities.computeHmacSha256Signature(Utilities.newBlob(token).getBytes(), Utilities.newBlob('WebAppData').getBytes());
  var sig = Utilities.computeHmacSha256Signature(Utilities.newBlob(rest.join('\n')).getBytes(), secret);
  if (hex(sig) !== hash) throw new Error('Telegram login could not be verified');
  var auth = Number((pairs.filter(function (kv) { return kv[0] === 'auth_date'; })[0] || [])[1] || 0);
  if (Date.now() / 1000 - auth > 86400) throw new Error('Telegram login expired, reopen the app');
  return JSON.parse((pairs.filter(function (kv) { return kv[0] === 'user'; })[0] || [])[1] || '{}');
}

function userToMe(u) {
  return { id: u.user_id, name: u.name, role: u.role || 'faculty', batches: csv(u.batches), subjects: csv(u.subjects).map(function (x) { return x.toUpperCase(); }) };
}

function session(me) {
  var payload = Utilities.base64EncodeWebSafe(JSON.stringify({ me: me, exp: Date.now() + SESSION_DAYS * 864e5 }));
  return { session: payload + '.' + sign(payload), me: me };
}

function requireSession(token) {
  if (!token) throw new Error('Login required');
  var parts = String(token).split('.');
  if (parts.length !== 2 || sign(parts[0]) !== parts[1]) throw new Error('Session invalid, login again');
  var obj = JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(parts[0])).getDataAsString());
  if (obj.exp < Date.now()) throw new Error('Session expired, login again');
  return obj.me;
}

function sign(s) {
  return Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(s, getSecret())).replace(/=+$/, '');
}
function staff(me) { if (me.role !== 'admin' && me.role !== 'faculty') throw new Error('Staff only'); }
function admin(me) { if (me.role !== 'admin') throw new Error('Admin only'); }
function canBatch(me, batchId) { return me.role === 'admin' || me.batches.length === 0 || me.batches.indexOf(batchId) >= 0; }
function canSubject(me, code) { return me.role === 'admin' || me.subjects.length === 0 || me.subjects.indexOf(code) >= 0; }

// ───────────────────────── Bootstrap / masters ─────────────────────────
function bootstrap(me) {
  var out = { me: me, settings: settings(), version: VERSION };
  var batches = readTable('Batches').filter(function (b) { return b.active !== '0'; });
  var students = readTable('Students').filter(function (s) { return s.active !== '0'; });
  var tests = readTable('Tests').map(parseTest);
  if (me.role === 'student' || me.role === 'parent') {
    var mine = students.filter(function (s) { return s.student_id === me.student_id; })[0];
    out.batches = batches.filter(function (b) { return mine && b.batch_id === mine.batch_id; });
    out.students = mine ? [publicStudent(mine)] : [];
    out.tests = tests.filter(function (t) { return t.published && mine && t.batch_ids.indexOf(mine.batch_id) >= 0; });
    return out;
  }
  out.batches = batches.filter(function (b) { return canBatch(me, b.batch_id); });
  out.students = students.filter(function (s) { return canBatch(me, s.batch_id); });
  out.tests = tests.filter(function (t) { return t.batch_ids.some(function (b) { return canBatch(me, b); }); });
  if (me.role === 'admin') out.users = readTable('Users').map(function (u) { var c = Object.assign({}, u); delete c.pin; return c; });
  return out;
}

function publicStudent(s) { return { student_id: s.student_id, roll: s.roll, name: s.name, batch_id: s.batch_id, class: s.class, stream: s.stream }; }

function saveStudents(me, d) {
  var rows = d.rows || [];
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    var sh = sheet('Students'), all = readTable('Students');
    var byId = {}; all.forEach(function (s, i) { byId[s.student_id] = i; });
    var nextId = nextNumber(all.map(function (s) { return s.student_id; }), 'S', 4);
    var byRoll = {}; all.forEach(function (s) { byRoll[s.batch_id + '|' + String(s.roll).trim().toLowerCase()] = s.student_id; });
    var now = stamp();
    rows.forEach(function (r) {
      if (!canBatch(me, r.batch_id)) throw new Error('No access to batch ' + r.batch_id);
      if (!r.name || !r.batch_id) throw new Error('Name and batch are required');
      var id = r.student_id || byRoll[r.batch_id + '|' + String(r.roll || '').trim().toLowerCase()];
      var existing = id != null && byId[id] != null ? all[byId[id]] : null;
      if (!existing && !id) id = nextId();
      // Fields not sent (undefined) keep their existing value; sent-but-empty clears.
      var keep = function (k) { return r[k] != null ? str(r[k]) : (existing ? existing[k] : ''); };
      var rec = {
        student_id: id, roll: keep('roll'), name: str(r.name), batch_id: str(r.batch_id), class: keep('class'), stream: keep('stream'),
        father: keep('father'), phone: keep('phone'), parent_phone: keep('parent_phone'), tg_id: keep('tg_id'), parent_tg_id: keep('parent_tg_id'),
        active: r.active === '0' || r.active === false ? '0' : (r.active != null || !existing ? '1' : existing.active || '1'),
        created_at: existing ? existing.created_at : now
      };
      if (existing) Object.assign(existing, rec); else { all.push(rec); byId[id] = all.length - 1; }
    });
    writeTable('Students', all);
    log(me, 'save_students', rows.length + ' rows');
    return { students: all.filter(function (s) { return s.active !== '0' && canBatch(me, s.batch_id); }) };
  } finally { lock.releaseLock(); }
}

function saveBatch(me, d) {
  var b = d.batch || {};
  var all = readTable('Batches');
  if (!b.batch_id) b.batch_id = nextNumber(all.map(function (x) { return x.batch_id; }), 'B', 2)();
  if (!b.name) throw new Error('Batch name required');
  var rec = { batch_id: b.batch_id, name: str(b.name), class: str(b.class), stream: str(b.stream), session: str(b.session || settings().session), active: b.active === '0' ? '0' : '1' };
  var i = all.findIndex(function (x) { return x.batch_id === rec.batch_id; });
  if (i >= 0) all[i] = rec; else all.push(rec);
  writeTable('Batches', all);
  log(me, 'save_batch', rec.batch_id);
  return { batches: all.filter(function (x) { return x.active !== '0'; }) };
}

function saveUser(me, d) {
  var u = d.user || {};
  if (!u.user_id || !u.name) throw new Error('user_id and name required');
  var all = readTable('Users');
  var i = all.findIndex(function (x) { return x.user_id === u.user_id; });
  var rec = {
    user_id: str(u.user_id).trim(), name: str(u.name), pin: u.pin ? str(u.pin) : (i >= 0 ? all[i].pin : '1234'),
    role: u.role === 'admin' ? 'admin' : 'faculty', batches: csv(u.batches).join(','), subjects: csv(u.subjects).join(',').toUpperCase(),
    tg_id: str(u.tg_id), active: u.active === '0' ? '0' : '1'
  };
  if (i >= 0) all[i] = rec; else all.push(rec);
  writeTable('Users', all);
  log(me, 'save_user', rec.user_id);
  return { users: all.map(function (x) { var c = Object.assign({}, x); delete c.pin; return c; }) };
}

function saveSettings(me, d) {
  var all = readTable('Settings');
  Object.keys(d.settings || {}).forEach(function (k) {
    var i = all.findIndex(function (x) { return x.key === k; });
    if (i >= 0) all[i].value = str(d.settings[k]); else all.push({ key: k, value: str(d.settings[k]) });
  });
  writeTable('Settings', all);
  return { settings: settings() };
}

// ───────────────────────── Tests ─────────────────────────
function parseTest(t) {
  var subjects = [];
  try { subjects = JSON.parse(t.subjects_json || '[]'); } catch (e) { subjects = []; }
  return {
    test_id: t.test_id, name: t.name, date: t.date, batch_ids: csv(t.batch_ids), pattern: t.pattern, mode: t.mode || 'marks',
    subjects: subjects, total_max: Number(t.total_max) || subjects.reduce(function (a, s) { return a + Number(s.max || 0); }, 0),
    published: t.published === '1' || t.published === 1 || t.published === true, created_by: t.created_by, created_at: t.created_at, sheet: t.sheet
  };
}

function saveTest(me, d) {
  var t = normalizeTest(d.test || {});
  if (!t.name || !t.batch_ids.length || !t.subjects.length) throw new Error('Test needs a name, at least one batch and one subject');
  t.batch_ids.forEach(function (b) { if (!canBatch(me, b)) throw new Error('No access to batch ' + b); });
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    var all = readTable('Tests');
    var i = all.findIndex(function (x) { return x.test_id === t.test_id; });
    if (i < 0) {
      t.test_id = nextNumber(all.map(function (x) { return x.test_id; }), 'T', 3)();
      t.sheet = safeSheetName(t.test_id + ' ' + t.name);
      createMarksTab(t);
      t.created_by = me.id; t.created_at = stamp(); t.published = false;
    } else {
      var old = parseTest(all[i]);
      var structureChanged = old.mode !== t.mode || JSON.stringify(old.subjects.map(function (s) { return s.code; })) !== JSON.stringify(t.subjects.map(function (s) { return s.code; }));
      if (structureChanged && marksTab(old).getLastRow() > 1) throw new Error('Marks already entered for this test. Create a new test instead of changing subjects.');
      if (structureChanged) { SpreadsheetApp.getActiveSpreadsheet().deleteSheet(marksTab(old)); createMarksTab(Object.assign({}, t, { sheet: old.sheet })); }
      t.sheet = old.sheet; t.created_by = old.created_by; t.created_at = old.created_at; t.published = old.published;
    }
    var row = {
      test_id: t.test_id, name: t.name, date: str(t.date), batch_ids: t.batch_ids.join(','), pattern: t.pattern || 'CUSTOM', mode: t.mode,
      subjects_json: JSON.stringify(t.subjects), total_max: String(t.total_max), published: t.published ? '1' : '0',
      created_by: t.created_by, created_at: t.created_at, sheet: t.sheet
    };
    if (i >= 0) all[i] = row; else all.push(row);
    writeTable('Tests', all);
    cacheDel('marks_' + t.test_id);
    log(me, 'save_test', t.test_id + ' ' + t.name);
    return { test: parseTest(row) };
  } finally { lock.releaseLock(); }
}

function deleteTest(me, d) {
  var all = readTable('Tests');
  var i = all.findIndex(function (x) { return x.test_id === d.test_id; });
  if (i < 0) throw new Error('Test not found');
  var t = parseTest(all[i]);
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(t.sheet);
  if (sh) sh.setName(safeSheetName('DEL ' + t.sheet)).hideSheet();
  all.splice(i, 1);
  writeTable('Tests', all);
  cacheDel('marks_' + t.test_id);
  log(me, 'delete_test', t.test_id);
  return { ok: true };
}

function marksHeaders(t) {
  var h = ['student_id', 'roll', 'name', 'absent'];
  t.subjects.forEach(function (s) {
    if (t.mode === 'cwu') h.push(s.code + '_C', s.code + '_W', s.code + '_U', s.code + '_M'); else h.push(s.code + '_M');
  });
  return h.concat(['TOTAL', 'PCT', 'RANK', 'PCTL', 'updated_at', 'updated_by']);
}

function createMarksTab(t) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.insertSheet(t.sheet);
  var h = marksHeaders(t);
  sh.getRange(1, 1, 1, h.length).setValues([h]).setFontWeight('bold');
  sh.setFrozenRows(1); sh.setFrozenColumns(3);
  sh.getRange('A:C').setNumberFormat('@');
  return sh;
}

function marksTab(t) {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(t.sheet);
  if (!sh) sh = createMarksTab(t);
  return sh;
}

function getTest(id) {
  var t = readTable('Tests').filter(function (x) { return x.test_id === id; })[0];
  if (!t) throw new Error('Test not found');
  return parseTest(t);
}

/** Raw rows from a test tab -> {student_id, roll, name, absent, subj:{CODE:{c,w,m}}} */
function readMarksRaw(t) {
  var sh = marksTab(t), n = sh.getLastRow();
  if (n < 2) return [];
  var h = marksHeaders(t), vals = sh.getRange(2, 1, n - 1, h.length).getValues();
  return vals.filter(function (v) { return v[0] !== ''; }).map(function (v) {
    var o = {}; h.forEach(function (k, i) { o[k] = v[i]; });
    var subj = {};
    t.subjects.forEach(function (s) {
      subj[s.code] = t.mode === 'cwu' ? { c: cell(o[s.code + '_C']), w: cell(o[s.code + '_W']) } : { m: cell(o[s.code + '_M']) };
    });
    return { student_id: String(o.student_id), roll: String(o.roll), name: String(o.name), absent: String(o.absent) === '1', subj: subj, updated_at: str(o.updated_at), updated_by: str(o.updated_by) };
  });
}

function cell(v) { return v === '' || v == null ? '' : Number(v); }

/** Full computed marks for a test: batch students merged with tab rows. */
function computeTest(t, students) {
  var cached = cacheGet('marks_' + t.test_id);
  if (cached) return cached;
  students = students || readTable('Students');
  var raw = readMarksRaw(t), byId = {};
  raw.forEach(function (r) { byId[r.student_id] = r; });
  var sm = {}; students.forEach(function (s) { sm[s.student_id] = s; });
  students.filter(function (s) { return s.active !== '0' && t.batch_ids.indexOf(s.batch_id) >= 0 && !byId[s.student_id]; })
    .forEach(function (s) { byId[s.student_id] = { student_id: s.student_id, roll: s.roll, name: s.name, absent: false, subj: {} }; });
  var rows = Object.keys(byId).map(function (id) {
    var r = byId[id], s = sm[id];
    if (s) { r.roll = s.roll; r.name = s.name; r.batch_id = s.batch_id; }
    return r;
  });
  rows.sort(function (a, b) { return String(a.roll).localeCompare(String(b.roll), undefined, { numeric: true }); });
  var out = rankRows(t, rows);
  out.test = t;
  cachePut('marks_' + t.test_id, out);
  return out;
}

function getMarks(me, testId) {
  var t = getTest(testId);
  if (!t.batch_ids.some(function (b) { return canBatch(me, b); })) throw new Error('No access to this test');
  return computeTest(t);
}

function saveMarks(me, d) {
  var t = getTest(d.test_id);
  if (!t.batch_ids.some(function (b) { return canBatch(me, b); })) throw new Error('No access to this test');
  var lock = LockService.getScriptLock(); lock.waitLock(30000);
  try {
    var students = readTable('Students'), sm = {};
    students.forEach(function (s) { sm[s.student_id] = s; });
    var raw = readMarksRaw(t), byId = {};
    raw.forEach(function (r) { byId[r.student_id] = r; });
    var now = stamp();
    (d.rows || []).forEach(function (inc) {
      var s = sm[inc.student_id];
      if (!s) return;
      if (!canBatch(me, s.batch_id)) throw new Error('No access to batch ' + s.batch_id);
      var r = byId[inc.student_id] || (byId[inc.student_id] = { student_id: s.student_id, roll: s.roll, name: s.name, absent: false, subj: {} });
      if (inc.absent != null) r.absent = !!inc.absent;
      t.subjects.forEach(function (sub) {
        var e = inc.subj && inc.subj[sub.code];
        if (!e || !canSubject(me, sub.code)) return;
        if (t.mode === 'cwu') {
          var c = cell(e.c), w = cell(e.w);
          if (c !== '' && w === '') w = 0;
          if (w !== '' && c === '') c = 0;
          if (c !== '' && (c < 0 || w < 0 || c + w > sub.q)) throw new Error(s.name + ' ' + sub.code + ': C+W cannot exceed ' + sub.q);
          r.subj[sub.code] = { c: c, w: w };
        } else {
          var m = cell(e.m);
          if (m !== '' && (m < 0 || m > sub.max)) throw new Error(s.name + ' ' + sub.code + ': marks must be 0 to ' + sub.max);
          r.subj[sub.code] = { m: m };
        }
      });
      r.updated_at = now; r.updated_by = me.id;
    });
    var rows = Object.keys(byId).map(function (id) { return byId[id]; });
    var computed = rankRows(t, rows);
    writeMarksTab(t, computed.rows);
    cacheDel('marks_' + t.test_id);
    log(me, 'save_marks', t.test_id + ' ' + (d.rows || []).length + ' rows');
    return computeTest(t, students);
  } finally { lock.releaseLock(); }
}

function writeMarksTab(t, rows) {
  var sh = marksTab(t), h = marksHeaders(t);
  var vals = rows.map(function (r) {
    var line = [r.student_id, r.roll, r.name, r.absent ? '1' : ''];
    t.subjects.forEach(function (s) {
      var x = r.subj[s.code] || {};
      if (t.mode === 'cwu') line.push(x.c === undefined ? '' : x.c, x.w === undefined ? '' : x.w, x.u === undefined ? '' : x.u, x.m === undefined ? '' : x.m);
      else line.push(x.m === undefined ? '' : x.m);
    });
    return line.concat([r.total, r.pct, r.rank, r.percentile, r.updated_at || '', r.updated_by || '']);
  });
  var last = sh.getLastRow();
  if (last > 1) sh.getRange(2, 1, last - 1, h.length).clearContent();
  if (vals.length) sh.getRange(2, 1, vals.length, h.length).setValues(vals);
}

function publishTest(me, d) {
  var all = readTable('Tests');
  var i = all.findIndex(function (x) { return x.test_id === d.test_id; });
  if (i < 0) throw new Error('Test not found');
  all[i].published = d.publish === false ? '0' : '1';
  writeTable('Tests', all);
  var t = parseTest(all[i]);
  var sent = 0, failed = 0;
  if (t.published && d.notify) {
    var students = readTable('Students'), sm = {};
    students.forEach(function (s) { sm[s.student_id] = s; });
    var comp = computeTest(t, students);
    comp.rows.forEach(function (r) {
      if (!r.entered && !r.absent) return;
      var s = sm[r.student_id]; if (!s) return;
      var text = reportText(t, r, comp.stats, s);
      [s.tg_id, s.parent_tg_id].filter(Boolean).forEach(function (chat) {
        var ok = tgSend(chat, text);
        if (ok) sent++; else failed++;
      });
    });
  }
  log(me, 'publish_test', t.test_id + ' published=' + t.published + ' sent=' + sent);
  return { test: t, sent: sent, failed: failed };
}

// ───────────────────────── Reports & analytics ─────────────────────────
function studentReport(me, studentId) {
  if ((me.role === 'student' || me.role === 'parent') && me.student_id !== studentId) throw new Error('Not allowed');
  var students = readTable('Students');
  var s = students.filter(function (x) { return x.student_id === studentId; })[0];
  if (!s) throw new Error('Student not found');
  if (!canBatch(me, s.batch_id) && me.role !== 'student' && me.role !== 'parent') throw new Error('No access');
  var isStaff = me.role === 'admin' || me.role === 'faculty';
  var tests = readTable('Tests').map(parseTest).filter(function (t) { return t.batch_ids.indexOf(s.batch_id) >= 0 && (isStaff || t.published); });
  var list = tests.map(function (t) {
    var comp = computeTest(t, students);
    var r = comp.rows.filter(function (x) { return x.student_id === studentId; })[0];
    if (!r || (!r.entered && !r.absent)) return null;
    return { test_id: t.test_id, name: t.name, date: t.date, mode: t.mode, subjects: t.subjects, total_max: t.total_max, published: t.published,
      absent: r.absent, total: r.total, pct: r.pct, rank: r.rank, percentile: r.percentile, sub_rank: r.sub_rank, subj: r.subj, stats: comp.stats };
  }).filter(Boolean).sort(function (a, b) { return String(a.date).localeCompare(String(b.date)) || a.test_id.localeCompare(b.test_id); });
  var batch = readTable('Batches').filter(function (b) { return b.batch_id === s.batch_id; })[0] || {};
  return { student: publicStudent(s), batch: batch, tests: list, settings: settings() };
}

function analytics(me, batchId) {
  if (!canBatch(me, batchId)) throw new Error('No access');
  var students = readTable('Students').filter(function (s) { return s.batch_id === batchId && s.active !== '0'; });
  var all = readTable('Students');
  var tests = readTable('Tests').map(parseTest).filter(function (t) { return t.batch_ids.indexOf(batchId) >= 0; })
    .sort(function (a, b) { return String(a.date).localeCompare(String(b.date)) || a.test_id.localeCompare(b.test_id); });
  var series = {}; students.forEach(function (s) { series[s.student_id] = { student_id: s.student_id, roll: s.roll, name: s.name, pcts: [], ranks: [] }; });
  var tsum = tests.map(function (t) {
    var comp = computeTest(t, all);
    comp.rows.forEach(function (r) {
      if (series[r.student_id]) { series[r.student_id].pcts.push(r.entered ? r.pct : null); series[r.student_id].ranks.push(r.entered ? r.rank : null); }
    });
    return { test_id: t.test_id, name: t.name, date: t.date, total_max: t.total_max, n: comp.stats.n, avg: comp.stats.avg, top: comp.stats.top,
      avg_pct: comp.stats.avg !== '' && t.total_max ? round(comp.stats.avg / t.total_max * 100) : '', published: t.published };
  });
  var studs = Object.keys(series).map(function (id) {
    var x = series[id], valid = x.pcts.filter(function (p) { return p != null; });
    x.avg_pct = valid.length ? round(valid.reduce(function (a, b) { return a + b; }, 0) / valid.length) : '';
    x.trend = trend(valid); x.appeared = valid.length;
    return x;
  }).sort(function (a, b) { return (b.avg_pct || -1) - (a.avg_pct || -1); });
  return { tests: tsum, students: studs };
}

function reportText(t, r, st, s) {
  var lines = ['📊 <b>' + esc(t.name) + '</b>' + (t.date ? ' — ' + esc(t.date) : ''), '<b>' + esc(s.name) + '</b> (Roll ' + esc(s.roll) + ')', ''];
  if (r.absent) { lines.push('Absent'); return lines.join('\n'); }
  t.subjects.forEach(function (sub) {
    var x = r.subj[sub.code];
    if (!x || !x.entered) return;
    lines.push(esc(sub.name) + ': <b>' + x.m + '</b>/' + sub.max + (t.mode === 'cwu' ? '  (C ' + x.c + ' · W ' + x.w + ' · U ' + x.u + ')' : '') + (r.sub_rank && r.sub_rank[sub.code] ? '  #' + r.sub_rank[sub.code] : ''));
  });
  lines.push('', 'Total: <b>' + r.total + '/' + t.total_max + '</b> (' + r.pct + '%)', 'Rank: <b>' + r.rank + '</b> / ' + st.n + '  ·  Percentile ' + r.percentile, 'Batch avg ' + st.avg + '  ·  Topper ' + st.top);
  lines.push('', '— ' + esc(settings().institute_name));
  return lines.join('\n');
}

// ───────────────────────── Telegram bot ─────────────────────────
function handleTelegramUpdate(u) {
  var msg = u.message || u.edited_message;
  if (!msg || !msg.text) return;
  var chat = msg.chat.id, text = msg.text.trim(), from = msg.from || {};
  var m = text.match(/^\/start(?:@\w+)?\s*(\S+)?/i);
  if (m) {
    if (m[1]) return linkByCode(chat, m[1]);
    return tgSend(chat, 'Welcome to <b>' + esc(settings().institute_name) + '</b> marks bot.\n\nTo link your account send:\n<code>/link 98XXXXXXXX</code> (registered mobile)\n\nYour Telegram ID: <code>' + chat + '</code>\n\nAfter linking, /marks shows your latest result.');
  }
  m = text.match(/^\/link(?:@\w+)?\s+(\S+)/i);
  if (m) return linkByPhone(chat, m[1]);
  if (/^\/marks/i.test(text)) return sendLatest(chat);
  if (/^\/id/i.test(text)) return tgSend(chat, 'Your Telegram ID: <code>' + chat + '</code>');
  tgSend(chat, 'Commands: /link mobile · /marks · /id');
}

function linkByCode(chat, code) {
  var parent = /^P-/i.test(code), sid = code.replace(/^P-/i, '').toUpperCase();
  var all = readTable('Students');
  var i = all.findIndex(function (s) { return s.student_id === sid; });
  if (i < 0) return tgSend(chat, 'Link code not found. Ask the institute for your link.');
  all[i][parent ? 'parent_tg_id' : 'tg_id'] = String(chat);
  writeTable('Students', all);
  tgSend(chat, '✅ Linked to <b>' + esc(all[i].name) + '</b>' + (parent ? ' (parent)' : '') + '. Send /marks to see results.');
}

function linkByPhone(chat, phone) {
  var p = String(phone).replace(/\D/g, '').slice(-10);
  if (p.length !== 10) return tgSend(chat, 'Send a 10-digit mobile number: /link 98XXXXXXXX');
  var all = readTable('Students');
  var i = all.findIndex(function (s) { return String(s.phone).replace(/\D/g, '').slice(-10) === p && s.active !== '0'; });
  var parent = false;
  if (i < 0) { i = all.findIndex(function (s) { return String(s.parent_phone).replace(/\D/g, '').slice(-10) === p && s.active !== '0'; }); parent = true; }
  if (i < 0) return tgSend(chat, 'This mobile is not registered with the institute.');
  all[i][parent ? 'parent_tg_id' : 'tg_id'] = String(chat);
  writeTable('Students', all);
  tgSend(chat, '✅ Linked to <b>' + esc(all[i].name) + '</b>' + (parent ? ' (parent)' : '') + '. Send /marks to see results.');
}

function sendLatest(chat) {
  var students = readTable('Students');
  var s = students.filter(function (x) { return String(x.tg_id) === String(chat) || String(x.parent_tg_id) === String(chat); })[0];
  if (!s) return tgSend(chat, 'Not linked yet. Send /link 98XXXXXXXX');
  var tests = readTable('Tests').map(parseTest).filter(function (t) { return t.published && t.batch_ids.indexOf(s.batch_id) >= 0; })
    .sort(function (a, b) { return String(b.date).localeCompare(String(a.date)) || b.test_id.localeCompare(a.test_id); });
  for (var k = 0; k < tests.length; k++) {
    var comp = computeTest(tests[k], students);
    var r = comp.rows.filter(function (x) { return x.student_id === s.student_id; })[0];
    if (r && (r.entered || r.absent)) return tgSend(chat, reportText(tests[k], r, comp.stats, s));
  }
  tgSend(chat, 'No published results yet.');
}

function tgSend(chat, text) {
  var r = tgApi('sendMessage', { chat_id: chat, text: text, parse_mode: 'HTML', disable_web_page_preview: true });
  return !!(r && r.ok);
}

function tgApi(method, payload) {
  var token = prop('BOT_TOKEN');
  if (!token) return { ok: false, error: 'BOT_TOKEN not set' };
  try {
    var res = UrlFetchApp.fetch('https://api.telegram.org/bot' + token + '/' + method, {
      method: 'post', contentType: 'application/json', payload: JSON.stringify(payload), muteHttpExceptions: true
    });
    return JSON.parse(res.getContentText());
  } catch (e) { return { ok: false, error: String(e) }; }
}

// ───────────────────────── Scoring (mirror of src/lib/scoring.js) ─────────────────────────
function num(v) { var n = Number(v); return isFinite(n) ? n : 0; }
function round(v, d) { d = d == null ? 2 : d; var f = Math.pow(10, d); return Math.round(num(v) * f) / f; }
function subjectMax(s, mode) { return mode === 'cwu' ? num(s.q) * num(s.plus) : num(s.max); }

function normalizeTest(t) {
  var subjects = (t.subjects || []).map(function (s) {
    return { code: String(s.code || '').toUpperCase().slice(0, 6), name: s.name || s.code, q: num(s.q), plus: num(s.plus), minus: num(s.minus), max: subjectMax(s, t.mode) };
  });
  return Object.assign({}, t, { batch_ids: Array.isArray(t.batch_ids) ? t.batch_ids : csv(t.batch_ids), subjects: subjects, total_max: subjects.reduce(function (a, s) { return a + s.max; }, 0) });
}

function scoreSubject(test, s, e) {
  e = e || {};
  if (test.mode === 'cwu') {
    var has = (e.c !== '' && e.c != null) || (e.w !== '' && e.w != null);
    if (!has) return { c: '', w: '', u: '', m: '', entered: false };
    var c = num(e.c), w = num(e.w);
    return { c: c, w: w, u: Math.max(0, s.q - c - w), m: c * s.plus - w * s.minus, entered: true };
  }
  if (e.m === '' || e.m == null) return { c: '', w: '', u: '', m: '', entered: false };
  return { c: '', w: '', u: '', m: num(e.m), entered: true };
}

function scoreRow(test, row) {
  var subj = {}, total = 0, any = false;
  test.subjects.forEach(function (s) {
    var r = scoreSubject(test, s, row.subj && row.subj[s.code]);
    subj[s.code] = r;
    if (r.entered) { total += r.m; any = true; }
  });
  var entered = any && !row.absent;
  return Object.assign({}, row, { subj: subj, entered: entered, total: entered ? total : '', pct: entered && test.total_max ? round(total / test.total_max * 100) : '' });
}

function rankRows(test, rows) {
  var scored = rows.map(function (r) { return scoreRow(test, r); });
  var ranked = scored.filter(function (r) { return r.entered; });
  var N = ranked.length;
  var sorted = ranked.slice().sort(function (a, b) { return b.total - a.total; });
  sorted.forEach(function (r, i) { r.rank = i > 0 && sorted[i - 1].total === r.total ? sorted[i - 1].rank : i + 1; });
  ranked.forEach(function (r) { r.percentile = N ? round(100 * ranked.filter(function (x) { return x.total <= r.total; }).length / N) : ''; });
  test.subjects.forEach(function (s) {
    var ss = ranked.filter(function (r) { return r.subj[s.code].entered; }).sort(function (a, b) { return b.subj[s.code].m - a.subj[s.code].m; });
    ss.forEach(function (r, i) {
      r.sub_rank = r.sub_rank || {};
      r.sub_rank[s.code] = i > 0 && ss[i - 1].subj[s.code].m === r.subj[s.code].m ? ss[i - 1].sub_rank[s.code] : i + 1;
    });
  });
  scored.forEach(function (r) { if (!r.entered) { r.rank = ''; r.percentile = ''; r.sub_rank = {}; } });
  var avg = N ? round(ranked.reduce(function (a, r) { return a + r.total; }, 0) / N) : '';
  var top = N ? Math.max.apply(null, ranked.map(function (r) { return r.total; })) : '';
  var sub_avg = {}, sub_top = {};
  test.subjects.forEach(function (s) {
    var ms = ranked.filter(function (r) { return r.subj[s.code].entered; }).map(function (r) { return r.subj[s.code].m; });
    sub_avg[s.code] = ms.length ? round(ms.reduce(function (a, b) { return a + b; }, 0) / ms.length) : '';
    sub_top[s.code] = ms.length ? Math.max.apply(null, ms) : '';
  });
  return { rows: scored, stats: { n: N, avg: avg, top: top, sub_avg: sub_avg, sub_top: sub_top } };
}

function trend(pcts) {
  if (pcts.length < 3) return 'flat';
  var a = pcts.slice(-3);
  if (a[2] < a[1] && a[1] < a[0]) return 'down';
  if (a[2] > a[1] && a[1] > a[0]) return 'up';
  return 'flat';
}

// ───────────────────────── Sheet helpers ─────────────────────────
function sheet(name) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(name);
  if (!sh) { sh = ss.insertSheet(name); sh.getRange(1, 1, 1, TABS[name].length).setValues([TABS[name]]); }
  return sh;
}

function readTable(name) {
  var sh = sheet(name), n = sh.getLastRow(), h = TABS[name];
  if (n < 2) return [];
  var vals = sh.getRange(2, 1, n - 1, h.length).getValues();
  return vals.filter(function (v) { return v[0] !== '' && v[0] != null; }).map(function (v) {
    var o = {}; h.forEach(function (k, i) { o[k] = str(v[i]); }); return o;
  });
}

function writeTable(name, rows) {
  var sh = sheet(name), h = TABS[name];
  var last = sh.getLastRow();
  if (last > 1) sh.getRange(2, 1, last - 1, h.length).clearContent();
  if (rows.length) sh.getRange(2, 1, rows.length, h.length).setValues(rows.map(function (r) { return h.map(function (k) { return r[k] == null ? '' : r[k]; }); }));
}

function appendRows(name, rows) {
  var sh = sheet(name);
  sh.getRange(sh.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
}

function findUser(id) {
  return readTable('Users').filter(function (u) { return String(u.user_id).toLowerCase() === id.toLowerCase(); })[0];
}

function settings() {
  var o = {}; readTable('Settings').forEach(function (r) { o[r.key] = r.value; }); return o;
}

function log(me, action, detail) {
  try { appendRows('Log', [[new Date(), me.id, action, detail]]); } catch (e) { /* ignore */ }
}

function nextNumber(ids, prefix, width) {
  var max = 0;
  ids.forEach(function (id) { var m = String(id).match(new RegExp('^' + prefix + '(\\d+)$')); if (m) max = Math.max(max, Number(m[1])); });
  return function () { max++; var s = String(max); while (s.length < width) s = '0' + s; return prefix + s; };
}

function safeSheetName(s) {
  var clean = String(s).replace(/[\[\]\*\?\/\\:]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 90);
  var ss = SpreadsheetApp.getActiveSpreadsheet(), name = clean, k = 2;
  while (ss.getSheetByName(name)) name = clean.slice(0, 85) + ' (' + (k++) + ')';
  return name;
}

function str(v) {
  if (v == null) return '';
  if (v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  return String(v);
}
function csv(v) { return Array.isArray(v) ? v.map(String).filter(Boolean) : String(v || '').split(',').map(function (x) { return x.trim(); }).filter(Boolean); }
function stamp() { return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm'); }
function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function hex(bytes) { return bytes.map(function (b) { var v = (b < 0 ? b + 256 : b).toString(16); return v.length === 1 ? '0' + v : v; }).join(''); }
function prop(k) { return PropertiesService.getScriptProperties().getProperty(k) || ''; }
function getSecret() {
  var p = PropertiesService.getScriptProperties(), s = p.getProperty('SECRET');
  if (!s) { s = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, ''); p.setProperty('SECRET', s); }
  return s;
}
function cacheGet(k) { try { var v = CacheService.getScriptCache().get(k); return v ? JSON.parse(v) : null; } catch (e) { return null; } }
function cachePut(k, o) { try { var s = JSON.stringify(o); if (s.length < 95000) CacheService.getScriptCache().put(k, s, 21600); } catch (e) { /* ignore */ } }
function cacheDel(k) { try { CacheService.getScriptCache().remove(k); } catch (e) { /* ignore */ } }
