import Icon from "./Icon";

export default function SavedIdeas({ saved, onRemove, onClose }) {
  return (
    <div className="saved">
      <div className="saved-header">
        <h2>Saved Ideas</h2>
        {onClose && (
          <button className="text-btn" onClick={onClose}>Done</button>
        )}
      </div>

      {saved.length === 0 ? (
        <div className="saved-empty">
          <span className="saved-empty-icon">
            <Icon name="bookmark" size={40} />
          </span>
          <p>No saved ideas yet</p>
        </div>
      ) : (
        <ul className="saved-list">
          {saved.map((idea) => {
            if (idea.mode === "lapidary") {
              const rows = idea.rows || [];
              const title = rows[0]?.value || "Lapidary Idea";
              const meta = rows.slice(1);
              return (
                <li key={idea.id} className="saved-item">
                  <div className="saved-item-body">
                    <div className="saved-item-title">{title}</div>
                    {meta.map((r) => (
                      <div key={r.key} className="saved-item-meta">
                        {r.label}: {r.value}
                      </div>
                    ))}
                  </div>
                  <button
                    className="delete-btn"
                    aria-label="Delete saved idea"
                    onClick={() => onRemove(idea.id)}
                  >
                    ✕
                  </button>
                </li>
              );
            }
            const title =
              [idea.style, idea.type].filter(Boolean).join(" ") ||
              idea.gemstone ||
              idea.inspiration ||
              idea.metal ||
              idea.setting ||
              "Saved Idea";
            const gemLine = [idea.metal, idea.gemstone]
              .filter(Boolean)
              .join(" · ");
            const cutLine = [idea.gemShape, idea.gemCut]
              .filter(Boolean)
              .join(" ");
            return (
            <li key={idea.id} className="saved-item">
              <div className="saved-item-body">
                <div className="saved-item-title">{title}</div>
                {gemLine && <div className="saved-item-meta">{gemLine}</div>}
                {cutLine && <div className="saved-item-meta">{cutLine}</div>}
                {idea.setting && (
                  <div className="saved-item-sub">{idea.setting}</div>
                )}
                {idea.inspiration && (
                  <div className="saved-item-sub">{idea.inspiration}</div>
                )}
              </div>
              <button
                className="delete-btn"
                aria-label="Delete saved idea"
                onClick={() => onRemove(idea.id)}
              >
                ✕
              </button>
            </li>
          );
          })}
        </ul>
      )}
    </div>
  );
}
