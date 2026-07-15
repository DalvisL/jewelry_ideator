// The full universe of terms the reference library can cover, computed at
// runtime from the same pools the generator itself draws from — so the
// in-app curation screen always matches whatever's currently in data.js,
// with no separate build step to keep in sync. Mirrors the category
// grouping in scripts/build-manifest.mjs and scripts/curate-server.mjs.
import * as J from "../data/jewelry";

const CATEGORY_SPECS = [
  { category: "Jewelry Types", pools: [J.jewelryTypes] },
  { category: "Metals", pools: [J.metals, J.metalMetals] },
  {
    category: "Gemstones & Minerals",
    pools: [
      J.facetedGemstones, J.cabochonGemstones, J.accentStones, J.carvableStones,
      J.wildMaterials, J.wildMaterialsAll, J.allLapidaryStones,
    ],
  },
  {
    category: "Gem Cuts & Shapes",
    pools: [J.facetedShapes, J.cabochonShapes, J.sharedShapes, J.facetCuts, J.cabShapes],
  },
  { category: "Jewelry Settings", pools: [J.settings] },
  { category: "Styles", pools: [J.styles] },
  {
    category: "Lapidary Techniques",
    pools: [
      J.cabProjects, J.cabFinishes, J.facetProjects, J.facetDetails,
      J.carveProjects, J.carvingDetails, J.carvingSubjects, J.lapidaryForms, J.formFinishes,
      J.inlayProjects, J.inlayPatterns, J.beadProjects, J.beadSizes, J.beadFinishes,
    ],
  },
  { category: "Woods", pools: [J.carpentryWoods] },
  {
    category: "Woodworking Techniques",
    pools: [J.carpentryTechniques, J.carpentryFinishes, J.carpentryStains, J.carpentryProjects],
  },
  { category: "Metalworking Techniques", pools: [J.metalTechniques, J.metalFinishes, J.metalProjects] },
  {
    category: "Resin",
    pools: [J.resinTypes, J.resinProjects, J.resinColors, J.resinInclusions, J.resinFinishes],
  },
  { category: "Combo Projects", pools: [J.comboTemplates.map((t) => t.name), J.comboFinishes] },
  { category: "Inspirations", pools: [J.inspirations] },
];

export function buildTermList() {
  const termInfo = new Map();
  for (const spec of CATEGORY_SPECS) {
    for (const pool of spec.pools) {
      for (const term of pool) {
        if (!termInfo.has(term)) termInfo.set(term, spec.category);
      }
    }
  }
  return [...termInfo.entries()]
    .map(([term, category]) => ({ term, category }))
    .sort((a, b) =>
      a.category === b.category ? a.term.localeCompare(b.term) : a.category.localeCompare(b.category)
    );
}

export function allCategories() {
  return CATEGORY_SPECS.map((s) => s.category);
}

let termCategoryMap = null;
export function categoryForTerm(term) {
  if (!termCategoryMap) {
    termCategoryMap = new Map(buildTermList().map((t) => [t.term, t.category]));
  }
  return termCategoryMap.get(term) || null;
}

export function slugify(title) {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}
