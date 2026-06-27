import { useEffect, useState } from "react";
import {
  generate,
  FIELDS,
  DEFAULT_FIELDS,
  DEFAULT_DOUBLE_INSPIRATION_CHANCE,
} from "./data/jewelry";
import IdeaCard from "./components/IdeaCard";
import SavedIdeas from "./components/SavedIdeas";
import Icon from "./components/Icon";

const STORAGE_KEY = "jewelry-ideator.saved";
const SETTINGS_KEY = "jewelry-ideator.settings";

function loadSaved() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
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
      const fields = { ...DEFAULT_FIELDS, ...(s.fields || {}) };
      // Migrate the old single "includeSettings" flag → the setting field.
      if (s.fields == null && typeof s.includeSettings === "boolean") {
        fields.setting = s.includeSettings;
      }
      return {
        fields,
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
    fields: { ...DEFAULT_FIELDS },
    doubleInspirationChance: DEFAULT_DOUBLE_INSPIRATION_CHANCE,
  };
}

const initialSettings = loadSettings();

export default function App() {
  const [fields, setFields] = useState(initialSettings.fields);
  const [doubleInspirationChance, setDoubleInspirationChance] = useState(
    initialSettings.doubleInspirationChance
  );
  const [idea, setIdea] = useState(() =>
    generate({
      fields: initialSettings.fields,
      doubleInspirationChance: initialSettings.doubleInspirationChance,
    })
  );
  const [saved, setSaved] = useState(loadSaved);
  const [showSaved, setShowSaved] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [animating, setAnimating] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  // Persist saved ideas across sessions.
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
    } catch {
      // storage full / unavailable — ignore
    }
  }, [saved]);

  // Persist settings across sessions.
  useEffect(() => {
    try {
      localStorage.setItem(
        SETTINGS_KEY,
        JSON.stringify({ fields, doubleInspirationChance })
      );
    } catch {
      // ignore
    }
  }, [fields, doubleInspirationChance]);

  const isSaved = saved.some((s) => s.id === idea.id);

  // Pass explicit values so we don't read stale state right after a setState.
  function regenerate(
    nextFields = fields,
    nextChance = doubleInspirationChance
  ) {
    setAnimating(true);
    setTimeout(() => {
      setIdea(
        generate({ fields: nextFields, doubleInspirationChance: nextChance })
      );
      setJustSaved(false);
      setAnimating(false);
    }, 150);
  }

  function saveIdea() {
    if (isSaved) return;
    setSaved((prev) => [idea, ...prev]);
    setJustSaved(true);
  }

  function removeSaved(id) {
    setSaved((prev) => prev.filter((s) => s.id !== id));
  }

  function toggleField(key) {
    const next = { ...fields, [key]: !fields[key] };
    setFields(next);
    regenerate(next, doubleInspirationChance);
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
  }, [fields, doubleInspirationChance]);

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
          <p>Spark your next creation</p>
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
        <IdeaCard idea={idea} animating={animating} />
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
                <div className="settings-group-label">Fields</div>
                {FIELDS.map((f) => (
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
                      checked={!!fields[f.key]}
                      onChange={() => toggleField(f.key)}
                    />
                  </label>
                ))}

                <div className="settings-group-label">Inspiration</div>
                <div className="setting-row setting-row--stack">
                  <div className="setting-text">
                    <div className="setting-title">
                      Double inspiration chance
                      <span className="setting-value">{chancePct}%</span>
                    </div>
                    <div className="setting-desc">
                      {fields.inspiration
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
                    disabled={!fields.inspiration}
                    onChange={(e) =>
                      setDoubleInspirationChance(Number(e.target.value) / 100)
                    }
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {showSaved && (
        <div className="sheet-backdrop" onClick={() => setShowSaved(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <SavedIdeas
              saved={saved}
              onRemove={removeSaved}
              onClose={() => setShowSaved(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
