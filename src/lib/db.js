import Dexie from 'dexie';

// Local cache + offline queue. Everything here is replaceable from the server.
export const db = new Dexie('areese-marks');
db.version(1).stores({
  kv: 'key',
  queue: '++id, created',
  drafts: 'test_id',
});

export const kv = {
  async get(key) { const r = await db.kv.get(key); return r ? r.value : undefined; },
  set(key, value) { return db.kv.put({ key, value, at: Date.now() }); },
  del(key) { return db.kv.delete(key); },
  async clear() { await db.kv.clear(); await db.drafts.clear(); },
};
