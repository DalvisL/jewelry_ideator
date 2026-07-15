// Serializes everything the app stores locally — saved ideas (including
// notes), settings, curated reference entries, their photos and shared
// files, and every saved project's own attached files — into a single JSON
// snapshot, and restores it back. This is the shape that gets uploaded to /
// downloaded from Google Drive (see googleDrive.js).
import { getAllEntries, getAllPhotos, getAllFiles as getAllSharedFiles, replaceAllData } from "./curationDb";
import { getAllFiles as getAllProjectFiles, replaceAllFiles as replaceAllProjectFiles } from "./projectFilesDb";

export const BACKUP_VERSION = 2;

const LOCAL_STORAGE_KEYS = ["jewelry-ideator.saved", "jewelry-ideator.settings", "jewelry-ideator.folders"];

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function dataUrlToBlob(dataUrl) {
  const res = await fetch(dataUrl);
  return res.blob();
}

export async function collectBackupData() {
  const localStorageData = {};
  for (const key of LOCAL_STORAGE_KEYS) {
    const value = localStorage.getItem(key);
    if (value != null) localStorageData[key] = value;
  }

  const entries = await getAllEntries();

  const photos = await getAllPhotos();
  const photosWithData = await Promise.all(
    photos.map(async (p) => ({
      term: p.term,
      caption: p.caption,
      createdAt: p.createdAt,
      mimeType: p.blob.type || "image/jpeg",
      dataUrl: await blobToDataUrl(p.blob),
    }))
  );

  const sharedFiles = await getAllSharedFiles();
  const sharedFilesWithData = await Promise.all(
    sharedFiles.map(async (f) => ({
      term: f.term,
      filename: f.filename,
      description: f.description,
      createdAt: f.createdAt,
      mimeType: f.mimeType || f.blob.type || "application/octet-stream",
      dataUrl: await blobToDataUrl(f.blob),
    }))
  );

  const projectFiles = await getAllProjectFiles();
  const projectFilesWithData = await Promise.all(
    projectFiles.map(async (f) => ({
      projectId: f.projectId,
      filename: f.filename,
      description: f.description,
      createdAt: f.createdAt,
      mimeType: f.mimeType || f.blob.type || "application/octet-stream",
      dataUrl: await blobToDataUrl(f.blob),
    }))
  );

  return {
    version: BACKUP_VERSION,
    createdAt: new Date().toISOString(),
    localStorage: localStorageData,
    entries,
    photos: photosWithData,
    sharedFiles: sharedFilesWithData,
    projectFiles: projectFilesWithData,
  };
}

export function summarizeBackupData(data) {
  return {
    entryCount: data.entries?.length || 0,
    photoCount: data.photos?.length || 0,
    sharedFileCount: data.sharedFiles?.length || 0,
    projectFileCount: data.projectFiles?.length || 0,
    createdAt: data.createdAt || null,
  };
}

export async function applyBackupData(data) {
  if (!data || typeof data !== "object") throw new Error("Backup file is empty or invalid.");
  if (data.version > BACKUP_VERSION) {
    throw new Error("This backup was made by a newer version of the app.");
  }

  for (const [key, value] of Object.entries(data.localStorage || {})) {
    localStorage.setItem(key, value);
  }

  const photos = await Promise.all(
    (data.photos || []).map(async (p) => ({
      term: p.term,
      caption: p.caption,
      createdAt: p.createdAt,
      blob: await dataUrlToBlob(p.dataUrl),
    }))
  );
  const sharedFiles = await Promise.all(
    (data.sharedFiles || []).map(async (f) => ({
      term: f.term,
      filename: f.filename,
      mimeType: f.mimeType,
      description: f.description,
      createdAt: f.createdAt,
      blob: await dataUrlToBlob(f.dataUrl),
    }))
  );
  await replaceAllData({ entries: data.entries || [], photos, sharedFiles });

  const projectFiles = await Promise.all(
    (data.projectFiles || []).map(async (f) => ({
      projectId: f.projectId,
      filename: f.filename,
      mimeType: f.mimeType,
      description: f.description,
      createdAt: f.createdAt,
      blob: await dataUrlToBlob(f.dataUrl),
    }))
  );
  await replaceAllProjectFiles(projectFiles);
}
