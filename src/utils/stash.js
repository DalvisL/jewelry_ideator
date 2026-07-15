// "I own this" tagging on top of curationDb's entries store — lets
// generation be biased toward materials actually on hand (see
// getBiasedGenerate in App.jsx) and lets the reference library be filtered
// down to just what you own.
import { getEntry, saveEntry } from "./curationDb";
import { categoryForTerm } from "./curationTerms";

export function stashTermsFrom(entries) {
  return new Set(entries.filter((e) => e.inStash).map((e) => e.term));
}

export async function setInStash(term, inStash) {
  const existing = await getEntry(term);
  const base = existing || {
    term,
    title: term,
    category: categoryForTerm(term) || "Gemstones & Minerals",
    description: null,
    extract: null,
    aliases: [term],
    skip: false,
  };
  const record = { ...base, inStash, updatedAt: new Date().toISOString() };
  await saveEntry(record);
  return record;
}
