// Renders a saved project's fields, notes, and photos into a single
// shareable image — a "spec sheet" you can take to the bench or send to a
// supplier. Built with plain Canvas 2D rather than a PDF/html2canvas
// dependency: the content is simple enough (a title, a field list, a
// paragraph, a few thumbnails) to lay out by hand, and it keeps the app
// free of an extra rendering library.
function wrapText(ctx, text, maxWidth) {
  const words = text.split(/\s+/);
  const lines = [];
  let line = "";
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(test).width > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function ideaFieldRows(idea) {
  if (idea.rows) return idea.rows.map((r) => ({ label: r.label, value: r.value, sub: null }));
  const rows = [];
  if (idea.type) rows.push({ label: "Piece", value: idea.type });
  if (idea.metal) rows.push({ label: "Metal", value: idea.metal });
  if (idea.gemstone) {
    rows.push({
      label: "Gemstone",
      value: idea.gemstone,
      sub: [idea.gemShape, idea.gemCut].filter(Boolean).join(" · "),
    });
  }
  if (idea.style) rows.push({ label: "Style", value: idea.style });
  if (idea.inspiration) rows.push({ label: "Inspiration", value: idea.inspiration });
  if (idea.setting) rows.push({ label: "Setting", value: idea.setting });
  return rows;
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function isImageFile(f) {
  return (f.mimeType || "").startsWith("image/") || /\.(png|jpe?g|gif|webp)$/i.test(f.filename || "");
}

export async function renderSpecSheetCanvas(idea, { title, folderName, statusLabel, projectFiles = [] } = {}) {
  const W = 1000;
  const PAD = 56;
  const contentW = W - PAD * 2;
  const THUMB = 180;

  const measure = document.createElement("canvas").getContext("2d");
  const fieldRows = ideaFieldRows(idea);
  const notesText = (idea.notes || "").trim();

  measure.font = "16px -apple-system, sans-serif";
  const notesLines = notesText ? wrapText(measure, notesText, contentW) : [];

  const imageFiles = projectFiles.filter(isImageFile);
  const otherFiles = projectFiles.filter((f) => !isImageFile(f));
  const thumbRows = imageFiles.length ? Math.ceil(imageFiles.length / 4) : 0;

  const rowHeight = (row) => (row.sub ? 76 : 56);

  let y = PAD;
  y += 56; // title
  y += 28; // subtitle
  y += 24; // gap to divider
  y += fieldRows.reduce((sum, row) => sum + rowHeight(row), 0);
  y += 24;
  if (notesLines.length) y += 28 + notesLines.length * 24 + 24;
  if (imageFiles.length) y += 28 + thumbRows * (THUMB + 28) + 12;
  if (otherFiles.length) y += 24;
  y += 40; // footer

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = Math.max(y, 400);
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  let cy = PAD;
  ctx.fillStyle = "#111111";
  ctx.font = "700 34px -apple-system, sans-serif";
  ctx.fillText(title || "Saved Project", PAD, cy + 34);
  cy += 56;

  const subtitleParts = [statusLabel, folderName].filter(Boolean);
  if (subtitleParts.length) {
    ctx.fillStyle = "#6b6b70";
    ctx.font = "500 16px -apple-system, sans-serif";
    ctx.fillText(subtitleParts.join("  ·  "), PAD, cy);
  }
  cy += 28;

  ctx.strokeStyle = "#e2e2e2";
  ctx.beginPath();
  ctx.moveTo(PAD, cy);
  ctx.lineTo(W - PAD, cy);
  ctx.stroke();
  cy += 24;

  for (const row of fieldRows) {
    ctx.fillStyle = "#8a8a90";
    ctx.font = "700 12px -apple-system, sans-serif";
    ctx.fillText(row.label.toUpperCase(), PAD, cy);
    ctx.fillStyle = "#111111";
    ctx.font = "600 22px -apple-system, sans-serif";
    ctx.fillText(row.value, PAD, cy + 26);
    if (row.sub) {
      ctx.fillStyle = "#6b6b70";
      ctx.font = "400 14px -apple-system, sans-serif";
      ctx.fillText(row.sub, PAD, cy + 46);
    }
    cy += rowHeight(row);
  }
  cy += 24;

  if (notesLines.length) {
    ctx.fillStyle = "#8a8a90";
    ctx.font = "700 12px -apple-system, sans-serif";
    ctx.fillText("NOTES", PAD, cy);
    cy += 24;
    ctx.fillStyle = "#222222";
    ctx.font = "16px -apple-system, sans-serif";
    for (const line of notesLines) {
      ctx.fillText(line, PAD, cy);
      cy += 24;
    }
    cy += 24;
  }

  if (imageFiles.length) {
    ctx.fillStyle = "#8a8a90";
    ctx.font = "700 12px -apple-system, sans-serif";
    ctx.fillText("PHOTOS", PAD, cy);
    cy += 28;
    let x = PAD;
    let col = 0;
    for (const file of imageFiles) {
      try {
        const img = await loadImage(file.url);
        const scale = Math.max(THUMB / img.width, THUMB / img.height);
        const sw = THUMB / scale;
        const sh = THUMB / scale;
        const sx = (img.width - sw) / 2;
        const sy = (img.height - sh) / 2;
        ctx.drawImage(img, sx, sy, sw, sh, x, cy, THUMB, THUMB);
      } catch {
        ctx.fillStyle = "#e2e2e2";
        ctx.fillRect(x, cy, THUMB, THUMB);
      }
      col++;
      x += THUMB + 20;
      if (col === 4) {
        col = 0;
        x = PAD;
        cy += THUMB + 28;
      }
    }
    if (col !== 0) cy += THUMB + 28;
    cy += 12;
  }

  if (otherFiles.length) {
    ctx.fillStyle = "#6b6b70";
    ctx.font = "italic 14px -apple-system, sans-serif";
    ctx.fillText(`Also attached: ${otherFiles.map((f) => f.filename).join(", ")}`, PAD, cy);
    cy += 24;
  }

  ctx.fillStyle = "#aaaaaa";
  ctx.font = "12px -apple-system, sans-serif";
  ctx.fillText(`Jewelry Ideator — ${new Date().toLocaleDateString()}`, PAD, canvas.height - 20);

  return canvas;
}

function slugFilename(title) {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "project";
}

export async function exportSpecSheet(idea, opts = {}) {
  const canvas = await renderSpecSheetCanvas(idea, opts);
  const filename = `${slugFilename(opts.title || "project")}-spec-sheet.png`;

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  return { filename };
}
