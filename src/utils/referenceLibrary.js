// Fetches the curated term -> Wikipedia-title manifest (shipped with the
// app, precached by the service worker) and, on demand, downloads each
// article's summary text + lead image from Wikipedia's live REST API,
// storing them in IndexedDB (see referenceDb.js) for offline reading.
import { putArticle } from "./referenceDb";

const summaryUrl = (title) =>
  `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(
    title.replace(/ /g, "_")
  )}`;

let manifestPromise = null;
export function fetchManifest() {
  if (!manifestPromise) {
    manifestPromise = fetch("./reference-manifest.json").then((res) => {
      if (!res.ok) throw new Error("Failed to load reference manifest");
      return res.json();
    });
  }
  return manifestPromise;
}

// Builds a lookup from every known alias (and the canonical title itself,
// lowercased) to its manifest entry, so an idea's exact field value — e.g.
// "Sleeping Beauty Turquoise" — can be matched back to its article.
export function buildAliasIndex(manifest) {
  const index = new Map();
  for (const entry of manifest) {
    index.set(entry.title.toLowerCase(), entry);
    for (const alias of entry.aliases || []) {
      index.set(alias.toLowerCase(), entry);
    }
  }
  return index;
}

async function downloadOne(entry) {
  const res = await fetch(summaryUrl(entry.title));
  if (!res.ok) throw new Error(`summary fetch failed for ${entry.title}`);
  const data = await res.json();

  let thumbnail = null;
  if (data.thumbnail?.source) {
    try {
      const imgRes = await fetch(data.thumbnail.source);
      if (imgRes.ok) thumbnail = await imgRes.blob();
    } catch {
      // Image fetch failed — keep the text, skip the image.
    }
  }

  await putArticle({
    pageid: entry.pageid,
    title: entry.title,
    category: entry.category,
    description: entry.description,
    extract: data.extract || "",
    thumbnail,
    pageUrl: data.content_urls?.desktop?.page || null,
    downloadedAt: Date.now(),
  });
}

export async function downloadLibrary(
  manifest,
  { concurrency = 4, onProgress, skipPageIds = new Set() } = {}
) {
  const todo = manifest.filter((e) => !skipPageIds.has(e.pageid));
  let done = 0;
  let failed = 0;
  let cursor = 0;

  async function worker() {
    while (cursor < todo.length) {
      const entry = todo[cursor++];
      try {
        await downloadOne(entry);
      } catch {
        failed++;
      }
      done++;
      onProgress?.({ done, total: todo.length, failed });
    }
  }

  await Promise.all(Array.from({ length: concurrency }, worker));
  return { done, failed, total: todo.length };
}
