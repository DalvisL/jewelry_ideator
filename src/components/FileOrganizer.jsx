import { useEffect, useMemo, useState } from "react";
import Icon from "./Icon";
import { getAllSharedFilesGrouped } from "../utils/curationDb";
import { getAllFiles as getAllProjectFiles } from "../utils/projectFilesDb";
import { getIdeaFieldValues } from "../utils/ideaFields";

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

// Unified browse view over both kinds of attachments: shared files (grouped
// by the material/technique term they're attached to, in curationDb.js) and
// each saved project's own folder. Uploading/deleting happens in the two
// natural homes for each — Curate for shared files, a project's own detail
// view for project files — this screen is purely a navigation hub into
// those, plus enough of a count summary to see what's where at a glance.
export default function FileOrganizer({ saved, onClose, onOpenTerm, onOpenProject }) {
  const [sharedGroups, setSharedGroups] = useState([]);
  const [projectFileCounts, setProjectFileCounts] = useState({});
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    Promise.all([getAllSharedFilesGrouped(), getAllProjectFiles()]).then(([groups, projectFiles]) => {
      setSharedGroups(groups);
      const counts = {};
      for (const f of projectFiles) counts[f.projectId] = (counts[f.projectId] || 0) + 1;
      setProjectFileCounts(counts);
      setLoaded(true);
    });
  }, []);

  const sharedTermSet = useMemo(() => new Set(sharedGroups.map((g) => g.term)), [sharedGroups]);

  function sharedCountFor(idea) {
    return getIdeaFieldValues(idea).filter((v) => sharedTermSet.has(v)).length;
  }

  return (
    <div className="saved">
      <div className="saved-header">
        <h2>Files</h2>
        <button type="button" className="text-btn" onClick={onClose}>Done</button>
      </div>

      {!loaded ? (
        <div className="saved-empty"><p>Loading…</p></div>
      ) : (
        <>
          <div className="ref-group">
            <div className="settings-group-label">Shared Files</div>
            {sharedGroups.length === 0 ? (
              <div className="files-empty-hint">No shared files yet — add some from Settings → Curate.</div>
            ) : (
              <ul className="ref-list">
                {sharedGroups.map((g) => (
                  <li key={g.term}>
                    <button type="button" className="ref-row" onClick={() => onOpenTerm(g.term)}>
                      <Icon name="folder" size={18} className="file-row-icon" />
                      <div className="ref-row-body">
                        <div className="ref-row-title">{g.term}</div>
                        <div className="ref-row-desc">
                          {g.files.length} file{g.files.length === 1 ? "" : "s"}
                        </div>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="ref-group">
            <div className="settings-group-label">Projects</div>
            {saved.length === 0 ? (
              <div className="files-empty-hint">No saved projects yet.</div>
            ) : (
              <ul className="ref-list">
                {saved.map((idea) => {
                  const own = projectFileCounts[idea.id] || 0;
                  const shared = sharedCountFor(idea);
                  return (
                    <li key={idea.id}>
                      <button type="button" className="ref-row" onClick={() => onOpenProject(idea.id)}>
                        <Icon name="folder" size={18} className="file-row-icon" />
                        <div className="ref-row-body">
                          <div className="ref-row-title">{ideaTitle(idea)}</div>
                          <div className="ref-row-desc">
                            {own === 0 && shared === 0
                              ? "No files"
                              : `${own} project file${own === 1 ? "" : "s"}${shared ? `, ${shared} shared` : ""}`}
                          </div>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}
