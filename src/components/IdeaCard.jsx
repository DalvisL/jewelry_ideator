import { Fragment, useState } from "react";
import Icon from "./Icon";
import { ideaToText } from "../utils/ideaText";

function Row({ icon, label, rowKey, locked, locksEnabled, onToggleLock, children }) {
  return (
    <div className="row">
      <span className="row-icon">
        <Icon name={icon} size={20} />
      </span>
      <div className="row-body">
        <div className="row-label">{label}</div>
        {children}
      </div>
      {locksEnabled && (
        <button
          type="button"
          className={`row-lock${locked ? " row-lock--active" : ""}`}
          onClick={() => onToggleLock(rowKey)}
          aria-label={locked ? `Unlock ${label}` : `Lock ${label}`}
          aria-pressed={locked}
        >
          <Icon name={locked ? "lock" : "unlock"} size={16} />
        </button>
      )}
    </div>
  );
}

export default function IdeaCard({
  idea,
  animating,
  lockedFields,
  onToggleLock,
  locksEnabled = false,
}) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(ideaToText(idea));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API unavailable (e.g. insecure context) — silently ignore.
    }
  }

  function rowProps(key) {
    return {
      rowKey: key,
      locked: !!lockedFields?.has(key),
      locksEnabled,
      onToggleLock,
    };
  }

  // Build only the rows whose field is present, so dividers land correctly.
  const rows = [];

  if (idea.rows) {
    // Lapidary & carpentry (and mixed's sub-modes) carry a pre-built row list.
    (idea.rows || []).forEach((r) => {
      rows.push(
        <Row key={r.key} icon={r.icon} label={r.label} {...rowProps(r.key)}>
          <div className="row-value">{r.value}</div>
          {r.sub && <div className="row-sub">{r.sub}</div>}
        </Row>
      );
    });
  } else {
    if (idea.type) {
      rows.push(
        <Row key="type" icon="sparkles" label="Piece" {...rowProps("type")}>
          <div className="row-value">{idea.type}</div>
        </Row>
      );
    }
    if (idea.metal) {
      rows.push(
        <Row key="metal" icon="hexagon" label="Metal" {...rowProps("metal")}>
          <div className="row-value">{idea.metal}</div>
        </Row>
      );
    }
    if (idea.gemstone) {
      rows.push(
        <Row
          key="gemstone"
          icon={idea.gemCut === "Faceted" ? "gem" : "circle"}
          label="Gemstone"
          {...rowProps("gemstone")}
        >
          <div className="row-value">{idea.gemstone}</div>
          <div className="row-sub">{idea.gemShape}  ·  {idea.gemCut}</div>
        </Row>
      );
    }
    if (idea.style) {
      rows.push(
        <Row key="style" icon="palette" label="Style" {...rowProps("style")}>
          <div className="row-value">{idea.style}</div>
        </Row>
      );
    }
    if (idea.inspiration) {
      rows.push(
        <Row
          key="inspiration"
          icon="moon"
          label="Inspiration"
          {...rowProps("inspiration")}
        >
          <div className="row-value">{idea.inspiration}</div>
        </Row>
      );
    }
    if (idea.setting) {
      rows.push(
        <Row key="setting" icon="wrench" label="Setting" {...rowProps("setting")}>
          <div className="row-value">{idea.setting}</div>
        </Row>
      );
    }
  }

  return (
    <div className={`card${animating ? " card--out" : ""}`}>
      <div className="card-toolbar">
        <button
          type="button"
          className={`card-copy-btn${copied ? " card-copy-btn--copied" : ""}`}
          onClick={handleCopy}
          aria-label="Copy idea to clipboard"
        >
          <Icon name={copied ? "check" : "copy"} size={16} />
        </button>
      </div>
      <div className="card-accent" />

      {rows.length === 0 ? (
        <div className="card-empty">
          All fields are off — turn some on in Settings.
        </div>
      ) : (
        rows.map((row, i) => (
          <Fragment key={row.key}>
            {i > 0 && <div className="divider" />}
            {row}
          </Fragment>
        ))
      )}
    </div>
  );
}
