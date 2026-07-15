// On-device persistence for hand-curated reference entries — an IndexedDB
// database local to the app, so edits made on the phone/tablet survive
// restarts without any server or rebuild step.
//
// Four stores:
//  - "entries": small text records, keyed by term.
//  - "images" (v1 legacy): one blob per term. Kept only as a migration
//    source for anyone who curated entries before multi-photo support.
//  - "photos" (v2+): many blob+caption records per term, keyed by an
//    auto-incrementing id with a "term" index, so an entry can carry any
//    number of captioned pictures.
//  - "sharedFiles" (v3+): arbitrary files (PDFs, diagrams, etc.) attached to
//    a term the same way photos are — the file "belongs to" e.g. "Step Cut"
//    or "Emerald" rather than to any one saved project, so it automatically
//    shows up on every saved project whose fields include that term (see
//    utils/sharedFiles.js), and deleting it here removes it everywhere.
const DB_NAME = "jewelry-ideator-curation";
const DB_VERSION = 3;
const ENTRIES_STORE = "entries";
const LEGACY_IMAGES_STORE = "images";
const PHOTOS_STORE = "photos";
const SHARED_FILES_STORE = "sharedFiles";

let dbPromise = null;
function openDb() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (event) => {
        const db = req.result;
        const tx = event.target.transaction;

        if (!db.objectStoreNames.contains(ENTRIES_STORE)) {
          db.createObjectStore(ENTRIES_STORE, { keyPath: "term" });
        }

        let legacyImages = null;
        if (db.objectStoreNames.contains(LEGACY_IMAGES_STORE)) {
          legacyImages = tx.objectStore(LEGACY_IMAGES_STORE);
        }

        let photos = null;
        if (!db.objectStoreNames.contains(PHOTOS_STORE)) {
          photos = db.createObjectStore(PHOTOS_STORE, { keyPath: "id", autoIncrement: true });
          photos.createIndex("term", "term", { unique: false });
        } else {
          photos = tx.objectStore(PHOTOS_STORE);
        }

        if (!db.objectStoreNames.contains(SHARED_FILES_STORE)) {
          const sharedFiles = db.createObjectStore(SHARED_FILES_STORE, { keyPath: "id", autoIncrement: true });
          sharedFiles.createIndex("term", "term", { unique: false });
        }

        // One-time migration: each old single-image-per-term record becomes
        // a captionless photo under the new multi-photo store.
        if (event.oldVersion < 2 && legacyImages) {
          legacyImages.openCursor().onsuccess = (e) => {
            const cursor = e.target.result;
            if (!cursor) return;
            photos.add({
              term: cursor.value.term,
              blob: cursor.value.blob,
              caption: "",
              createdAt: new Date().toISOString(),
            });
            cursor.continue();
          };
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

async function store(name, mode) {
  const db = await openDb();
  return db.transaction(name, mode).objectStore(name);
}

export async function getAllEntries() {
  const s = await store(ENTRIES_STORE, "readonly");
  return wrap(s.getAll());
}

export async function getEntry(term) {
  const s = await store(ENTRIES_STORE, "readonly");
  return wrap(s.get(term));
}

export async function saveEntry(record) {
  const s = await store(ENTRIES_STORE, "readwrite");
  await wrap(s.put(record));
  return record;
}

export async function deleteEntry(term) {
  const entries = await store(ENTRIES_STORE, "readwrite");
  await wrap(entries.delete(term));
  await deletePhotosForTerm(term);
  await deleteFilesForTerm(term);
}

// ---- Photos (multiple per term, each with its own caption) ----

export async function getPhotosForTerm(term) {
  const s = await store(PHOTOS_STORE, "readonly");
  const all = await wrap(s.index("term").getAll(term));
  return all.sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || ""));
}

export async function addPhoto(term, blob, caption = "") {
  const s = await store(PHOTOS_STORE, "readwrite");
  const id = await wrap(s.add({ term, blob, caption, createdAt: new Date().toISOString() }));
  return { id, term, blob, caption };
}

export async function updatePhotoCaption(id, caption) {
  const s = await store(PHOTOS_STORE, "readwrite");
  const rec = await wrap(s.get(id));
  if (!rec) return;
  rec.caption = caption;
  await wrap(s.put(rec));
}

export async function deletePhoto(id) {
  const s = await store(PHOTOS_STORE, "readwrite");
  await wrap(s.delete(id));
}

export async function deletePhotosForTerm(term) {
  const s = await store(PHOTOS_STORE, "readwrite");
  const ids = await wrap(s.index("term").getAllKeys(term));
  await Promise.all(ids.map((id) => wrap(s.delete(id))));
}

export async function countPhotosForTerm(term) {
  const s = await store(PHOTOS_STORE, "readonly");
  return wrap(s.index("term").count(term));
}

// ---- Shared files (multiple per term, any file type) ----

export async function getFilesForTerm(term) {
  const s = await store(SHARED_FILES_STORE, "readonly");
  const all = await wrap(s.index("term").getAll(term));
  return all.sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || ""));
}

export async function addFile(term, { filename, mimeType, blob, description = "" }) {
  const s = await store(SHARED_FILES_STORE, "readwrite");
  const record = { term, filename, mimeType, blob, description, createdAt: new Date().toISOString() };
  const id = await wrap(s.add(record));
  return { id, ...record };
}

export async function updateFileDescription(id, description) {
  const s = await store(SHARED_FILES_STORE, "readwrite");
  const rec = await wrap(s.get(id));
  if (!rec) return;
  rec.description = description;
  await wrap(s.put(rec));
}

export async function deleteFile(id) {
  const s = await store(SHARED_FILES_STORE, "readwrite");
  await wrap(s.delete(id));
}

export async function deleteFilesForTerm(term) {
  const s = await store(SHARED_FILES_STORE, "readwrite");
  const ids = await wrap(s.index("term").getAllKeys(term));
  await Promise.all(ids.map((id) => wrap(s.delete(id))));
}

// Every term that currently has at least one shared file, with its files —
// used by the file organizer's "Shared Files" browse view.
export async function getAllSharedFilesGrouped() {
  const all = await getAllFiles();
  const byTerm = new Map();
  for (const f of all) {
    if (!byTerm.has(f.term)) byTerm.set(f.term, []);
    byTerm.get(f.term).push(f);
  }
  return [...byTerm.entries()].map(([term, files]) => ({ term, files }));
}

// ---- Bulk export/import, for Google Drive backup/restore ----

export async function getAllPhotos() {
  const s = await store(PHOTOS_STORE, "readonly");
  return wrap(s.getAll());
}

export async function getAllFiles() {
  const s = await store(SHARED_FILES_STORE, "readonly");
  return wrap(s.getAll());
}

// Wipes all stores and repopulates them from a prior export. Used only by
// the restore flow, where the on-device data is meant to be fully replaced
// by the backup snapshot rather than merged with it.
export async function replaceAllData({ entries, photos, sharedFiles = [] }) {
  const db = await openDb();
  const tx = db.transaction([ENTRIES_STORE, PHOTOS_STORE, SHARED_FILES_STORE], "readwrite");
  const entriesStore = tx.objectStore(ENTRIES_STORE);
  const photosStore = tx.objectStore(PHOTOS_STORE);
  const filesStore = tx.objectStore(SHARED_FILES_STORE);

  await wrap(entriesStore.clear());
  await wrap(photosStore.clear());
  await wrap(filesStore.clear());
  for (const record of entries) await wrap(entriesStore.put(record));
  // Let the store assign fresh autoincrement ids rather than trusting the
  // backup's old ones, which could collide with whatever's already there.
  for (const record of photos) {
    const { id, ...rest } = record;
    await wrap(photosStore.add(rest));
  }
  for (const record of sharedFiles) {
    const { id, ...rest } = record;
    await wrap(filesStore.add(rest));
  }

  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
