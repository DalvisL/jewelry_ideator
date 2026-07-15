// Local-file backup/restore — a browser download/upload pair. Export writes
// the same snapshot backup.js builds to a JSON file the user can save
// anywhere; import reads one back in.
import { collectBackupData, applyBackupData } from "./backup";

function backupFilename() {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `jewelry-ideator-backup-${stamp}.json`;
}

export async function exportBackupToFile() {
  const data = await collectBackupData();
  const json = JSON.stringify(data);
  const filename = backupFilename();

  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  return { filename, data };
}

export async function importBackupFromFile(file) {
  const text = await file.text();
  const data = JSON.parse(text);
  await applyBackupData(data);
  return data;
}
