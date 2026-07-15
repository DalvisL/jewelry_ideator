// On-device storage for files attached to one specific saved project (as
// opposed to curationDb.js's "sharedFiles", which attach to a term and show
// up on every project that uses it). A separate IndexedDB database, keyed
// by the saved idea's id, since these files are private to a single project.
const DB_NAME = "jewelry-ideator-project-files";
const DB_VERSION = 1;
const FILES_STORE = "files";

let dbPromise = null;
function openDb() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(FILES_STORE)) {
          const files = db.createObjectStore(FILES_STORE, { keyPath: "id", autoIncrement: true });
          files.createIndex("projectId", "projectId", { unique: false });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

function wrap(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function store(mode) {
  const db = await openDb();
  return db.transaction(FILES_STORE, mode).objectStore(FILES_STORE);
}

export async function getFilesForProject(projectId) {
  const s = await store("readonly");
  const all = await wrap(s.index("projectId").getAll(projectId));
  return all.sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || ""));
}

export async function addFile(projectId, { filename, mimeType, blob, description = "" }) {
  const s = await store("readwrite");
  const record = { projectId, filename, mimeType, blob, description, createdAt: new Date().toISOString() };
  const id = await wrap(s.add(record));
  return { id, ...record };
}

export async function updateFileDescription(id, description) {
  const s = await store("readwrite");
  const rec = await wrap(s.get(id));
  if (!rec) return;
  rec.description = description;
  await wrap(s.put(rec));
}

export async function deleteFile(id) {
  const s = await store("readwrite");
  await wrap(s.delete(id));
}

export async function deleteFilesForProject(projectId) {
  const s = await store("readwrite");
  const ids = await wrap(s.index("projectId").getAllKeys(projectId));
  await Promise.all(ids.map((id) => wrap(s.delete(id))));
}

// ---- Bulk export/import, for Google Drive backup/restore ----

export async function getAllFiles() {
  const s = await store("readonly");
  return wrap(s.getAll());
}

export async function replaceAllFiles(files) {
  const s = await store("readwrite");
  await wrap(s.clear());
  for (const record of files) {
    const { id, ...rest } = record;
    await wrap(s.add(rest));
  }
}
