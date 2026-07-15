import { useState } from "react";
import { exportBackupToFile, importBackupFromFile } from "../utils/backupFile";
import { summarizeBackupData } from "../utils/backup";

function fileSummaryText({ entryCount, photoCount, sharedFileCount, projectFileCount }) {
  return `${entryCount} entries, ${photoCount} photos, ${sharedFileCount + projectFileCount} files`;
}

export default function LocalBackup() {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");

  async function handleExport() {
    setBusy(true);
    setStatus("Collecting data…");
    try {
      const { filename, data } = await exportBackupToFile();
      setStatus(`Saved ${filename} — ${fileSummaryText(summarizeBackupData(data))}.`);
    } catch (e) {
      setStatus(e.message || "Export failed.");
    } finally {
      setBusy(false);
    }
  }

  async function handleImport(file) {
    if (!file) return;
    const ok = window.confirm(
      "This replaces all saved ideas, settings, and curated entries on this device with the chosen backup file. This can't be undone. Continue?"
    );
    if (!ok) return;
    setBusy(true);
    setStatus("Reading file…");
    try {
      const data = await importBackupFromFile(file);
      setStatus(`Restoring ${fileSummaryText(summarizeBackupData(data))} — reloading…`);
      window.location.reload();
    } catch (e) {
      setStatus(e.message || "Import failed.");
      setBusy(false);
    }
  }

  return (
    <div className="setting-row setting-row--stack">
      <div className="setting-text">
        <div className="setting-title">Local file</div>
        <div className="setting-desc">
          Export a backup file you can move anywhere — an SD card, a computer,
          another cloud service — independent of Google Drive.
        </div>
        {status && <div className="setting-desc backup-status">{status}</div>}
      </div>
      <div className="ref-settings-actions backup-actions">
        <button type="button" className="btn btn--primary ref-settings-btn" onClick={handleExport} disabled={busy}>
          Export to file
        </button>
        <label className="btn btn--secondary ref-settings-btn">
          Import from file
          <input
            type="file"
            accept="application/json,.json"
            style={{ display: "none" }}
            disabled={busy}
            onChange={(e) => {
              const file = e.target.files[0];
              e.target.value = "";
              handleImport(file);
            }}
          />
        </label>
      </div>
    </div>
  );
}
