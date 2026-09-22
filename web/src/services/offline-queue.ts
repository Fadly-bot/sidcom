// Offline Queue Engine using IndexedDB & UUIDv7
// Canonical sync target: POST /api/v1/learning/sync

export interface OfflineCommand {
  command_id: string;
  command_type: 'SUBMIT_LESSON_ATTEMPT' | 'SUBMIT_SRS_REVIEW';
  client_seq: number;
  created_at: string;
  payload: any;
}

const DB_NAME = 'karsa_offline_db';
const STORE_NAME = 'offline_commands';
const DB_VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;
let clientSeqCounter = 1;
let installationId = 'web_' + Math.random().toString(36).substring(2, 10);

// Simple UUIDv7 generator
export function generateUUIDv7(): string {
  const timestamp = Date.now();
  const hexTime = timestamp.toString(16).padStart(12, '0');
  
  // Random bytes
  const bytes = new Uint8Array(10);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 10; i++) bytes[i] = Math.floor(Math.random() * 256);
  }

  // Version 7: set bits 48-51 to 0111
  const part1 = hexTime.slice(0, 8);
  const part2 = hexTime.slice(8, 12);
  const part3 = '7' + Array.from(bytes.slice(0, 2)).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 3);
  
  // Variant: set bits 64-65 to 10
  const variantByte = (bytes[2] & 0x3f) | 0x80;
  const part4 = variantByte.toString(16).padStart(2, '0') + bytes[3].toString(16).padStart(2, '0');
  const part5 = Array.from(bytes.slice(4)).map(b => b.toString(16).padStart(2, '0')).join('');

  return `${part1}-${part2}-${part3}-${part4}-${part5}`;
}

function getDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB not supported'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'command_id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  return dbPromise;
}

const listeners = new Set<(count: number) => void>();

export function subscribePendingCount(listener: (count: number) => void): () => void {
  listeners.add(listener);
  getPendingCommands().then(cmds => listener(cmds.length)).catch(() => {});
  return () => listeners.delete(listener);
}

function notifyCount() {
  getPendingCommands().then(cmds => {
    listeners.forEach(cb => cb(cmds.length));
  }).catch(() => {});
}

export async function enqueueCommand(commandType: OfflineCommand['command_type'], payload: any): Promise<OfflineCommand> {
  const db = await getDB();
  const command: OfflineCommand = {
    command_id: generateUUIDv7(),
    command_type: commandType,
    client_seq: clientSeqCounter++,
    created_at: new Date().toISOString(),
    payload,
  };

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.add(command);

    req.onsuccess = () => {
      notifyCount();
      resolve(command);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function getPendingCommands(): Promise<OfflineCommand[]> {
  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();

      req.onsuccess = () => {
        const sorted = (req.result as OfflineCommand[]).sort((a, b) => a.client_seq - b.client_seq);
        resolve(sorted);
      };
      req.onerror = () => reject(req.error);
    });
  } catch {
    return [];
  }
}

export async function removeCommand(commandId: string): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.delete(commandId);

    req.onsuccess = () => {
      notifyCount();
      resolve();
    };
    req.onerror = () => reject(req.error);
  });
}

let isSyncing = false;

export async function syncPendingCommands(syncApiEndpoint = '/api/v1/learning/sync'): Promise<{ synced: number; failed: number }> {
  if (isSyncing) return { synced: 0, failed: 0 };
  
  const pending = await getPendingCommands();
  if (pending.length === 0) return { synced: 0, failed: 0 };

  isSyncing = true;
  let synced = 0;
  let failed = 0;

  try {
    const response = await fetch(syncApiEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        installation_id: installationId,
        sync_timestamp: new Date().toISOString(),
        commands: pending,
      }),
    });

    if (response.ok) {
      const result = await response.json();
      if (result.results && Array.isArray(result.results)) {
        for (const item of result.results) {
          if (item.status === 'ACCEPTED' || item.status === 'DUPLICATE') {
            await removeCommand(item.command_id);
            synced++;
          } else {
            failed++;
          }
        }
      }
    }
  } catch (err) {
    // Network failure during sync; retain in IndexedDB
  } finally {
    isSyncing = false;
    notifyCount();
  }

  return { synced, failed };
}

// Auto-sync on network restoration
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    syncPendingCommands();
  });
}
