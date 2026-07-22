// db.js — Centralized SQLite persistence layer (sql.js + IndexedDB-backed durability).
// Replaces chrome.storage.local / localStorage as the app's persistence mechanism.
// All other code talks to storage exclusively through window.ClairDB.
const ClairDB = (() => {
  const TABLES = ['projects', 'tasks', 'tests', 'activity', 'developers', 'releases', 'testCases', 'modules', 'releasePoints'];
  const SCHEMA_VERSION = 1;
  const IDB_NAME = 'clair_sqlite';
  const IDB_STORE = 'files';
  const IDB_KEY = 'main.sqlite';

  let SQL = null;
  let db = null;
  let readyPromise = null;

  // ── IndexedDB: durable byte storage for the exported sqlite file ──
  function idbOpen() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function idbGetFile() {
    const conn = await idbOpen();
    return new Promise((resolve, reject) => {
      const tx = conn.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).get(IDB_KEY);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  async function idbPutFile(bytes) {
    const conn = await idbOpen();
    return new Promise((resolve, reject) => {
      const tx = conn.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put(bytes, IDB_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  // ── Schema ──
  function ensureSchema() {
    db.run('CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT)');
    TABLES.forEach(t => {
      db.run(`CREATE TABLE IF NOT EXISTS ${t} (
        seq INTEGER PRIMARY KEY,
        id TEXT,
        data TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      )`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_${t}_id ON ${t}(id)`);
    });
  }

  function getMeta(key) {
    const res = db.exec('SELECT value FROM meta WHERE key = ?', [key]);
    return res.length ? res[0].values[0][0] : null;
  }

  function setMeta(key, value) {
    db.run('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', [key, value]);
  }

  // ── One-time migration from the legacy chrome.storage.local / localStorage data ──
  async function readLegacy() {
    const legacy = { prefs: {} };
    if (typeof chrome !== 'undefined' && chrome.storage) {
      await new Promise(resolve => {
        chrome.storage.local.get(TABLES, data => {
          TABLES.forEach(t => { legacy[t] = data[t] || []; });
          resolve();
        });
      });
    } else {
      TABLES.forEach(t => {
        try { legacy[t] = JSON.parse(localStorage.getItem(`clair_${t}`) || '[]'); }
        catch (e) { legacy[t] = []; }
      });
    }
    legacy.prefs.projects_view_mode = localStorage.getItem('clair_projects_view_mode') || null;
    legacy.prefs.db_initialized = localStorage.getItem('clair_db_initialized') || null;
    return legacy;
  }

  function hasAnyLegacyData(legacy) {
    return TABLES.some(t => (legacy[t] || []).length > 0) ||
      legacy.prefs.projects_view_mode || legacy.prefs.db_initialized;
  }

  async function migrateFromLegacyStorage() {
    if (getMeta('migrated_v1') === 'true') return; // idempotent: already migrated, never re-run

    const legacy = await readLegacy();
    if (!hasAnyLegacyData(legacy)) {
      setMeta('migrated_v1', 'true');
      setMeta('schema_version', String(SCHEMA_VERSION));
      await persist();
      return;
    }

    db.run('BEGIN TRANSACTION');
    try {
      TABLES.forEach(t => {
        const rows = legacy[t] || [];
        rows.forEach((rec, i) => {
          const id = rec && rec.id != null ? String(rec.id) : `${t}_legacy_${i}`;
          db.run('INSERT INTO ' + t + ' (seq, id, data, updated_at) VALUES (?, ?, ?, ?)',
            [i, id, JSON.stringify(rec), Date.now()]);
        });
      });

      // Verify: every row we intended to insert must be readable back before committing.
      TABLES.forEach(t => {
        const expected = (legacy[t] || []).length;
        const actual = db.exec(`SELECT COUNT(*) FROM ${t}`)[0].values[0][0];
        if (actual !== expected) throw new Error(`Migration verification failed for table "${t}": expected ${expected}, got ${actual}`);
      });

      if (legacy.prefs.projects_view_mode) setMeta('pref_projects_view_mode', legacy.prefs.projects_view_mode);
      if (legacy.prefs.db_initialized) setMeta('pref_db_initialized', legacy.prefs.db_initialized);

      setMeta('migrated_v1', 'true');
      setMeta('schema_version', String(SCHEMA_VERSION));
      db.run('COMMIT');
    } catch (e) {
      db.run('ROLLBACK');
      throw new Error('Migration failed, changes rolled back: ' + e.message);
    }

    await persist();

    // Only clean up legacy storage after a verified, committed, persisted migration.
    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.local.remove(TABLES);
    }
    localStorage.removeItem('clair_projects_view_mode');
    localStorage.removeItem('clair_db_initialized');
    TABLES.forEach(t => localStorage.removeItem(`clair_${t}`));
  }

  // ── Public API ──
  async function init() {
    if (readyPromise) return readyPromise;
    readyPromise = (async () => {
      const wasmUrl = (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL)
        ? chrome.runtime.getURL('sql-wasm.wasm')
        : 'sql-wasm.wasm';
      SQL = await initSqlJs({ locateFile: () => wasmUrl });

      let bytes = null;
      try { bytes = await idbGetFile(); } catch (e) { console.warn('IndexedDB read failed, starting fresh DB:', e); }
      db = bytes ? new SQL.Database(new Uint8Array(bytes)) : new SQL.Database();

      ensureSchema();
      await migrateFromLegacyStorage();
    })();
    return readyPromise;
  }

  async function persist() {
    const bytes = db.export();
    await idbPutFile(bytes);
  }

  function selectAll(table) {
    const res = db.exec(`SELECT data FROM ${table} ORDER BY seq`);
    if (!res.length) return [];
    return res[0].values.map(row => JSON.parse(row[0]));
  }

  async function load() {
    await init();
    const out = {};
    TABLES.forEach(t => { out[t] = selectAll(t); });
    return out;
  }

  // Whole-state save, matching the app's existing "flush entire arrays" behavior.
  async function save(payload) {
    await init();
    db.run('BEGIN TRANSACTION');
    try {
      TABLES.forEach(t => {
        db.run(`DELETE FROM ${t}`);
        const arr = payload[t] || [];
        const stmt = db.prepare(`INSERT INTO ${t} (seq, id, data, updated_at) VALUES (?, ?, ?, ?)`);
        const now = Date.now();
        arr.forEach((rec, i) => {
          const id = rec && rec.id != null ? String(rec.id) : `${t}_${i}_${now}`;
          stmt.run([i, id, JSON.stringify(rec), now]);
        });
        stmt.free();
      });
      db.run('COMMIT');
    } catch (e) {
      db.run('ROLLBACK');
      throw new Error('Save failed, transaction rolled back: ' + e.message);
    }
    await persist();
  }

  async function getPref(key, fallback = null) {
    await init();
    const val = getMeta(`pref_${key}`);
    return val == null ? fallback : val;
  }

  async function setPref(key, value) {
    await init();
    setMeta(`pref_${key}`, value);
    await persist();
  }

  return { init, load, save, getPref, setPref };
})();
