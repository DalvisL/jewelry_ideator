import { useEffect, useRef, useState } from "react";
import Icon from "./Icon";
import { allCategories, categoryForTerm } from "../utils/curationTerms";
import { saveEntry, addPhoto } from "../utils/curationDb";

// A fast, single-purpose "add this one term" form — opened straight from a
// generated idea's row when it has no matching reference entry yet. Deliberately
// lighter than the full Curate screen (no term-list navigation); "Open full
// editor" is the escape hatch for anyone who wants photos-with-captions,
// shared files, etc.
export default function QuickAddEntryModal({ term, onClose, onSaved, onOpenFullEditor }) {
  const categories = allCategories();
  const [title, setTitle] = useState(term);
  const [category, setCategory] = useState(categoryForTerm(term) || categories[0]);
  const [description, setDescription] = useState("");
  const [extract, setExtract] = useState("");
  const [aliasesText, setAliasesText] = useState(term);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  const pendingBlob = useRef(null);
  const objectUrlRef = useRef(null);

  useEffect(() => {
    return () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    };
  }, []);

  function setPendingBlob(blob) {
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    pendingBlob.current = blob;
    const url = URL.createObjectURL(blob);
    objectUrlRef.current = url;
    setPreviewUrl(url);
  }

  useEffect(() => {
    function onPaste(e) {
      const item = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith("image/"));
      if (!item) return;
      const file = item.getAsFile();
      if (!file) return;
      e.preventDefault();
      setPendingBlob(file);
      setStatus("Pasted image ready.");
    }
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  });

  async function handleSave() {
    setBusy(true);
    setStatus("Saving…");
    try {
      let imageCount = 0;
      if (pendingBlob.current) {
        await addPhoto(term, pendingBlob.current, "");
        imageCount = 1;
      }
      const record = {
        term,
        title: title.trim() || term,
        category,
        description: description.trim() || null,
        extract: extract.trim() || null,
        aliases: aliasesText.split(",").map((s) => s.trim()).filter(Boolean),
        skip: false,
        imageCount,
        updatedAt: new Date().toISOString(),
      };
      await saveEntry(record);
      onSaved?.(record);
      onClose();
    } catch (e) {
      setStatus(e.message || "Couldn't save.");
      setBusy(false);
    }
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="saved curate">
          <div className="saved-header">
            <h2>Add "{term}"</h2>
            <button type="button" className="text-btn" onClick={onClose}>Cancel</button>
          </div>

          <div className="curate-body">
            <div className="curate-layout">
              <div className="curate-fields">
                <label className="curate-label">Title</label>
                <input className="curate-input" value={title} onChange={(e) => setTitle(e.target.value)} />

                <label className="curate-label">Category</label>
                <select className="curate-input" value={category} onChange={(e) => setCategory(e.target.value)}>
                  {categories.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>

                <label className="curate-label">Description (one line)</label>
                <input
                  className="curate-input"
                  placeholder="Short one-liner"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />

                <label className="curate-label">Extract (a paragraph)</label>
                <textarea
                  className="curate-input curate-textarea"
                  placeholder="A few sentences of body text"
                  value={extract}
                  onChange={(e) => setExtract(e.target.value)}
                />

                <label className="curate-label">Aliases (comma-separated)</label>
                <input
                  className="curate-input"
                  value={aliasesText}
                  onChange={(e) => setAliasesText(e.target.value)}
                />
              </div>

              <div className="curate-image-col">
                <label className="curate-label">Photo</label>
                <div className="curate-image-preview">
                  {previewUrl ? (
                    <img src={previewUrl} alt={title} />
                  ) : (
                    <Icon name="image" size={28} className="curate-image-empty-icon" />
                  )}
                </div>
                <div className="curate-image-actions">
                  <label className="btn btn--secondary curate-file-btn">
                    Upload photo
                    <input
                      type="file"
                      accept="image/*"
                      style={{ display: "none" }}
                      onChange={(e) => {
                        const file = e.target.files[0];
                        if (file) { setPendingBlob(file); setStatus("Photo ready."); }
                      }}
                    />
                  </label>
                </div>
              </div>
            </div>

            <div className="curate-actions">
              <button type="button" className="btn btn--primary" onClick={handleSave} disabled={busy}>
                Save entry
              </button>
              <button
                type="button"
                className="text-btn"
                onClick={() => {
                  onClose();
                  onOpenFullEditor?.(term);
                }}
              >
                Open full editor
              </button>
              {status && <span className="curate-status">{status}</span>}
            </div>
            <div className="curate-hint">Paste an image anywhere on this screen (Cmd/Ctrl+V) to attach it.</div>
          </div>
        </div>
      </div>
    </div>
  );
}
