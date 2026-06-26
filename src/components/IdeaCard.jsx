import { Fragment } from "react";

function Row({ icon, label, children }) {
  return (
    <div className="row">
      <span className="row-icon" aria-hidden="true">{icon}</span>
      <div className="row-body">
        <div className="row-label">{label}</div>
        {children}
      </div>
    </div>
  );
}

export default function IdeaCard({ idea, animating }) {
  // Build only the rows whose field is present, so dividers land correctly.
  const rows = [];

  if (idea.type) {
    rows.push(
      <Row key="type" icon="✨" label="Piece">
        <div className="row-value">{idea.type}</div>
      </Row>
    );
  }
  if (idea.metal) {
    rows.push(
      <Row key="metal" icon="⬡" label="Metal">
        <div className="row-value">{idea.metal}</div>
      </Row>
    );
  }
  if (idea.gemstone) {
    rows.push(
      <Row key="gemstone" icon={idea.gemCut === "Faceted" ? "💎" : "🔵"} label="Gemstone">
        <div className="row-value">{idea.gemstone}</div>
        <div className="row-sub">{idea.gemShape}  ·  {idea.gemCut}</div>
      </Row>
    );
  }
  if (idea.style) {
    rows.push(
      <Row key="style" icon="🎨" label="Style">
        <div className="row-value">{idea.style}</div>
      </Row>
    );
  }
  if (idea.inspiration) {
    rows.push(
      <Row key="inspiration" icon="🌙" label="Inspiration">
        <div className="row-value">{idea.inspiration}</div>
      </Row>
    );
  }
  if (idea.setting) {
    rows.push(
      <Row key="setting" icon="🔧" label="Setting">
        <div className="row-value">{idea.setting}</div>
      </Row>
    );
  }

  return (
    <div className={`card${animating ? " card--out" : ""}`}>
      <div className="card-accent" />

      {rows.length === 0 ? (
        <div className="card-empty">
          All fields are off — turn some on in ⚙️ Settings.
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
