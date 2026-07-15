import { useEffect, useMemo, useRef, useState } from "react";
import Icon from "./Icon";
import FileList from "./FileList";
import { getSharedFilesForIdea } from "../utils/sharedFiles";
import { deleteFile as deleteSharedFile } from "../utils/curationDb";
import {
  getFilesForProject,
  addFile as addProjectFile,
  updateFileDescription as updateProjectFileDescription,
  deleteFile as deleteProjectFile,
} from "../utils/projectFilesDb";
import { exportSpecSheet } from "../utils/specSheet";

const STATUSES = [
  { key: "idea", label: "Idea", color: "#8a8a90" },
  { key: "in-progress", label: "In Progress", color: "#f5a623" },
  { key: "done", label: "Done", color: "#34c759" },
];
const statusMeta = (key) => STATUSES.find((s) => s.key === key) || STATUSES[0];

function ideaTitle(idea) {
  if (idea.rows) return idea.rows[0]?.value || "Idea";
  return (
    [idea.style, idea.type].filter(Boolean).join(" ") ||
    idea.gemstone ||
    idea.inspiration ||
    idea.metal ||
    idea.setting ||
    "Saved Idea"
  );
}

// Flat text blob used for search matching — title, every field value, and
// notes, all lowercased.
function ideaSearchText(idea) {
  const parts = [ideaTitle(idea), idea.notes || ""];
  if (idea.rows) {
    for (const r of idea.rows) parts.push(r.value);
  } else {
    parts.push(idea.type, idea.metal, idea.gemstone, idea.gemShape, idea.gemCut, idea.style, idea.inspiration, idea.setting);
  }
  return parts.filter(Boolean).join(" ").toLowerCase();
}

function StatusDot({ status }) {
  return <span className="status-dot" style={{ background: statusMeta(status).color }} />;
}

function IdeaSummary({ idea }) {
  if (idea.rows) {
    return (
      <>
        {idea.rows.slice(1).map((r) => (
          <div key={r.key} className="saved-item-meta">
            {r.label}: {r.value}
          </div>
        ))}
      </>
    );
  }
  const gemLine = [idea.metal, idea.gemstone].filter(Boolean).join(" · ");
  const cutLine = [idea.gemShape, idea.gemCut].filter(Boolean).join(" ");
  return (
    <>
      {gemLine && <div className="saved-item-meta">{gemLine}</div>}
      {cutLine && <div className="saved-item-meta">{cutLine}</div>}
      {idea.setting && <div className="saved-item-sub">{idea.setting}</div>}
      {idea.inspiration && <div className="saved-item-sub">{idea.inspiration}</div>}
    </>
  );
}

function ProjectDetail({ idea, folders, onUpdateNotes, onUpdateStatus, onMoveProject }) {
  const [notes, setNotes] = useState(idea.notes || "");
  const [projectFiles, setProjectFiles] = useState([]);
  const [sharedFiles, setSharedFiles] = useState([]);
  const [status, setStatus] = useState("");
  const [exporting, setExporting] = useState(false);

  const projectFilesRef = useRef([]);
  const projectUrlsRef = useRef([]);
  const sharedUrlsRef = useRef([]);

  useEffect(() => {
    setNotes(idea.notes || "");
    let cancelled = false;
    getFilesForProject(idea.id).then((records) => {
      if (cancelled) return;
      const withUrls = records.map((r) => {
        const url = URL.createObjectURL(r.blob);
        projectUrlsRef.current.push(url);
        return { id: r.id, filename: r.filename, description: r.description, size: r.blob.size, url, mimeType: r.mimeType };
      });
      projectFilesRef.current = withUrls;
      setProjectFiles(withUrls);
    });
    getSharedFilesForIdea(idea).then((records) => {
      if (cancelled) return;
      const withUrls = records.map((r) => {
        const url = URL.createObjectURL(r.blob);
        sharedUrlsRef.current.push(url);
        return { id: r.id, filename: r.filename, description: r.description, size: r.blob.size, url, term: r.term };
      });
      setSharedFiles(withUrls);
    });
    return () => {
      cancelled = true;
      projectUrlsRef.current.forEach((u) => URL.revokeObjectURL(u));
      sharedUrlsRef.current.forEach((u) => URL.revokeObjectURL(u));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idea.id]);

  async function handleAddProjectFiles(picked) {
    for (const file of picked) {
      const saved = await addProjectFile(idea.id, { filename: file.name, mimeType: file.type, blob: file });
      const url = URL.createObjectURL(file);
      projectUrlsRef.current.push(url);
      const next = [
        ...projectFilesRef.current,
        { id: saved.id, filename: file.name, description: "", size: file.size, url, mimeType: file.type },
      ];
      projectFilesRef.current = next;
      setProjectFiles(next);
    }
  }

  async function handleRemoveProjectFile(id) {
    const removed = projectFilesRef.current.find((f) => f.id === id);
    if (removed) URL.revokeObjectURL(removed.url);
    const next = projectFilesRef.current.filter((f) => f.id !== id);
    projectFilesRef.current = next;
    setProjectFiles(next);
    await deleteProjectFile(id);
  }

  function handleProjectFileDescInput(id, value) {
    const next = projectFilesRef.current.map((f) => (f.id === id ? { ...f, description: value } : f));
    projectFilesRef.current = next;
    setProjectFiles(next);
  }
  async function handleProjectFileDescBlur(id, value) {
    await updateProjectFileDescription(id, value);
  }

  async function handleRemoveSharedFile(id) {
    const target = sharedFiles.find((f) => f.id === id);
    const ok = window.confirm(
      `Remove "${target?.filename}"? This is a shared file for "${target?.term}" — it'll disappear from every saved project that uses this term, not just this one.`
    );
    if (!ok) return;
    URL.revokeObjectURL(target.url);
    setSharedFiles((prev) => prev.filter((f) => f.id !== id));
    await deleteSharedFile(id);
  }

  function handleNotesBlur() {
    onUpdateNotes(idea.id, notes);
    setStatus("Notes saved.");
    setTimeout(() => setStatus(""), 1500);
  }

  async function handleExport() {
    setExporting(true);
    setStatus("Building spec sheet…");
    try {
      const folderName = folders.find((f) => f.id === idea.folderId)?.name || null;
      await exportSpecSheet(idea, {
        title: ideaTitle(idea),
        folderName,
        statusLabel: statusMeta(idea.status).label,
        projectFiles,
      });
      setStatus("Spec sheet ready.");
    } catch (e) {
      setStatus(e.message || "Export failed.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="ref-detail">
      <h3 className="ref-detail-title">{ideaTitle(idea)}</h3>
      <IdeaSummary idea={idea} />

      <label className="curate-label project-files-label">Status</label>
      <div className="segmented status-segmented" role="tablist">
        {STATUSES.map((s) => (
          <button
            key={s.key}
            className={`seg${(idea.status || "idea") === s.key ? " seg--active" : ""}`}
            onClick={() => onUpdateStatus(idea.id, s.key)}
          >
            <span className="status-dot" style={{ background: s.color }} />
            {s.label}
          </button>
        ))}
      </div>

      <label className="curate-label project-files-label">
        <Icon name="folder" size={14} />
        Folder
      </label>
      <select
        className="curate-input"
        value={idea.folderId || ""}
        onChange={(e) => onMoveProject(idea.id, e.target.value || null)}
      >
        <option value="">No folder</option>
        {folders.map((f) => (
          <option key={f.id} value={f.id}>{f.name}</option>
        ))}
      </select>

      <label className="curate-label project-notes-label">
        <Icon name="note" size={14} />
        Notes
      </label>
      <textarea
        className="curate-input curate-textarea project-notes"
        placeholder="Add notes about this project…"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        onBlur={handleNotesBlur}
      />
      {status && <div className="curate-status">{status}</div>}

      <div className="curate-actions spec-sheet-actions">
        <button type="button" className="btn btn--secondary" onClick={handleExport} disabled={exporting}>
          <Icon name="file" size={16} />
          Export spec sheet
        </button>
      </div>

      <label className="curate-label project-files-label">
        <Icon name="file" size={14} />
        Project files
      </label>
      <FileList
        files={projectFiles}
        onAddFiles={handleAddProjectFiles}
        onDeleteFile={handleRemoveProjectFile}
        onDescriptionInput={handleProjectFileDescInput}
        onDescriptionBlur={handleProjectFileDescBlur}
        addLabel="Add file(s)"
        emptyLabel="No files attached to this project yet"
      />

      {sharedFiles.length > 0 && (
        <>
          <label className="curate-label project-files-label">
            <Icon name="folder" size={14} />
            Shared files (linked by material/technique)
          </label>
          <FileList
            files={sharedFiles}
            onDeleteFile={handleRemoveSharedFile}
            showTerm
            emptyLabel=""
          />
        </>
      )}
    </div>
  );
}

export default function SavedIdeas({
  saved,
  folders,
  onRemove,
  onClose,
  onUpdateNotes,
  onUpdateStatus,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
  onMoveProject,
  initialOpenId,
}) {
  const [view, setView] = useState("folders"); // "folders" | "list" | "detail"
  const [activeFolderId, setActiveFolderId] = useState(null); // null = "All Projects"
  const [openId, setOpenId] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (initialOpenId == null) return;
    const target = saved.find((s) => s.id === initialOpenId);
    setActiveFolderId(target?.folderId ?? null);
    setOpenId(initialOpenId);
    setView("detail");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialOpenId]);

  const openIdea = openId != null ? saved.find((s) => s.id === openId) : null;
  const activeFolder = activeFolderId ? folders.find((f) => f.id === activeFolderId) : null;
  const folderIdeas = activeFolderId ? saved.filter((s) => s.folderId === activeFolderId) : saved;

  const listIdeas = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return folderIdeas;
    return folderIdeas.filter((idea) => ideaSearchText(idea).includes(q));
  }, [folderIdeas, query]);

  function openFolder(folderId) {
    setActiveFolderId(folderId);
    setQuery("");
    setView("list");
  }

  function handleNewFolder() {
    const name = window.prompt("New folder name");
    if (name && name.trim()) onCreateFolder(name.trim());
  }
  function handleRenameFolder(folder) {
    const name = window.prompt("Rename folder", folder.name);
    if (name && name.trim() && name.trim() !== folder.name) onRenameFolder(folder.id, name.trim());
  }
  function handleDeleteFolder(folder) {
    const ok = window.confirm(`Delete folder "${folder.name}"? Its projects stay saved, just unfiled.`);
    if (!ok) return;
    onDeleteFolder(folder.id);
    if (activeFolderId === folder.id) {
      setActiveFolderId(null);
      setView("folders");
    }
  }

  function handleDeleteProject(id) {
    if (window.confirm("Delete this saved project? This can't be undone.")) {
      onRemove(id);
      setView("list");
    }
  }

  function headerBack() {
    if (view === "detail") setView("list");
    else if (view === "list") { setView("folders"); setEditMode(false); }
    else onClose();
  }

  const title =
    view === "folders" ? "Saved Projects" : view === "list" ? activeFolder?.name || "All Projects" : ideaTitle(openIdea || {});

  return (
    <div className="full-page">
      <div className="full-page-header">
        <button type="button" className="text-btn full-page-back" onClick={headerBack}>
          <Icon name="chevronLeft" size={18} />
          {view === "folders" ? "Back" : view === "list" ? "Folders" : "Back"}
        </button>
        <div className="full-page-title">{title}</div>
        {view === "folders" && (
          <button type="button" className="text-btn" onClick={() => setEditMode((e) => !e)}>
            {editMode ? "Done" : "Edit"}
          </button>
        )}
        {view === "detail" && openIdea && (
          <button type="button" className="text-btn delete-link" onClick={() => handleDeleteProject(openIdea.id)}>
            <Icon name="trash" size={16} />
          </button>
        )}
        {view === "list" && <span className="full-page-header-spacer" />}
      </div>

      <div className="full-page-body">
        {view === "folders" && (
          <>
            <div className="folder-grid">
              <button type="button" className="folder-tile folder-tile--all" onClick={() => openFolder(null)}>
                <Icon name="bookmark" size={32} />
                <div className="folder-tile-name">All Projects</div>
                <div className="folder-tile-count">{saved.length}</div>
              </button>
              {folders.map((f) => (
                <div key={f.id} className="folder-tile-wrap">
                  <button
                    type="button"
                    className="folder-tile"
                    onClick={() => (editMode ? handleRenameFolder(f) : openFolder(f.id))}
                  >
                    <Icon name="folder" size={32} />
                    <div className="folder-tile-name">{f.name}</div>
                    <div className="folder-tile-count">
                      {saved.filter((s) => s.folderId === f.id).length}
                    </div>
                  </button>
                  {editMode && (
                    <button
                      type="button"
                      className="folder-tile-delete"
                      onClick={() => handleDeleteFolder(f)}
                      aria-label={`Delete ${f.name}`}
                    >
                      <Icon name="x" size={12} />
                    </button>
                  )}
                </div>
              ))}
              <button type="button" className="folder-tile folder-tile--new" onClick={handleNewFolder}>
                <Icon name="plus" size={32} />
                <div className="folder-tile-name">New Folder</div>
              </button>
            </div>
            {saved.length === 0 && (
              <div className="saved-empty">
                <span className="saved-empty-icon">
                  <Icon name="bookmark" size={40} />
                </span>
                <p>No saved ideas yet</p>
              </div>
            )}
          </>
        )}

        {view === "list" && (
          <>
            {folderIdeas.length > 0 && (
              <input
                className="ref-search saved-search"
                type="search"
                placeholder="Search projects & notes"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            )}
            {listIdeas.length === 0 ? (
              <div className="saved-empty">
                <p>{folderIdeas.length === 0 ? "No projects here yet." : "No matches."}</p>
              </div>
            ) : (
              <ul className="saved-list">
                {listIdeas.map((idea) => (
                  <li key={idea.id} className="saved-item">
                    <button
                      type="button"
                      className="saved-item-open"
                      onClick={() => { setOpenId(idea.id); setView("detail"); }}
                    >
                      <div className="saved-item-body">
                        <div className="saved-item-title">
                          <StatusDot status={idea.status} />
                          {ideaTitle(idea)}
                        </div>
                        <IdeaSummary idea={idea} />
                      </div>
                    </button>
                    <select
                      className="saved-item-folder-select"
                      value={idea.folderId || ""}
                      onChange={(e) => onMoveProject(idea.id, e.target.value || null)}
                    >
                      <option value="">No folder</option>
                      {folders.map((f) => (
                        <option key={f.id} value={f.id}>{f.name}</option>
                      ))}
                    </select>
                    <button
                      className="delete-btn"
                      aria-label="Delete saved idea"
                      onClick={() => onRemove(idea.id)}
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}

        {view === "detail" && openIdea && (
          <ProjectDetail
            idea={openIdea}
            folders={folders}
            onUpdateNotes={onUpdateNotes}
            onUpdateStatus={onUpdateStatus}
            onMoveProject={onMoveProject}
          />
        )}
      </div>
    </div>
  );
}
