import { useEffect, useMemo, useRef, useState } from "react";
import Icon from "./Icon";
import FileList from "./FileList";
import { buildTermList, allCategories } from "../utils/curationTerms";
import {
  getAllEntries,
  saveEntry,
  deleteEntry,
  getPhotosForTerm,
  addPhoto,
  updatePhotoCaption,
  deletePhoto,
  getFilesForTerm,
  addFile,
  updateFileDescription,
  deleteFile,
} from "../utils/curationDb";

const terms = buildTermList();
const categories = allCategories();

export default function CurateLibrary({ initialTerm, onClose, onChanged }) {
  const [entries, setEntries] = useState({}); // term -> record
  const [loaded, setLoaded] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState("");
  const [search, setSearch] = useState("");
  const [curPos, setCurPos] = useState(0);

  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [extract, setExtract] = useState("");
  const [aliasesText, setAliasesText] = useState("");
  const [inStash, setInStash] = useState(false);
  const [status, setStatus] = useState("");
  const [photos, setPhotos] = useState([]); // [{id, caption, url}]

  const photoUrlsRef = useRef([]);

  useEffect(() => {
    getAllEntries().then((all) => {
      const map = Object.fromEntries(all.map((e) => [e.term, e]));
      setEntries(map);
      setLoaded(true);
    });
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return terms
      .map((_, i) => i)
      .filter((i) => !categoryFilter || terms[i].category === categoryFilter)
      .filter((i) => !q || terms[i].term.toLowerCase().includes(q));
  }, [categoryFilter, search]);

  // Pick a starting position once entries are loaded: the requested term if
  // given, else the first term with no saved record yet.
  useEffect(() => {
    if (!loaded) return;
    if (initialTerm) {
      const idx = filtered.findIndex((i) => terms[i].term === initialTerm);
      if (idx !== -1) {
        setCurPos(idx);
        return;
      }
    }
    const firstUnfinished = filtered.findIndex((i) => !entries[terms[i].term]);
    setCurPos(firstUnfinished === -1 ? 0 : firstUnfinished);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded]);

  useEffect(() => {
    if (curPos >= filtered.length) setCurPos(Math.max(0, filtered.length - 1));
  }, [filtered, curPos]);

  const info = filtered.length ? terms[filtered[curPos]] : null;
  const rec = info ? entries[info.term] : null;

  // Load form fields whenever the current term changes.
  useEffect(() => {
    setStatus("");
    if (!info) return;
    setTitle(rec?.title ?? info.term);
    setCategory(rec?.category ?? info.category);
    setDescription(rec?.description ?? "");
    setExtract(rec?.extract ?? "");
    setAliasesText((rec?.aliases ?? [info.term]).join(", "));
    setInStash(!!rec?.inStash);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [info?.term]);

  // Authoritative current photo list, read by the handlers below. Using a
  // ref instead of the `photos` state directly matters when several photos
  // are added in quick succession (e.g. a multi-file picker): each call is
  // an async function awaiting IndexedDB, and the `photos` state variable
  // captured in an earlier call's closure can still be stale by the time it
  // resolves. Reading/writing the ref keeps every add/remove building off
  // the truly-latest list rather than silently clobbering a prior addition.
  const photosRef = useRef([]);

  // Load this term's photos (async, from IndexedDB) whenever the term changes.
  useEffect(() => {
    photoUrlsRef.current.forEach((u) => URL.revokeObjectURL(u));
    photoUrlsRef.current = [];
    photosRef.current = [];
    setPhotos([]);
    if (!info) return;
    let cancelled = false;
    getPhotosForTerm(info.term).then((records) => {
      if (cancelled) return;
      const withUrls = records.map((r) => {
        const url = URL.createObjectURL(r.blob);
        photoUrlsRef.current.push(url);
        return { id: r.id, caption: r.caption, url };
      });
      photosRef.current = withUrls;
      setPhotos(withUrls);
    });
    return () => {
      cancelled = true;
    };
  }, [info?.term]);

  // Keeps the entries record's imageCount in step with the photos store the
  // instant a photo is added or removed — so an entry with just a picture
  // and no text shows up in the library right away, no separate Save needed.
  async function syncImageCount(term, count) {
    const base = entries[term] || {
      term,
      title: term,
      category: terms.find((t) => t.term === term)?.category || category,
      description: null,
      extract: null,
      aliases: [term],
      skip: false,
    };
    const record = { ...base, imageCount: count, updatedAt: new Date().toISOString() };
    await saveEntry(record);
    setEntries((prev) => ({ ...prev, [term]: record }));
    onChanged?.();
  }

  async function handleAddPhotoBlob(blob) {
    if (!info) return;
    const saved = await addPhoto(info.term, blob, "");
    const url = URL.createObjectURL(blob);
    photoUrlsRef.current.push(url);
    const next = [...photosRef.current, { id: saved.id, caption: "", url }];
    photosRef.current = next;
    setPhotos(next);
    await syncImageCount(info.term, next.length);
  }

  async function handleRemovePhoto(id) {
    const removed = photosRef.current.find((p) => p.id === id);
    if (removed) {
      URL.revokeObjectURL(removed.url);
      photoUrlsRef.current = photoUrlsRef.current.filter((u) => u !== removed.url);
    }
    const next = photosRef.current.filter((p) => p.id !== id);
    photosRef.current = next;
    setPhotos(next);
    await deletePhoto(id);
    if (info) await syncImageCount(info.term, next.length);
  }

  function handleCaptionChange(id, value) {
    const next = photosRef.current.map((p) => (p.id === id ? { ...p, caption: value } : p));
    photosRef.current = next;
    setPhotos(next);
  }
  async function handleCaptionBlur(id, value) {
    await updatePhotoCaption(id, value);
  }

  // ---- Shared files (any file type, e.g. faceting-diagram PDFs) ----
  // These persist on the term itself, so every saved project using this
  // term picks them up automatically (see utils/sharedFiles.js) — deleting
  // one here removes it everywhere it was showing up.
  const [files, setFiles] = useState([]); // [{id, filename, mimeType, description, size, url}]
  const filesRef = useRef([]);
  const fileUrlsRef = useRef([]);

  useEffect(() => {
    fileUrlsRef.current.forEach((u) => URL.revokeObjectURL(u));
    fileUrlsRef.current = [];
    filesRef.current = [];
    setFiles([]);
    if (!info) return;
    let cancelled = false;
    getFilesForTerm(info.term).then((records) => {
      if (cancelled) return;
      const withUrls = records.map((r) => {
        const url = URL.createObjectURL(r.blob);
        fileUrlsRef.current.push(url);
        return { id: r.id, filename: r.filename, description: r.description, size: r.blob.size, url };
      });
      filesRef.current = withUrls;
      setFiles(withUrls);
    });
    return () => {
      cancelled = true;
    };
  }, [info?.term]);

  async function handleAddFiles(pickedFiles) {
    if (!info) return;
    for (const file of pickedFiles) {
      const saved = await addFile(info.term, { filename: file.name, mimeType: file.type, blob: file });
      const url = URL.createObjectURL(file);
      fileUrlsRef.current.push(url);
      const next = [...filesRef.current, { id: saved.id, filename: file.name, description: "", size: file.size, url }];
      filesRef.current = next;
      setFiles(next);
    }
    setStatus(pickedFiles.length > 1 ? `${pickedFiles.length} files added.` : "File added.");
  }

  async function handleRemoveFile(id) {
    const removed = filesRef.current.find((f) => f.id === id);
    if (removed) {
      URL.revokeObjectURL(removed.url);
      fileUrlsRef.current = fileUrlsRef.current.filter((u) => u !== removed.url);
    }
    const next = filesRef.current.filter((f) => f.id !== id);
    filesRef.current = next;
    setFiles(next);
    await deleteFile(id);
  }

  function handleFileDescriptionInput(id, value) {
    const next = filesRef.current.map((f) => (f.id === id ? { ...f, description: value } : f));
    filesRef.current = next;
    setFiles(next);
  }
  async function handleFileDescriptionBlur(id, value) {
    await updateFileDescription(id, value);
  }

  // Paste an image straight from the clipboard while this screen is open.
  useEffect(() => {
    function onPaste(e) {
      const item = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith("image/"));
      if (!item) return;
      const file = item.getAsFile();
      if (!file) return;
      e.preventDefault();
      handleAddPhotoBlob(file).then(() => setStatus("Pasted photo added."));
    }
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  });

  async function fetchImageFromUrl(url) {
    if (!url) return;
    setStatus("Fetching…");
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      await handleAddPhotoBlob(blob);
      setStatus("Image fetched and added.");
    } catch {
      setStatus("Couldn't fetch that URL (often a CORS block) — try uploading or pasting instead.");
    }
  }

  async function persist(overrides = {}) {
    if (!info) return;
    const record = {
      term: info.term,
      title: title.trim() || info.term,
      category,
      description: description.trim() || null,
      extract: extract.trim() || null,
      aliases: aliasesText.split(",").map((s) => s.trim()).filter(Boolean),
      skip: false,
      updatedAt: new Date().toISOString(),
      imageCount: photosRef.current.length,
      inStash,
      ...overrides,
    };
    await saveEntry(record);
    setEntries((prev) => ({ ...prev, [info.term]: record }));
    onChanged?.();
    return record;
  }

  function goNextUnfinished() {
    for (let i = curPos + 1; i < filtered.length; i++) {
      if (!entries[terms[filtered[i]].term]) return setCurPos(i);
    }
    for (let i = 0; i < filtered.length; i++) {
      if (!entries[terms[filtered[i]].term]) return setCurPos(i);
    }
    if (curPos < filtered.length - 1) setCurPos(curPos + 1);
  }

  async function handleSaveNext() {
    await persist();
    goNextUnfinished();
  }
  async function handleSave() {
    await persist();
    setStatus("Saved.");
  }
  async function handleSkip() {
    await persist({ skip: true });
    goNextUnfinished();
  }
  async function handleClear() {
    if (!info) return;
    await deleteEntry(info.term);
    photoUrlsRef.current.forEach((u) => URL.revokeObjectURL(u));
    photoUrlsRef.current = [];
    setPhotos([]);
    fileUrlsRef.current.forEach((u) => URL.revokeObjectURL(u));
    fileUrlsRef.current = [];
    filesRef.current = [];
    setFiles([]);
    setEntries((prev) => {
      const next = { ...prev };
      delete next[info.term];
      return next;
    });
    onChanged?.();
  }

  useEffect(() => {
    function onKey(e) {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        handleSaveNext();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  });

  const done = Object.keys(entries).length;
  const total = terms.length;

  return (
    <div className="saved curate">
      <div className="saved-header">
        <h2>Curate Entries</h2>
        <button type="button" className="text-btn" onClick={onClose}>
          Done
        </button>
      </div>

      <div className="ref-progress-wrap">
        <div className="ref-progress">
          <div className="ref-progress-bar" style={{ width: `${(done / total) * 100}%` }} />
        </div>
        <div className="curate-progress-text">{done} / {total} entries</div>
      </div>

      <div className="curate-toolbar">
        <select
          className="curate-select"
          value={categoryFilter}
          onChange={(e) => { setCategoryFilter(e.target.value); setCurPos(0); }}
        >
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <input
          type="search"
          className="ref-search curate-search"
          placeholder="Search terms…"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setCurPos(0); }}
        />
      </div>

      {!info ? (
        <div className="saved-empty"><p>No terms match this filter.</p></div>
      ) : (
        <div className="curate-body">
          <div className="curate-term-row">
            <span className="curate-term">{info.term}</span>
            <span className="badge-cat">{info.category}</span>
          </div>

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

              <label className="curate-checkbox-row">
                <input type="checkbox" checked={inStash} onChange={(e) => setInStash(e.target.checked)} />
                <Icon name="stash" size={16} />
                I own this material
              </label>
            </div>

            <div className="curate-image-col">
              <label className="curate-label">Photos</label>
              <div className="curate-gallery">
                {photos.length === 0 && (
                  <div className="curate-gallery-empty">
                    <Icon name="image" size={24} className="curate-image-empty-icon" />
                    <span>No photos yet</span>
                  </div>
                )}
                {photos.map((p) => (
                  <div key={p.id} className="curate-photo-card">
                    <div className="curate-photo-thumb">
                      <img src={p.url} alt={p.caption || title} />
                      <button
                        type="button"
                        className="curate-photo-remove"
                        aria-label="Remove photo"
                        onClick={() => handleRemovePhoto(p.id)}
                      >
                        <Icon name="x" size={12} />
                      </button>
                    </div>
                    <input
                      className="curate-input curate-caption-input"
                      placeholder="Caption…"
                      value={p.caption}
                      onChange={(e) => handleCaptionChange(p.id, e.target.value)}
                      onBlur={(e) => handleCaptionBlur(p.id, e.target.value)}
                    />
                  </div>
                ))}
              </div>
              <div className="curate-image-actions">
                <label className="btn btn--secondary curate-file-btn">
                  Add photo(s)
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    style={{ display: "none" }}
                    onChange={async (e) => {
                      const files = [...e.target.files];
                      e.target.value = "";
                      for (const file of files) await handleAddPhotoBlob(file);
                      setStatus(files.length > 1 ? `${files.length} photos added.` : "Photo added.");
                    }}
                  />
                </label>
                <FetchUrlControl onFetch={fetchImageFromUrl} />
              </div>
            </div>
          </div>

          <div className="curate-shared-files">
            <label className="curate-label">Shared files (e.g. faceting diagrams — persist on every saved project using this term)</label>
            <FileList
              files={files}
              onAddFiles={handleAddFiles}
              onDeleteFile={handleRemoveFile}
              onDescriptionInput={handleFileDescriptionInput}
              onDescriptionBlur={handleFileDescriptionBlur}
              addLabel="Add file(s)"
              emptyLabel="No shared files yet"
            />
          </div>

          <div className="curate-actions">
            <button type="button" className="btn btn--primary" onClick={handleSaveNext}>
              Save &amp; Next unfinished
            </button>
            <button type="button" className="btn btn--secondary" onClick={handleSave}>
              Save
            </button>
            <button type="button" className="text-btn" onClick={handleSkip}>Skip</button>
            <button type="button" className="text-btn" onClick={handleClear}>Clear</button>
            {status && <span className="curate-status">{status}</span>}
          </div>
          <div className="curate-hint">
            Cmd/Ctrl+Enter = Save &amp; Next. Photos save immediately — paste one anywhere on this screen (Cmd/Ctrl+V) to add it.
          </div>

          <div className="curate-nav-row">
            <button type="button" className="text-btn" disabled={curPos === 0} onClick={() => setCurPos(curPos - 1)}>
              ← Prev
            </button>
            <span className="curate-pos">{curPos + 1} / {filtered.length}</span>
            <button
              type="button"
              className="text-btn"
              disabled={curPos >= filtered.length - 1}
              onClick={() => setCurPos(curPos + 1)}
            >
              Next →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function FetchUrlControl({ onFetch }) {
  const [url, setUrl] = useState("");
  return (
    <div className="curate-fetch-url">
      <input
        className="curate-input"
        type="text"
        placeholder="Or paste image URL…"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
      />
      <button type="button" className="btn btn--secondary" onClick={() => { onFetch(url); setUrl(""); }}>
        Fetch
      </button>
    </div>
  );
}
