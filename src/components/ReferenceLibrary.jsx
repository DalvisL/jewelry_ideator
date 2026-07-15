import { useEffect, useMemo, useState } from "react";
import Icon from "./Icon";
import { getArticle } from "../utils/referenceDb";
import { getPhotosForTerm } from "../utils/curationDb";
import { setInStash } from "../utils/stash";

// Photos hand-curated in-app (see CurateLibrary/QuickAddEntryModal), keyed
// by the entry's title — layered on top of the downloaded Wikipedia
// summary/thumbnail below rather than replacing it.
function CuratedGallery({ term }) {
  const [photos, setPhotos] = useState([]);

  useEffect(() => {
    setPhotos([]);
    if (!term) return;
    let cancelled = false;
    let urls = [];
    getPhotosForTerm(term).then((records) => {
      if (cancelled) return;
      urls = records.map((r) => ({ id: r.id, caption: r.caption, src: URL.createObjectURL(r.blob) }));
      setPhotos(urls);
    });
    return () => {
      cancelled = true;
      urls.forEach((p) => URL.revokeObjectURL(p.src));
    };
  }, [term]);

  if (photos.length === 0) return null;
  return (
    <div className="ref-gallery">
      {photos.map((p) => (
        <figure key={p.id} className="ref-gallery-item">
          <img className="ref-detail-img" src={p.src} alt={p.caption || term} />
          {p.caption && <figcaption className="ref-gallery-caption">{p.caption}</figcaption>}
        </figure>
      ))}
    </div>
  );
}

function ArticleDetail({ entry, onBack, onEdit, onToggleStash }) {
  const [article, setArticle] = useState(null);
  const [loading, setLoading] = useState(true);
  const [imgUrl, setImgUrl] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setArticle(null);
    getArticle(entry.pageid).then((a) => {
      if (!cancelled) {
        setArticle(a);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [entry.pageid]);

  useEffect(() => {
    if (article?.thumbnail) {
      const url = URL.createObjectURL(article.thumbnail);
      setImgUrl(url);
      return () => URL.revokeObjectURL(url);
    }
    setImgUrl(null);
  }, [article]);

  return (
    <div className="ref-detail">
      <div className="ref-detail-topbar">
        <button type="button" className="text-btn ref-back" onClick={onBack}>
          <Icon name="chevronLeft" size={18} />
          Back
        </button>
        <div className="ref-detail-topbar-actions">
          <button
            type="button"
            className={`text-btn stash-toggle${entry.inStash ? " stash-toggle--on" : ""}`}
            onClick={() => onToggleStash(entry)}
          >
            <Icon name="stash" size={16} />
            {entry.inStash ? "In stash" : "I own this"}
          </button>
          {onEdit && (
            <button type="button" className="text-btn" onClick={() => onEdit(entry.title)}>
              <Icon name="pencil" size={16} />
              Edit
            </button>
          )}
        </div>
      </div>
      <h3 className="ref-detail-title">{entry.title}</h3>
      {entry.description && (
        <p className="ref-detail-desc">{entry.description}</p>
      )}

      <CuratedGallery term={entry.title} />

      {loading && <div className="ref-empty">Loading…</div>}

      {!loading && !article && (
        <div className="ref-empty">
          Not downloaded yet. Connect to the internet and download the
          reference library from Settings.
        </div>
      )}

      {article && (
        <>
          {imgUrl && (
            <img className="ref-detail-img" src={imgUrl} alt={entry.title} />
          )}
          <p className="ref-detail-extract">{article.extract}</p>
          {article.pageUrl && (
            <a
              className="ref-detail-link"
              href={article.pageUrl}
              target="_blank"
              rel="noreferrer"
            >
              <Icon name="externalLink" size={14} />
              View on Wikipedia
            </a>
          )}
        </>
      )}
    </div>
  );
}

export default function ReferenceLibrary({
  manifest,
  downloadedIds,
  initialPageId,
  stashTerms,
  onClose,
  onEdit,
  onEntriesChanged,
}) {
  const [detailEntry, setDetailEntry] = useState(null);
  const [query, setQuery] = useState("");
  const [stashOnly, setStashOnly] = useState(false);

  useEffect(() => {
    if (initialPageId == null) return;
    const entry = manifest.find((e) => e.pageid === initialPageId);
    if (entry) setDetailEntry(entry);
  }, [initialPageId, manifest]);

  async function handleToggleStash(entry) {
    const record = await setInStash(entry.title, !entry.inStash);
    setDetailEntry((prev) => (prev ? { ...prev, inStash: record.inStash } : prev));
    onEntriesChanged?.();
  }

  // Overlay each manifest entry with whether its term is in the on-device
  // stash — the manifest/download data itself never changes for this.
  const annotated = useMemo(
    () => manifest.map((e) => ({ ...e, inStash: stashTerms?.has(e.title) || false })),
    [manifest, stashTerms]
  );

  const grouped = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = annotated
      .filter((e) => !stashOnly || e.inStash)
      .filter(
        (e) =>
          !q ||
          e.title.toLowerCase().includes(q) ||
          (e.aliases || []).some((a) => a.toLowerCase().includes(q))
      );
    const map = new Map();
    for (const entry of filtered) {
      if (!map.has(entry.category)) map.set(entry.category, []);
      map.get(entry.category).push(entry);
    }
    return [...map.entries()];
  }, [annotated, query, stashOnly]);

  return (
    <div className="saved">
      <div className="saved-header">
        <h2>Reference Library</h2>
        {onClose && (
          <button type="button" className="text-btn" onClick={onClose}>
            Done
          </button>
        )}
      </div>

      {detailEntry ? (
        <ArticleDetail
          entry={detailEntry}
          onBack={() => setDetailEntry(null)}
          onEdit={onEdit}
          onToggleStash={handleToggleStash}
        />
      ) : (
        <>
          <div className="ref-search-wrap">
            <input
              className="ref-search"
              type="search"
              placeholder="Search materials & techniques"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <label className="ref-stash-filter">
              <input type="checkbox" checked={stashOnly} onChange={(e) => setStashOnly(e.target.checked)} />
              <Icon name="stash" size={14} />
              Only show what I own
            </label>
          </div>

          {grouped.length === 0 && (
            <div className="saved-empty">
              <p>No matches</p>
            </div>
          )}

          {grouped.map(([category, entries]) => (
            <div key={category} className="ref-group">
              <div className="settings-group-label">{category}</div>
              <ul className="ref-list">
                {entries.map((entry) => {
                  const isDownloaded = downloadedIds.has(entry.pageid);
                  return (
                    <li key={entry.pageid}>
                      <button
                        type="button"
                        className="ref-row"
                        onClick={() => setDetailEntry(entry)}
                      >
                        <div className="ref-row-body">
                          <div className="ref-row-title">
                            {entry.title}
                            {entry.inStash && <Icon name="stash" size={13} className="ref-row-stash-badge" />}
                          </div>
                          {entry.description && (
                            <div className="ref-row-desc">
                              {entry.description}
                            </div>
                          )}
                        </div>
                        <Icon
                          name={isDownloaded ? "download" : "cloudOff"}
                          size={16}
                          className={
                            isDownloaded ? "ref-row-icon--on" : "ref-row-icon--off"
                          }
                        />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
