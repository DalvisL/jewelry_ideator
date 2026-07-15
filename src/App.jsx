import { useEffect, useMemo, useState } from "react";
import {
  generate,
  FIELDS,
  DEFAULT_FIELDS,
  LAPIDARY_FIELDS,
  DEFAULT_LAPIDARY_FIELDS,
  CARPENTRY_FIELDS,
  DEFAULT_CARPENTRY_FIELDS,
  DEFAULT_DOUBLE_INSPIRATION_CHANCE,
} from "./data/jewelry";
import IdeaCard from "./components/IdeaCard";
import SavedIdeas from "./components/SavedIdeas";
import ReferenceLibrary from "./components/ReferenceLibrary";
import CurateLibrary from "./components/CurateLibrary";
import QuickAddEntryModal from "./components/QuickAddEntryModal";
import LocalBackup from "./components/LocalBackup";
import FileOrganizer from "./components/FileOrganizer";
import Icon from "./components/Icon";
import { fetchManifest, buildAliasIndex, downloadLibrary } from "./utils/referenceLibrary";
import { getDownloadedPageIds, clearArticles } from "./utils/referenceDb";
import { getAllEntries } from "./utils/curationDb";
import { deleteFilesForProject } from "./utils/projectFilesDb";
import { stashTermsFrom } from "./utils/stash";
import { getIdeaFieldValues } from "./utils/ideaFields";

const STORAGE_KEY = "jewelry-ideator.saved";
const SETTINGS_KEY = "jewelry-ideator.settings";
const FOLDERS_KEY = "jewelry-ideator.folders";
const MODES = ["jewelry", "lapidary", "carpentry", "mixed"];

const MODE_META = {
  jewelry: { icon: "gem", label: "Jewelry", subtitle: "Spark your next creation" },
  lapidary: { icon: "hexagon", label: "Lapidary", subtitle: "Your next stone project" },
  carpentry: { icon: "wrench", label: "Carpentry", subtitle: "Your next wood project" },
  mixed: { icon: "sparkles", label: "Mixed", subtitle: "A little of everything" },
};

function loadSaved() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function loadFolders() {
  try {
    const raw = localStorage.getItem(FOLDERS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) {
      const s = JSON.parse(raw);
      const jewelryFields = {
        ...DEFAULT_FIELDS,
        ...(s.jewelryFields || s.fields || {}),
      };
      // Migrate the oldest single "includeSettings" flag → the setting field.
      if (
        s.jewelryFields == null &&
        s.fields == null &&
        typeof s.includeSettings === "boolean"
      ) {
        jewelryFields.setting = s.includeSettings;
      }
      return {
        mode: MODES.includes(s.mode) ? s.mode : "jewelry",
        wild: !!s.wild,
        preferStash: !!s.preferStash,
        jewelryFields,
        lapidaryFields: { ...DEFAULT_LAPIDARY_FIELDS, ...(s.lapidaryFields || {}) },
        carpentryFields: {
          ...DEFAULT_CARPENTRY_FIELDS,
          ...(s.carpentryFields || {}),
        },
        doubleInspirationChance:
          typeof s.doubleInspirationChance === "number"
            ? s.doubleInspirationChance
            : DEFAULT_DOUBLE_INSPIRATION_CHANCE,
      };
    }
  } catch {
    // ignore
  }
  return {
    mode: "jewelry",
    wild: false,
    preferStash: false,
    jewelryFields: { ...DEFAULT_FIELDS },
    lapidaryFields: { ...DEFAULT_LAPIDARY_FIELDS },
    carpentryFields: { ...DEFAULT_CARPENTRY_FIELDS },
    doubleInspirationChance: DEFAULT_DOUBLE_INSPIRATION_CHANCE,
  };
}

const initialSettings = loadSettings();

function fieldsForMode(mode, jewelry, lapidary, carpentry) {
  if (mode === "lapidary") return lapidary;
  if (mode === "carpentry") return carpentry;
  if (mode === "jewelry") return jewelry;
  return null; // mixed uses per-branch defaults
}

// Carries locked fields' values from the previous idea onto a freshly
// generated one. Only applies when both ideas actually have that field —
// e.g. a field the user just toggled off, or a mixed-mode branch switch,
// is left alone rather than resurrecting stale data.
function applyLocks(newIdea, oldIdea, lockedKeys) {
  if (!oldIdea || !lockedKeys || lockedKeys.size === 0) return newIdea;

  if (newIdea.rows) {
    if (!oldIdea.rows) return newIdea;
    const oldByKey = Object.fromEntries(oldIdea.rows.map((r) => [r.key, r]));
    const rows = newIdea.rows.map((r) =>
      lockedKeys.has(r.key) && oldByKey[r.key] ? oldByKey[r.key] : r
    );
    return { ...newIdea, rows };
  }

  const merged = { ...newIdea };
  for (const key of lockedKeys) {
    if (key === "gemstone") {
      if (newIdea.gemstone == null || oldIdea.gemstone == null) continue;
      merged.gemstone = oldIdea.gemstone;
      merged.gemCut = oldIdea.gemCut;
      merged.gemShape = oldIdea.gemShape;
    } else if (newIdea[key] != null && oldIdea[key] != null) {
      merged[key] = oldIdea[key];
    }
  }
  return merged;
}

export default function App() {
  const [mode, setMode] = useState(initialSettings.mode);
  const [wild, setWild] = useState(initialSettings.wild);
  const [preferStash, setPreferStash] = useState(initialSettings.preferStash);
  const [jewelryFields, setJewelryFields] = useState(
    initialSettings.jewelryFields
  );
  const [lapidaryFields, setLapidaryFields] = useState(
    initialSettings.lapidaryFields
  );
  const [carpentryFields, setCarpentryFields] = useState(
    initialSettings.carpentryFields
  );
  const [doubleInspirationChance, setDoubleInspirationChance] = useState(
    initialSettings.doubleInspirationChance
  );
  const [idea, setIdea] = useState(() =>
    generate({
      mode: initialSettings.mode,
      fields: fieldsForMode(
        initialSettings.mode,
        initialSettings.jewelryFields,
        initialSettings.lapidaryFields,
        initialSettings.carpentryFields
      ),
      wild: initialSettings.wild,
      doubleInspirationChance: initialSettings.doubleInspirationChance,
    })
  );
  const [saved, setSaved] = useState(loadSaved);
  const [folders, setFolders] = useState(loadFolders);
  const [showSaved, setShowSaved] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [animating, setAnimating] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  // Fields locked by the user — "New Idea" keeps their current value and
  // only rerolls the rest. Cleared on mode switch since row keys/shapes
  // differ across modes (and mixed changes branch every generation).
  const [lockedFields, setLockedFields] = useState(() => new Set());

  // Offline Wikipedia reference library (materials & techniques), plus
  // anything hand-curated on-device on top of it (stored in IndexedDB, see
  // utils/curationDb.js) — used for the "I own this" stash and in-app entry
  // editing, layered onto the downloaded Wikipedia data rather than
  // replacing it.
  const [referenceManifest, setReferenceManifest] = useState([]);
  const [aliasIndex, setAliasIndex] = useState(() => new Map());
  const [downloadedIds, setDownloadedIds] = useState(() => new Set());
  const [downloadProgress, setDownloadProgress] = useState(null);
  const [downloading, setDownloading] = useState(false);
  const [showReference, setShowReference] = useState(false);
  const [referenceOpenPageId, setReferenceOpenPageId] = useState(null);
  const [localEntries, setLocalEntries] = useState([]);
  const [showCurate, setShowCurate] = useState(false);
  const [curateInitialTerm, setCurateInitialTerm] = useState(null);
  const [quickAddTerm, setQuickAddTerm] = useState(null);
  const [showFiles, setShowFiles] = useState(false);
  const [savedInitialOpenId, setSavedInitialOpenId] = useState(null);

  const stashTerms = useMemo(() => stashTermsFrom(localEntries), [localEntries]);

  // Re-rolls up to a few times and keeps whichever candidate touches the
  // most stash terms — cheaper and far less invasive than threading a
  // weighted-pick bias through every pool draw across every generator mode.
  function generateBiased(params) {
    const generated = generate(params);
    if (!preferStash || stashTerms.size === 0) return generated;
    let best = generated;
    let bestScore = getIdeaFieldValues(generated).filter((v) => stashTerms.has(v)).length;
    for (let i = 0; bestScore === 0 && i < 7; i++) {
      const candidate = generate(params);
      const score = getIdeaFieldValues(candidate).filter((v) => stashTerms.has(v)).length;
      if (score > bestScore) {
        best = candidate;
        bestScore = score;
      }
    }
    return best;
  }

  useEffect(() => {
    fetchManifest()
      .then((m) => {
        setReferenceManifest(m);
        setAliasIndex(buildAliasIndex(m));
      })
      .catch(() => {
        // Manifest unavailable (e.g. first load with no connection at all,
        // before the service worker has cached it) — reference features
        // just stay empty/hidden.
      });
    getDownloadedPageIds().then(setDownloadedIds);
    refreshLocalEntries();
  }, []);

  function refreshLocalEntries() {
    getAllEntries()
      .then(setLocalEntries)
      .catch(() => {
        // IndexedDB unavailable — in-app curation just stays empty/hidden.
      });
  }

  function openReference(pageid) {
    setReferenceOpenPageId(pageid);
    setShowReference(true);
  }

  function startReferenceDownload() {
    if (downloading || referenceManifest.length === 0) return;
    setDownloading(true);
    setDownloadProgress({ done: 0, total: referenceManifest.length, failed: 0 });
    downloadLibrary(referenceManifest, {
      skipPageIds: downloadedIds,
      onProgress: setDownloadProgress,
    }).then(async () => {
      setDownloadedIds(await getDownloadedPageIds());
      setDownloading(false);
    });
  }

  function clearReferenceDownloads() {
    clearArticles().then(() => setDownloadedIds(new Set()));
  }

  function openCurate(term = null) {
    setCurateInitialTerm(term);
    setShowCurate(true);
  }

  function openSavedProject(id) {
    setSavedInitialOpenId(id);
    setShowFiles(false);
    setShowSaved(true);
  }

  function openTermFromFiles(term) {
    setShowFiles(false);
    openCurate(term);
  }

  function openQuickAdd(term) {
    setQuickAddTerm(term);
  }

  const activeFields = fieldsForMode(
    mode,
    jewelryFields,
    lapidaryFields,
    carpentryFields
  );
  const activeFieldConfig =
    mode === "lapidary"
      ? LAPIDARY_FIELDS
      : mode === "carpentry"
      ? CARPENTRY_FIELDS
      : mode === "jewelry"
      ? FIELDS
      : null;
  const wildApplies = mode !== "carpentry";
  const inspirationOn = mode === "mixed" ? true : !!activeFields?.inspiration;

  // Persist saved ideas across sessions.
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
    } catch {
      // storage full / unavailable — ignore
    }
  }, [saved]);

  // Persist folders across sessions.
  useEffect(() => {
    try {
      localStorage.setItem(FOLDERS_KEY, JSON.stringify(folders));
    } catch {
      // storage full / unavailable — ignore
    }
  }, [folders]);

  // Persist settings across sessions.
  useEffect(() => {
    try {
      localStorage.setItem(
        SETTINGS_KEY,
        JSON.stringify({
          mode,
          wild,
          preferStash,
          jewelryFields,
          lapidaryFields,
          carpentryFields,
          doubleInspirationChance,
        })
      );
    } catch {
      // ignore
    }
  }, [
    mode,
    wild,
    preferStash,
    jewelryFields,
    lapidaryFields,
    carpentryFields,
    doubleInspirationChance,
  ]);

  const isSaved = saved.some((s) => s.id === idea.id);

  // Pass explicit values so we don't read stale state right after a setState.
  function regenerate(
    nextMode = mode,
    nextFields = activeFields,
    nextWild = wild,
    nextChance = doubleInspirationChance,
    nextLocked = lockedFields
  ) {
    setAnimating(true);
    const prevIdea = idea;
    setTimeout(() => {
      const generated = generateBiased({
        mode: nextMode,
        fields: nextFields,
        wild: nextWild,
        doubleInspirationChance: nextChance,
      });
      setIdea(applyLocks(generated, prevIdea, nextLocked));
      setJustSaved(false);
      setAnimating(false);
    }, 150);
  }

  function toggleLock(key) {
    setLockedFields((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function saveIdea() {
    if (isSaved) return;
    setSaved((prev) => [idea, ...prev]);
    setJustSaved(true);
  }

  function removeSaved(id) {
    setSaved((prev) => prev.filter((s) => s.id !== id));
    deleteFilesForProject(id).catch(() => {
      // IndexedDB unavailable — nothing to clean up either way.
    });
  }

  function updateIdeaNotes(id, notes) {
    setSaved((prev) => prev.map((s) => (s.id === id ? { ...s, notes } : s)));
  }

  function updateIdeaStatus(id, status) {
    setSaved((prev) => prev.map((s) => (s.id === id ? { ...s, status } : s)));
  }

  function createFolder(name) {
    setFolders((prev) => [...prev, { id: crypto.randomUUID(), name, createdAt: new Date().toISOString() }]);
  }

  function renameFolder(id, name) {
    setFolders((prev) => prev.map((f) => (f.id === id ? { ...f, name } : f)));
  }

  // Deleting a folder never deletes the projects inside it — they just
  // become unfiled, same as Apple Notes leaving notes behind when their
  // folder is removed.
  function deleteFolder(id) {
    setFolders((prev) => prev.filter((f) => f.id !== id));
    setSaved((prev) => prev.map((s) => (s.folderId === id ? { ...s, folderId: null } : s)));
  }

  function moveIdeaToFolder(id, folderId) {
    setSaved((prev) => prev.map((s) => (s.id === id ? { ...s, folderId } : s)));
  }

  function toggleField(key) {
    const next = { ...activeFields, [key]: !activeFields[key] };
    if (mode === "lapidary") setLapidaryFields(next);
    else if (mode === "carpentry") setCarpentryFields(next);
    else setJewelryFields(next);
    regenerate(mode, next, wild, doubleInspirationChance);
  }

  function switchMode(nextMode) {
    if (nextMode === mode) return;
    setMode(nextMode);
    setLockedFields(new Set());
    const nextFields = fieldsForMode(
      nextMode,
      jewelryFields,
      lapidaryFields,
      carpentryFields
    );
    regenerate(nextMode, nextFields, wild, doubleInspirationChance, new Set());
  }

  function toggleWild() {
    const next = !wild;
    setWild(next);
    regenerate(mode, activeFields, next, doubleInspirationChance);
  }

  // Spacebar = New Idea (desktop nicety, mirrors the macOS shortcut).
  useEffect(() => {
    function onKey(e) {
      if (
        e.code === "Space" &&
        !["INPUT", "TEXTAREA", "BUTTON"].includes(e.target.tagName)
      ) {
        e.preventDefault();
        regenerate();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    mode,
    wild,
    jewelryFields,
    lapidaryFields,
    carpentryFields,
    doubleInspirationChance,
    lockedFields,
    idea,
  ]);

  const chancePct = Math.round(doubleInspirationChance * 100);

  return (
    <div className="app">
      <header className="topbar">
        <button
          className="icon-btn"
          onClick={() => setShowSettings(true)}
          title="Settings"
          aria-label="Settings"
        >
          <Icon name="settings" size={22} />
        </button>

        <div className="title-block">
          <h1>Jewelry Ideator</h1>
          <p>{MODE_META[mode].subtitle}</p>
        </div>

        <button
          className="icon-btn badge-wrap"
          onClick={() => setShowSaved(true)}
          title="Saved ideas"
          aria-label="Saved ideas"
        >
          <Icon name="bookmark" size={22} />
          {saved.length > 0 && <span className="badge">{saved.length}</span>}
        </button>
      </header>

      <main className="content">
        <IdeaCard
          idea={idea}
          animating={animating}
          lockedFields={lockedFields}
          onToggleLock={toggleLock}
          locksEnabled={mode !== "mixed"}
          aliasIndex={aliasIndex}
          onOpenReference={openReference}
          onQuickAdd={openQuickAdd}
        />
      </main>

      <footer className="actionbar">
        <button
          className="btn btn--secondary"
          onClick={saveIdea}
          disabled={justSaved || isSaved}
        >
          <Icon name={justSaved || isSaved ? "check" : "bookmark"} size={18} />
          {justSaved || isSaved ? "Saved" : "Save Idea"}
        </button>
        <button className="btn btn--primary" onClick={() => regenerate()}>
          <Icon name="dices" size={18} />
          New Idea
        </button>
      </footer>

      {showSettings && (
        <div className="sheet-backdrop" onClick={() => setShowSettings(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="saved">
              <div className="saved-header">
                <h2>Settings</h2>
                <button
                  className="text-btn"
                  onClick={() => setShowSettings(false)}
                >
                  Done
                </button>
              </div>

              <div className="settings-body">
                <div className="settings-group-label">Mode</div>
                <div className="segmented" role="tablist">
                  {MODES.map((mKey) => (
                    <button
                      key={mKey}
                      className={`seg${mode === mKey ? " seg--active" : ""}`}
                      onClick={() => switchMode(mKey)}
                    >
                      <Icon name={MODE_META[mKey].icon} size={16} />
                      {MODE_META[mKey].label}
                    </button>
                  ))}
                </div>
                <div className="settings-mode-desc">
                  {mode === "lapidary"
                    ? "Stone-only projects: cabbing, faceting, carving, inlay, beads and finished forms."
                    : mode === "carpentry"
                    ? "Small woodworking: rings, boxes, carvings and turned pieces."
                    : mode === "mixed"
                    ? "A random discipline across every mode — plus resin, metal and cross-material combo projects unique to Mixed."
                    : "Full jewelry pieces: metal, gemstone, style and setting."}
                </div>

                {wildApplies && (
                  <>
                    <div className="settings-group-label">Materials</div>
                    <label className="setting-row">
                      <div className="setting-text">
                        <div className="field-title">
                          <span className="field-icon">
                            <Icon name="sparkles" size={18} />
                          </span>
                          Wild materials
                        </div>
                        <div className="setting-desc">
                          Opens up ~1000 common rocks &amp; minerals — granite,
                          basalt, marble, quartz variants and more.
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        className="switch"
                        checked={wild}
                        onChange={toggleWild}
                      />
                    </label>
                  </>
                )}

                {stashTerms.size > 0 && (
                  <>
                    <div className="settings-group-label">My Stash</div>
                    <label className="setting-row">
                      <div className="setting-text">
                        <div className="field-title">
                          <span className="field-icon">
                            <Icon name="stash" size={18} />
                          </span>
                          Prefer my stash
                        </div>
                        <div className="setting-desc">
                          Favor materials you've marked as owned ({stashTerms.size}) when generating.
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        className="switch"
                        checked={preferStash}
                        onChange={(e) => setPreferStash(e.target.checked)}
                      />
                    </label>
                  </>
                )}

                {activeFieldConfig ? (
                  <>
                    <div className="settings-group-label">Fields</div>
                    {activeFieldConfig.map((f) => (
                      <label className="setting-row" key={f.key}>
                        <div className="setting-text">
                          <div className="field-title">
                            <span className="field-icon">
                              <Icon name={f.icon} size={18} />
                            </span>
                            {f.label}
                          </div>
                        </div>
                        <input
                          type="checkbox"
                          className="switch"
                          checked={!!activeFields[f.key]}
                          onChange={() => toggleField(f.key)}
                        />
                      </label>
                    ))}
                  </>
                ) : (
                  <>
                    <div className="settings-group-label">Fields</div>
                    <div className="settings-mode-desc">
                      Mixed mode uses each discipline&apos;s full set of fields
                      automatically.
                    </div>
                  </>
                )}

                <div className="settings-group-label">Inspiration</div>
                <div className="setting-row setting-row--stack">
                  <div className="setting-text">
                    <div className="setting-title">
                      Double inspiration chance
                      <span className="setting-value">{chancePct}%</span>
                    </div>
                    <div className="setting-desc">
                      {inspirationOn
                        ? "How often an idea combines two inspirations. Applies to the next idea."
                        : "Turn the Inspiration field on to use this."}
                    </div>
                  </div>
                  <input
                    type="range"
                    className="slider"
                    min="0"
                    max="100"
                    step="1"
                    value={chancePct}
                    disabled={!inspirationOn}
                    onChange={(e) =>
                      setDoubleInspirationChance(Number(e.target.value) / 100)
                    }
                  />
                </div>

                <div className="settings-group-label">Offline Reference</div>
                <div className="setting-row setting-row--stack">
                  <div className="setting-text">
                    <div className="setting-title">
                      Materials &amp; techniques
                      <span className="setting-value">
                        {downloadedIds.size}/{referenceManifest.length || "…"}
                      </span>
                    </div>
                    <div className="setting-desc">
                      Downloads real Wikipedia summaries + a photo for every
                      gemstone, metal, wood and technique the generator can
                      roll, so you can read up on them with no signal. Curate
                      lets you hand-edit or add your own entries and photos.
                    </div>
                  </div>
                  {downloading && downloadProgress && (
                    <div className="ref-progress">
                      <div
                        className="ref-progress-bar"
                        style={{
                          width: `${Math.round(
                            (downloadProgress.done / downloadProgress.total) * 100
                          )}%`,
                        }}
                      />
                    </div>
                  )}
                  <div className="ref-settings-actions">
                    <button
                      type="button"
                      className="btn btn--secondary ref-settings-btn"
                      onClick={() => openReference(null)}
                      disabled={referenceManifest.length === 0}
                    >
                      <Icon name="book" size={16} />
                      Browse
                    </button>
                    <button
                      type="button"
                      className="btn btn--secondary ref-settings-btn"
                      onClick={() => openCurate(null)}
                    >
                      <Icon name="pencil" size={16} />
                      Curate
                    </button>
                    <button
                      type="button"
                      className="btn btn--primary ref-settings-btn"
                      onClick={startReferenceDownload}
                      disabled={
                        downloading ||
                        referenceManifest.length === 0 ||
                        downloadedIds.size === referenceManifest.length
                      }
                    >
                      <Icon name="download" size={16} />
                      {downloading
                        ? `${downloadProgress?.done ?? 0}/${downloadProgress?.total ?? 0}`
                        : downloadedIds.size === referenceManifest.length &&
                          referenceManifest.length > 0
                        ? "All downloaded"
                        : "Download"}
                    </button>
                  </div>
                  {downloadedIds.size > 0 && !downloading && (
                    <button
                      type="button"
                      className="text-btn ref-clear-btn"
                      onClick={clearReferenceDownloads}
                    >
                      <Icon name="trash" size={14} />
                      Clear downloaded articles
                    </button>
                  )}
                </div>

                <div className="settings-group-label">Files</div>
                <div className="setting-row setting-row--stack">
                  <div className="setting-text">
                    <div className="setting-title">Project &amp; shared files</div>
                    <div className="setting-desc">
                      Attach files to a saved project, or to a material/technique so
                      it shows up on every project that uses it — like a faceting
                      diagram that follows every Step Cut gemstone you generate.
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn btn--secondary ref-settings-btn"
                    onClick={() => setShowFiles(true)}
                  >
                    <Icon name="folder" size={16} />
                    Browse
                  </button>
                </div>

                <div className="settings-group-label">Backup</div>
                <LocalBackup />
              </div>
            </div>
          </div>
        </div>
      )}

      {showReference && (
        <div
          className="sheet-backdrop"
          onClick={() => {
            setShowReference(false);
            setReferenceOpenPageId(null);
          }}
        >
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <ReferenceLibrary
              manifest={referenceManifest}
              downloadedIds={downloadedIds}
              initialPageId={referenceOpenPageId}
              stashTerms={stashTerms}
              onClose={() => {
                setShowReference(false);
                setReferenceOpenPageId(null);
              }}
              onEdit={(term) => {
                setShowReference(false);
                setReferenceOpenPageId(null);
                openCurate(term);
              }}
              onEntriesChanged={refreshLocalEntries}
            />
          </div>
        </div>
      )}

      {showCurate && (
        <div className="sheet-backdrop" onClick={() => setShowCurate(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <CurateLibrary
              initialTerm={curateInitialTerm}
              onChanged={refreshLocalEntries}
              onClose={() => setShowCurate(false)}
            />
          </div>
        </div>
      )}

      {quickAddTerm && (
        <QuickAddEntryModal
          term={quickAddTerm}
          onClose={() => setQuickAddTerm(null)}
          onSaved={refreshLocalEntries}
          onOpenFullEditor={openCurate}
        />
      )}

      {showFiles && (
        <div className="sheet-backdrop" onClick={() => setShowFiles(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <FileOrganizer
              saved={saved}
              onClose={() => setShowFiles(false)}
              onOpenTerm={openTermFromFiles}
              onOpenProject={openSavedProject}
            />
          </div>
        </div>
      )}

      {showSaved && (
        <SavedIdeas
          saved={saved}
          folders={folders}
          onRemove={removeSaved}
          onUpdateNotes={updateIdeaNotes}
          onUpdateStatus={updateIdeaStatus}
          onCreateFolder={createFolder}
          onRenameFolder={renameFolder}
          onDeleteFolder={deleteFolder}
          onMoveProject={moveIdeaToFolder}
          initialOpenId={savedInitialOpenId}
          onClose={() => {
            setShowSaved(false);
            setSavedInitialOpenId(null);
          }}
        />
      )}
    </div>
  );
}
