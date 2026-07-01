import { useEffect, useState } from "react";
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
import Icon from "./components/Icon";

const STORAGE_KEY = "jewelry-ideator.saved";
const SETTINGS_KEY = "jewelry-ideator.settings";
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

export default function App() {
  const [mode, setMode] = useState(initialSettings.mode);
  const [wild, setWild] = useState(initialSettings.wild);
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
  const [showSaved, setShowSaved] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [animating, setAnimating] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

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

  // Persist settings across sessions.
  useEffect(() => {
    try {
      localStorage.setItem(
        SETTINGS_KEY,
        JSON.stringify({
          mode,
          wild,
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
    nextChance = doubleInspirationChance
  ) {
    setAnimating(true);
    setTimeout(() => {
      setIdea(
        generate({
          mode: nextMode,
          fields: nextFields,
          wild: nextWild,
          doubleInspirationChance: nextChance,
        })
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
    const next = { ...activeFields, [key]: !activeFields[key] };
    if (mode === "lapidary") setLapidaryFields(next);
    else if (mode === "carpentry") setCarpentryFields(next);
    else setJewelryFields(next);
    regenerate(mode, next, wild, doubleInspirationChance);
  }

  function switchMode(nextMode) {
    if (nextMode === mode) return;
    setMode(nextMode);
    const nextFields = fieldsForMode(
      nextMode,
      jewelryFields,
      lapidaryFields,
      carpentryFields
    );
    regenerate(nextMode, nextFields, wild, doubleInspirationChance);
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
  }, [mode, wild, jewelryFields, lapidaryFields, carpentryFields, doubleInspirationChance]);

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
