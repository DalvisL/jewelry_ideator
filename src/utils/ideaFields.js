// Pulls every field value out of a generated/saved idea, regardless of
// which mode produced it — jewelry mode is a flat object with named fields,
// every other mode (lapidary/carpentry/resin/metal/combo/mixed) carries a
// pre-built `rows` array instead. Field values are drawn straight from the
// same term pools curationTerms.js reads, so they double as the lookup key
// for shared files (see utils/sharedFiles.js) with no separate mapping.
export function getIdeaFieldValues(idea) {
  const values = new Set();
  function add(raw) {
    if (!raw) return;
    // A double-inspiration value like "Ocean Waves & Nebulae" is two terms
    // joined for display — split so each half can still match its own file.
    for (const part of String(raw).split(" & ")) {
      const trimmed = part.trim();
      if (trimmed) values.add(trimmed);
    }
  }

  if (idea.rows) {
    for (const r of idea.rows) add(r.value);
  } else {
    add(idea.type);
    add(idea.metal);
    add(idea.gemstone);
    add(idea.gemCut);
    add(idea.gemShape);
    add(idea.style);
    add(idea.inspiration);
    add(idea.setting);
  }
  return [...values];
}
