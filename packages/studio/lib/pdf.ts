import { PDFDocument, StandardFonts, rgb, degrees, PageSizes, type PDFPage } from "pdf-lib";
import JSZip from "jszip";
import { marked } from "marked";

export type StagedFile = { name: string; bytes: Uint8Array; type: string };
export type RunOptions = {
  text?: string; range?: string; rotate?: 90 | 180 | 270; nup?: 2 | 4;
  pageSize?: "Letter" | "A4"; title?: string; author?: string; subject?: string;
  keywords?: string; password?: string;
};
export type RunResult = { files: { name: string; bytes: Uint8Array; mime: string }[]; note?: string };

function parseRanges(spec: string, pageCount: number): number[] {
  const out = new Set<number>();
  for (const part of spec.split(",").map((s) => s.trim()).filter(Boolean)) {
    if (part.includes("-")) {
      const [a, b] = part.split("-").map((n) => parseInt(n.trim(), 10));
      if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
      const start = Math.max(1, Math.min(a, b));
      const end = Math.min(pageCount, Math.max(a, b));
      for (let i = start; i <= end; i++) out.add(i - 1);
    } else {
      const n = parseInt(part, 10);
      if (Number.isFinite(n) && n >= 1 && n <= pageCount) out.add(n - 1);
    }
  }
  return [...out].sort((a, b) => a - b);
}

async function loadPdf(bytes: Uint8Array, password?: string) {
  return PDFDocument.load(bytes, { ignoreEncryption: !password, updateMetadata: false });
}
function downloadName(original: string, suffix: string) {
  return `${(original.replace(/\.[^.]+$/, "") || "document")}-${suffix}.pdf`;
}

async function typesetHtml(html: string, title = "Document"): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.TimesRoman);
  const bold = await doc.embedFont(StandardFonts.TimesRomanBold);
  const italic = await doc.embedFont(StandardFonts.TimesRomanItalic);
  const pageSize = PageSizes.Letter;
  const margin = 64;
  let page = doc.addPage(pageSize);
  let y = pageSize[1] - margin;
  const width = pageSize[0] - margin * 2;
  let textContent = html.replace(/<script[\s\S]*?<\/script>/gi, "");
  const tmp = globalThis.document?.createElement?.("div");
  if (tmp) { tmp.innerHTML = textContent; textContent = tmp.innerText || tmp.textContent || ""; }
  else {
    textContent = textContent.replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ").replace(/&/g, "&").replace(/</g, "<").replace(/>/g, ">");
  }
  const paragraphs = textContent.split(/\n+/).map((p) => p.trim()).filter(Boolean);
  const drawWrapped = (text: string, size: number, face = font, color = rgb(0.1, 0.09, 0.08)) => {
    const words = text.split(/\s+/);
    let line = "";
    const flush = (l: string) => {
      if (!l) return;
      if (y < margin + size) { page = doc.addPage(pageSize); y = pageSize[1] - margin; }
      page.drawText(l, { x: margin, y, size, font: face, color });
      y -= size + 4;
    };
    for (const w of words) {
      const next = line ? `${line} ${w}` : w;
      if (face.widthOfTextAtSize(next, size) > width) { flush(line); line = w; } else line = next;
    }
    flush(line); y -= 6;
  };
  page.drawText(title.slice(0, 80), { x: margin, y, size: 18, font: bold, color: rgb(0.12, 0.18, 0.16) });
  y -= 28;
  for (const p of paragraphs) {
    if (/^#{1,3}\s/.test(p)) drawWrapped(p.replace(/^#{1,3}\s/, ""), 14, bold);
    else if (/^\*\s/.test(p)) drawWrapped("\u2022 " + p.replace(/^\*\s/, ""), 11, font);
    else if (/^_.+_ $/.test(p)) drawWrapped(p.replace(/_/g, ""), 11, italic);
    else drawWrapped(p, 11);
  }
  doc.setTitle(title); doc.setCreator("Quire"); doc.setProducer("Quire");
  return doc.save();
}

export async function executeTool(slug: string, files: StagedFile[], opts: RunOptions = {}): Promise<RunResult> {
  if (!files.length && slug !== "text-pdf") throw new Error("Add a file first.");
  if (slug === "merge") {
    const out = await PDFDocument.create();
    for (const f of files) {
      const src = await loadPdf(f.bytes);
      (await out.copyPages(src, src.getPageIndices())).forEach((p) => out.addPage(p));
    }
    return { files: [{ name: "merged.pdf", bytes: await out.save(), mime: "application/pdf" }] };
  }
  if (slug === "images-pdf") {
    const out = await PDFDocument.create();
    for (const f of files) {
      const isPng = f.type.includes("png") || f.name.toLowerCase().endsWith(".png");
      const img = isPng ? await out.embedPng(f.bytes) : await out.embedJpg(f.bytes);
      const page = out.addPage([img.width, img.height]);
      page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
    }
    return { files: [{ name: "images.pdf", bytes: await out.save(), mime: "application/pdf" }] };
  }
  if (slug === "text-pdf") {
    const text = opts.text || new TextDecoder().decode(files[0]?.bytes || new Uint8Array());
    const bytes = await typesetHtml(text.replace(/</g, "<").replace(/\n/g, "<br/>"), files[0]?.name || "Text");
    return { files: [{ name: downloadName(files[0]?.name || "text", "pdf"), bytes, mime: "application/pdf" }] };
  }
  if (slug === "markdown-pdf") {
    const html = await marked.parse(new TextDecoder().decode(files[0].bytes));
    const bytes = await typesetHtml(String(html), files[0].name);
    return { files: [{ name: downloadName(files[0].name, "pdf"), bytes, mime: "application/pdf" }] };
  }
  if (slug === "html-pdf") {
    const bytes = await typesetHtml(new TextDecoder().decode(files[0].bytes), files[0].name);
    return { files: [{ name: downloadName(files[0].name, "pdf"), bytes, mime: "application/pdf" }] };
  }
  if (slug === "docx-pdf") {
    const mammoth = await import("mammoth");
    const { value } = await mammoth.convertToHtml({ arrayBuffer: files[0].bytes.buffer as ArrayBuffer });
    const bytes = await typesetHtml(value, files[0].name);
    return { files: [{ name: downloadName(files[0].name, "pdf"), bytes, mime: "application/pdf" }] };
  }
  if (slug === "epub-pdf") {
    const zip = await JSZip.loadAsync(files[0].bytes);
    const names = Object.keys(zip.files);
    const opfPath = names.find((n) => n.endsWith(".opf"));
    let html = "";
    if (opfPath) {
      const opf = await zip.file(opfPath)!.async("string");
      const hrefs = [...opf.matchAll(/href="([^"]+\.(?:xhtml|html|htm))"/gi)].map((m) => m[1]);
      const base = opfPath.split("/").slice(0, -1).join("/");
      for (const href of hrefs) {
        const path = (base ? `${base}/` : "") + href.replace(/^\.\//, "");
        const file = zip.file(path) || zip.file(href);
        if (file) html += (await file.async("string")) + "\n";
      }
    }
    if (!html) {
      for (const n of names.filter((n) => /\.(xhtml|html|htm)$/i.test(n))) html += (await zip.file(n)!.async("string")) + "\n";
    }
    if (!html) throw new Error("Could not find HTML documents inside this EPUB.");
    const bytes = await typesetHtml(html, files[0].name.replace(/\.epub$/i, ""));
    return { files: [{ name: downloadName(files[0].name, "pdf"), bytes, mime: "application/pdf" }] };
  }
  const src = await loadPdf(files[0].bytes, opts.password);
  const count = src.getPageCount();
  if (slug === "info") {
    const pages = src.getPages();
    const meta = {
      pages: count, title: src.getTitle() || "", author: src.getAuthor() || "",
      subject: src.getSubject() || "", creator: src.getCreator() || "", producer: src.getProducer() || "",
      sizes: pages.slice(0, 12).map((p, i) => { const { width, height } = p.getSize(); return `#${i + 1} ${Math.round(width)}x${Math.round(height)}`; }),
    };
    const bytes = await typesetHtml(`<pre>${JSON.stringify(meta, null, 2)}</pre>`, "PDF info");
    return { files: [{ name: downloadName(files[0].name, "info"), bytes, mime: "application/pdf" }], note: `${count} pages` };
  }
  const assemble = async (indices: number[], each?: (page: PDFPage, i: number) => void) => {
    const out = await PDFDocument.create();
    const copied = await out.copyPages(src, indices);
    copied.forEach((p, i) => { each?.(p, indices[i]); out.addPage(p); });
    if (opts.title) out.setTitle(opts.title);
    if (opts.author) out.setAuthor(opts.author);
    out.setProducer("Quire"); out.setCreator("Quire");
    return out.save();
  };
  if (slug === "split") {
    const ranges = opts.range ? parseRanges(opts.range, count) : src.getPageIndices();
    if (opts.range && ranges.length) return { files: [{ name: downloadName(files[0].name, "split"), bytes: await assemble(ranges), mime: "application/pdf" }] };
    const outFiles = [];
    for (let i = 0; i < count; i++) outFiles.push({ name: downloadName(files[0].name, `p${i + 1}`), bytes: await assemble([i]), mime: "application/pdf" });
    return { files: outFiles, note: `Split into ${count} files.` };
  }
  if (slug === "extract") {
    const idx = parseRanges(opts.range || "1", count);
    if (!idx.length) throw new Error("Give a page range to keep.");
    return { files: [{ name: downloadName(files[0].name, "extract"), bytes: await assemble(idx), mime: "application/pdf" }] };
  }
  if (slug === "delete-pages") {
    const drop = new Set(parseRanges(opts.range || "", count));
    const keep = src.getPageIndices().filter((i) => !drop.has(i));
    if (!keep.length) throw new Error("That would delete every page.");
    return { files: [{ name: downloadName(files[0].name, "trimmed"), bytes: await assemble(keep), mime: "application/pdf" }] };
  }
  if (slug === "rotate") {
    const angle = opts.rotate ?? 90;
    return { files: [{ name: downloadName(files[0].name, `rot${angle}`), bytes: await assemble(src.getPageIndices(), (p) => p.setRotation(degrees((p.getRotation().angle + angle) % 360))), mime: "application/pdf" }] };
  }
  if (slug === "reorder") {
    return { files: [{ name: downloadName(files[0].name, "reversed"), bytes: await assemble(src.getPageIndices().reverse()), mime: "application/pdf" }] };
  }
  if (slug === "compress") {
    const bytes = await assemble(src.getPageIndices());
    return { files: [{ name: downloadName(files[0].name, "compressed"), bytes, mime: "application/pdf" }], note: `Rewritten \u00b7 ${bytes.byteLength} bytes` };
  }
  if (slug === "watermark") {
    const text = (opts.text || "CONFIDENTIAL").slice(0, 80);
    const out = await PDFDocument.create();
    const font = await out.embedFont(StandardFonts.HelveticaBold);
    for (const p of await out.copyPages(src, src.getPageIndices())) {
      const { width, height } = p.getSize();
      p.drawText(text, { x: width * 0.18, y: height * 0.45, size: Math.min(48, width / Math.max(8, text.length * 0.55)), font, color: rgb(0.72, 0.18, 0.16), opacity: 0.22, rotate: degrees(32) });
      out.addPage(p);
    }
    return { files: [{ name: downloadName(files[0].name, "watermark"), bytes: await out.save(), mime: "application/pdf" }] };
  }
  if (slug === "page-numbers") {
    const out = await PDFDocument.create();
    const font = await out.embedFont(StandardFonts.TimesRoman);
    const pages = await out.copyPages(src, src.getPageIndices());
    pages.forEach((p, i) => {
      const { width } = p.getSize();
      const label = `${i + 1}  /  ${pages.length}`;
      p.drawText(label, { x: width / 2 - font.widthOfTextAtSize(label, 9) / 2, y: 28, size: 9, font, color: rgb(0.35, 0.32, 0.28) });
      out.addPage(p);
    });
    return { files: [{ name: downloadName(files[0].name, "numbered"), bytes: await out.save(), mime: "application/pdf" }] };
  }
  if (slug === "metadata") {
    if (opts.title) src.setTitle(opts.title);
    if (opts.author) src.setAuthor(opts.author);
    if (opts.subject) src.setSubject(opts.subject);
    if (opts.keywords) src.setKeywords(opts.keywords.split(",").map((s) => s.trim()));
    src.setProducer("Quire");
    return { files: [{ name: downloadName(files[0].name, "meta"), bytes: await src.save(), mime: "application/pdf" }] };
  }
  if (slug === "protect") {
    if (!opts.password) throw new Error("Set a password.");
    const bytes = await src.save({ userPassword: opts.password, ownerPassword: opts.password } as Parameters<typeof src.save>[0]);
    return { files: [{ name: downloadName(files[0].name, "protected"), bytes, mime: "application/pdf" }] };
  }
  if (slug === "unlock") {
    const bytes = await assemble(src.getPageIndices());
    return { files: [{ name: downloadName(files[0].name, "unlocked"), bytes, mime: "application/pdf" }] };
  }
  if (slug === "blank") {
    const out = await PDFDocument.create();
    for (const p of await out.copyPages(src, src.getPageIndices())) {
      out.addPage(p);
      const { width, height } = p.getSize();
      out.addPage([width, height]);
    }
    return { files: [{ name: downloadName(files[0].name, "blanks"), bytes: await out.save(), mime: "application/pdf" }] };
  }
  if (slug === "flatten-size") {
    const target = opts.pageSize === "A4" ? PageSizes.A4 : PageSizes.Letter;
    const out = await PDFDocument.create();
    for (const p of await out.copyPages(src, src.getPageIndices())) {
      const { width, height } = p.getSize();
      const scale = Math.min(target[0] / width, target[1] / height);
      const embedded = await out.embedPage(p);
      const sheet = out.addPage(target);
      sheet.drawPage(embedded, { x: (target[0] - width * scale) / 2, y: (target[1] - height * scale) / 2, xScale: scale, yScale: scale });
    }
    return { files: [{ name: downloadName(files[0].name, opts.pageSize || "Letter"), bytes: await out.save(), mime: "application/pdf" }] };
  }
  if (slug === "n-up") {
    const n = opts.nup ?? 2;
    const out = await PDFDocument.create();
    const pages = await out.copyPages(src, src.getPageIndices());
    const cols = 2; const rows = n === 4 ? 2 : 1;
    const sheetSize = PageSizes.Letter;
    for (let i = 0; i < pages.length; i += n) {
      const sheet = out.addPage(sheetSize);
      const cellW = sheetSize[0] / cols; const cellH = sheetSize[1] / rows;
      for (let k = 0; k < n && i + k < pages.length; k++) {
        const srcPage = pages[i + k];
        const { width, height } = srcPage.getSize();
        const scale = Math.min(cellW / width, cellH / height) * 0.92;
        const col = k % cols; const row = rows - 1 - Math.floor(k / cols);
        const embedded = await out.embedPage(srcPage);
        sheet.drawPage(embedded, { x: col * cellW + (cellW - width * scale) / 2, y: row * cellH + (cellH - height * scale) / 2, xScale: scale, yScale: scale });
      }
    }
    return { files: [{ name: downloadName(files[0].name, `${n}up`), bytes: await out.save(), mime: "application/pdf" }] };
  }
  if (slug === "booklet") {
    const out = await PDFDocument.create();
    const copied = await out.copyPages(src, src.getPageIndices());
    const pad = (4 - (copied.length % 4)) % 4;
    const pages: (PDFPage | null)[] = [...copied, ...Array(pad).fill(null)];
    const sheetSize = PageSizes.Letter; const half = pages.length / 2;
    for (let i = 0; i < half; i += 2) {
      const sheet = out.addPage(sheetSize);
      const left = pages[pages.length - 1 - i]; const right = pages[i];
      const cellW = sheetSize[0] / 2;
      const draw = async (pg: PDFPage | null, xOff: number) => {
        if (!pg) return;
        const { width, height } = pg.getSize();
        const scale = Math.min(cellW / width, sheetSize[1] / height) * 0.92;
        const embedded = await out.embedPage(pg);
        sheet.drawPage(embedded, { x: xOff + (cellW - width * scale) / 2, y: (sheetSize[1] - height * scale) / 2, xScale: scale, yScale: scale });
      };
      await draw(left, 0); await draw(right, cellW);
    }
    return { files: [{ name: downloadName(files[0].name, "booklet"), bytes: await out.save(), mime: "application/pdf" }] };
  }
  throw new Error(`Unknown tool: ${slug}`);
}

export async function makeSamplePdf(): Promise<StagedFile> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.TimesRoman);
  const bold = await doc.embedFont(StandardFonts.TimesRomanBold);
  for (let i = 1; i <= 4; i++) {
    const page = doc.addPage(PageSizes.Letter);
    page.drawText("Quire sample", { x: 72, y: 720, size: 22, font: bold, color: rgb(0.18, 0.29, 0.26) });
    page.drawText(`Page ${i} of 4`, { x: 72, y: 690, size: 12, font, color: rgb(0.3, 0.28, 0.24) });
    page.drawText("A short specimen used to try merge, watermark, numbers, n-up, and booklet without uploading anything.", { x: 72, y: 660, size: 11, font, color: rgb(0.2, 0.19, 0.16), maxWidth: 468 });
  }
  doc.setTitle("Quire sample"); doc.setAuthor("Quire");
  return { name: "quire-sample.pdf", bytes: await doc.save(), type: "application/pdf" };
}
