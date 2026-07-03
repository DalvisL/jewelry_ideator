// Serializes an idea (either row-based — lapidary/carpentry/mixed — or the
// flat jewelry shape) into plain text for the clipboard.
export function ideaToText(idea) {
  if (idea.rows) {
    const rows = idea.rows;
    const title = rows[0]?.value || "Idea";
    const lines = rows
      .slice(1)
      .map((r) => `${r.label}: ${r.value}${r.sub ? ` (${r.sub})` : ""}`);
    return [title, ...lines].join("\n");
  }

  const lines = [];
  if (idea.type) lines.push(idea.type);
  if (idea.metal) lines.push(`Metal: ${idea.metal}`);
  if (idea.gemstone) {
    const cut = [idea.gemShape, idea.gemCut].filter(Boolean).join(" ");
    lines.push(`Gemstone: ${idea.gemstone}${cut ? ` (${cut})` : ""}`);
  }
  if (idea.style) lines.push(`Style: ${idea.style}`);
  if (idea.inspiration) lines.push(`Inspiration: ${idea.inspiration}`);
  if (idea.setting) lines.push(`Setting: ${idea.setting}`);
  return lines.join("\n");
}
