// Remembered API keys, encrypted at rest in this browser.
//
// Each key is encrypted with AES-GCM under a CryptoKey that is generated as
// non-extractable and kept in IndexedDB. The raw key bytes can never be read
// back by script, so what sits on disk is ciphertext that only this browser
// profile, on this site, can decrypt. Nothing here is ever sent to a server.

const DB = "doshorts";
const STORE = "vault";
const MASTER = "__master";

type Sealed = { iv: Uint8Array<ArrayBuffer>; data: ArrayBuffer };

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const req = run(db.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

async function masterKey(): Promise<CryptoKey> {
  const existing = await tx<CryptoKey | undefined>("readonly", (s) => s.get(MASTER));
  if (existing) return existing;
  const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  await tx("readwrite", (s) => s.put(key, MASTER));
  return key;
}

export async function saveKey(id: string, secret: string): Promise<void> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await masterKey(), new TextEncoder().encode(secret));
  await tx("readwrite", (s) => s.put({ iv, data } satisfies Sealed, id));
}

export async function loadKey(id: string): Promise<string | null> {
  try {
    const sealed = await tx<Sealed | undefined>("readonly", (s) => s.get(id));
    if (!sealed) return null;
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: sealed.iv }, await masterKey(), sealed.data);
    return new TextDecoder().decode(plain);
  } catch {
    return null;
  }
}

export async function forgetKey(id: string): Promise<void> {
  try {
    await tx("readwrite", (s) => s.delete(id));
  } catch {
    // storage unavailable: nothing was stored
  }
}
