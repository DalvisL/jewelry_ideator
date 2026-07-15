import { getIdeaFieldValues } from "./ideaFields";
import { getFilesForTerm } from "./curationDb";

// Every shared file attached to any of this idea's field values (e.g. its
// gemstone, its cut, its inspiration) — these are the files that persist
// across every saved project using that term, per the term-keyed store in
// curationDb.js.
export async function getSharedFilesForIdea(idea) {
  const terms = getIdeaFieldValues(idea);
  const results = await Promise.all(
    terms.map(async (term) => (await getFilesForTerm(term)).map((f) => ({ ...f, term })))
  );
  return results.flat();
}
