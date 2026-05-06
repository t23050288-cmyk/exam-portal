/**
 * examIDB.ts
 * IndexedDB wrapper for exam responses + telemetry queue.
 * Uses native IDBDatabase (no extra library needed).
 *
 * DB name:   exam-portal-idb
 * Stores:
 *   responses  — keyed by [sessionId, questionId]; value = ResponseRecord
 *   events     — ordered list of TelemetryEvent with uuid event_id
 *   meta       — arbitrary k/v (lastSyncedAt, throttleMode, etc.)
 */

export interface ResponseRecord {
  sessionId:   string;
  questionId:  string;
  answerJson:  Record<string, unknown>;
  updatedAt:   string;       // ISO string
  dirty:       boolean;      // true = not yet synced to server
  isFinal:     boolean;
}

export interface TelemetryEvent {
  eventId:     string;       // client-generated UUID (dedup key)
  type:        string;
  payloadJson: Record<string, unknown>;
  ts:          number;       // epoch ms
  sessionId:   string;
}

const DB_NAME    = "exam-portal-idb";
const DB_VERSION = 1;

let _db: IDBDatabase | null = null;

function openDB(): Promise<IDBDatabase> {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains("responses")) {
        const s = db.createObjectStore("responses", { keyPath: ["sessionId", "questionId"] });
        s.createIndex("by_session", "sessionId");
        s.createIndex("by_dirty",   ["sessionId", "dirty"]);
      }
      if (!db.objectStoreNames.contains("events")) {
        const s2 = db.createObjectStore("events", { keyPath: "eventId" });
        s2.createIndex("by_session", "sessionId");
      }
      if (!db.objectStoreNames.contains("meta")) {
        db.createObjectStore("meta", { keyPath: "key" });
      }
    };
    req.onsuccess = (e) => { _db = (e.target as IDBOpenDBRequest).result; resolve(_db!); };
    req.onerror   = ()  => reject(req.error);
  });
}

function tx(store: string, mode: IDBTransactionMode = "readonly") {
  return openDB().then((db) => {
    const t = db.transaction(store, mode);
    return t.objectStore(store);
  });
}

function promisify<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((res, rej) => {
    req.onsuccess = () => res(req.result);
    req.onerror   = () => rej(req.error);
  });
}

// ── Responses ────────────────────────────────────────────────────────────────

export async function saveResponse(record: ResponseRecord): Promise<void> {
  const s = await tx("responses", "readwrite");
  await promisify(s.put(record));
}

export async function getDirtyResponses(sessionId: string, limit = 200): Promise<ResponseRecord[]> {
  const s     = await tx("responses", "readonly");
  const index = s.index("by_session");
  const all   = await promisify<ResponseRecord[]>(index.getAll(sessionId));
  return all.filter((r) => r.dirty).slice(0, limit);
}

export async function markResponsesSynced(sessionId: string, questionIds: string[]): Promise<void> {
  const s = await tx("responses", "readwrite");
  for (const qid of questionIds) {
    const existing = await promisify<ResponseRecord | undefined>(s.get([sessionId, qid]));
    if (existing) {
      existing.dirty = false;
      s.put(existing);
    }
  }
}

export async function getAllResponses(sessionId: string): Promise<ResponseRecord[]> {
  const s     = await tx("responses", "readonly");
  const index = s.index("by_session");
  return promisify<ResponseRecord[]>(index.getAll(sessionId));
}

// ── Telemetry Events ─────────────────────────────────────────────────────────

export async function queueEvent(event: TelemetryEvent): Promise<void> {
  const s = await tx("events", "readwrite");
  await promisify(s.put(event));
}

export async function getPendingEvents(sessionId: string, limit = 50): Promise<TelemetryEvent[]> {
  const s     = await tx("events", "readonly");
  const index = s.index("by_session");
  const all   = await promisify<TelemetryEvent[]>(index.getAll(sessionId));
  return all.slice(0, limit);
}

export async function deleteEvents(eventIds: string[]): Promise<void> {
  const s = await tx("events", "readwrite");
  for (const id of eventIds) s.delete(id);
}

// ── Meta ──────────────────────────────────────────────────────────────────────

export async function setMeta(key: string, value: unknown): Promise<void> {
  const s = await tx("meta", "readwrite");
  await promisify(s.put({ key, value }));
}

export async function getMeta<T = unknown>(key: string): Promise<T | undefined> {
  const s   = await tx("meta", "readonly");
  const rec = await promisify<{ key: string; value: T } | undefined>(s.get(key));
  return rec?.value;
}

// ── Nuke (on final submit) ────────────────────────────────────────────────────

export async function clearSession(sessionId: string): Promise<void> {
  const rStore = await tx("responses", "readwrite");
  const idx    = rStore.index("by_session");
  const rKeys  = await promisify<IDBValidKey[]>(idx.getAllKeys(sessionId));
  for (const k of rKeys) rStore.delete(k);

  const eStore = await tx("events", "readwrite");
  const eIdx   = eStore.index("by_session");
  const eKeys  = await promisify<IDBValidKey[]>(eIdx.getAllKeys(sessionId));
  for (const k of eKeys) eStore.delete(k);
}

// ── Beacon payload (< 64KB) ───────────────────────────────────────────────────

export async function buildBeaconPayload(sessionId: string): Promise<Blob | null> {
  const events    = await getPendingEvents(sessionId, 30);
  const responses = await getDirtyResponses(sessionId, 20);
  if (!events.length && !responses.length) return null;

  const payload = JSON.stringify({ session_id: sessionId, events, responses });
  if (payload.length > 60_000) {
    // Too large for beacon — only send events
    const small = JSON.stringify({ session_id: sessionId, events: events.slice(0, 15), responses: [] });
    return new Blob([small], { type: "application/json" });
  }
  return new Blob([payload], { type: "application/json" });
}
