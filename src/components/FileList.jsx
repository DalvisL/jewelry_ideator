import Icon from "./Icon";

function formatBytes(bytes) {
  if (!bytes) return "0 KB";
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

// Presentational file list shared by the curator's "Shared Files" section,
// a saved project's attachments, and the file organizer's browse view.
// Callers own the actual storage (curationDb.js vs. projectFilesDb.js) and
// pass in already-resolved {id, filename, description, size, url, term?}
// records plus the callbacks to mutate them.
export default function FileList({
  files,
  onAddFiles,
  onDeleteFile,
  onDescriptionInput,
  onDescriptionBlur,
  addLabel = "Add file(s)",
  emptyLabel = "No files yet",
  showTerm = false,
}) {
  return (
    <div className="file-list">
      {files.length === 0 && <div className="file-list-empty">{emptyLabel}</div>}
      {files.map((f) => (
        <div key={f.id} className="file-row">
          <a className="file-row-link" href={f.url} download={f.filename} target="_blank" rel="noreferrer">
            <Icon name="file" size={20} className="file-row-icon" />
            <div className="file-row-info">
              <div className="file-row-name">{f.filename}</div>
              <div className="file-row-meta">
                {formatBytes(f.size)}
                {showTerm && f.term ? ` · ${f.term}` : ""}
              </div>
            </div>
          </a>
          {onDescriptionInput && (
            <input
              className="curate-input file-row-desc"
              placeholder="Description…"
              value={f.description || ""}
              onChange={(e) => onDescriptionInput(f.id, e.target.value)}
              onBlur={(e) => onDescriptionBlur?.(f.id, e.target.value)}
            />
          )}
          {onDeleteFile && (
            <button
              type="button"
              className="file-row-remove"
              aria-label="Remove file"
              onClick={() => onDeleteFile(f.id)}
            >
              <Icon name="x" size={14} />
            </button>
          )}
        </div>
      ))}
      {onAddFiles && (
        <label className="btn btn--secondary file-add-btn">
          {addLabel}
          <input
            type="file"
            multiple
            style={{ display: "none" }}
            onChange={(e) => {
              const picked = [...e.target.files];
              e.target.value = "";
              if (picked.length) onAddFiles(picked);
            }}
          />
        </label>
      )}
    </div>
  );
}
