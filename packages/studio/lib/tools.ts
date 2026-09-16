export type ToolCategory =
  | "Organize"
  | "Edit"
  | "Convert"
  | "Secure"
  | "Inspect"
  | "Layout";

export type ToolDef = {
  slug: string;
  name: string;
  blurb: string;
  category: ToolCategory;
  accepts: string;
  multiple: boolean;
  hint?: string;
};

export const TOOLS: ToolDef[] = [
  { slug: "merge", name: "Merge PDFs", blurb: "Combine any number of PDFs into one file.", category: "Organize", accepts: "application/pdf", multiple: true },
  { slug: "split", name: "Split PDF", blurb: "Cut a PDF into ranges or one file per page.", category: "Organize", accepts: "application/pdf", multiple: false, hint: "Range like 1-3,5,8-10. Leave empty to split every page." },
  { slug: "extract", name: "Extract pages", blurb: "Keep only the pages you name.", category: "Organize", accepts: "application/pdf", multiple: false, hint: "Pages to keep: 1-3,7" },
  { slug: "delete-pages", name: "Delete pages", blurb: "Drop pages from a document.", category: "Organize", accepts: "application/pdf", multiple: false, hint: "Pages to delete: 2,4-6" },
  { slug: "rotate", name: "Rotate pages", blurb: "Turn pages 90, 180, or 270 degrees.", category: "Organize", accepts: "application/pdf", multiple: false },
  { slug: "reorder", name: "Reorder pages", blurb: "Reverse or reshuffle page order.", category: "Organize", accepts: "application/pdf", multiple: false },
  { slug: "compress", name: "Compress", blurb: "Rewrite the PDF to strip unused objects.", category: "Edit", accepts: "application/pdf", multiple: false },
  { slug: "watermark", name: "Watermark", blurb: "Stamp text across every page.", category: "Edit", accepts: "application/pdf", multiple: false, hint: "Watermark text" },
  { slug: "page-numbers", name: "Page numbers", blurb: "Add footer page numbers.", category: "Edit", accepts: "application/pdf", multiple: false },
  { slug: "metadata", name: "Metadata", blurb: "Set title, author, subject, keywords.", category: "Inspect", accepts: "application/pdf", multiple: false },
  { slug: "protect", name: "Protect", blurb: "Encrypt with a user password.", category: "Secure", accepts: "application/pdf", multiple: false, hint: "Password" },
  { slug: "unlock", name: "Unlock", blurb: "Open an encrypted PDF if you have the password.", category: "Secure", accepts: "application/pdf", multiple: false, hint: "Password" },
  { slug: "images-pdf", name: "Images to PDF", blurb: "Turn JPG/PNG photos into a PDF.", category: "Convert", accepts: "image/jpeg,image/png,image/webp", multiple: true },
  { slug: "text-pdf", name: "Text to PDF", blurb: "Typeset plain text into a clean PDF.", category: "Convert", accepts: "text/plain", multiple: false },
  { slug: "markdown-pdf", name: "Markdown to PDF", blurb: "Render Markdown as a typeset PDF.", category: "Convert", accepts: "text/markdown,text/plain", multiple: false },
  { slug: "html-pdf", name: "HTML to PDF", blurb: "Lay out an HTML file as pages.", category: "Convert", accepts: "text/html", multiple: false },
  { slug: "docx-pdf", name: "DOCX to PDF", blurb: "Convert a Word document client-side.", category: "Convert", accepts: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", multiple: false },
  { slug: "epub-pdf", name: "EPUB to PDF", blurb: "Unzip an EPUB and typeset the spine.", category: "Convert", accepts: "application/epub+zip,.epub", multiple: false },
  { slug: "n-up", name: "N-up", blurb: "Pack 2 or 4 pages onto each sheet.", category: "Layout", accepts: "application/pdf", multiple: false },
  { slug: "booklet", name: "Booklet", blurb: "Impose pages for saddle-stitch printing.", category: "Layout", accepts: "application/pdf", multiple: false },
  { slug: "blank", name: "Insert blanks", blurb: "Add blank pages after every page.", category: "Organize", accepts: "application/pdf", multiple: false },
  { slug: "flatten-size", name: "Normalize size", blurb: "Scale every page to Letter or A4.", category: "Layout", accepts: "application/pdf", multiple: false },
  { slug: "info", name: "Inspect", blurb: "Read page count, sizes, and metadata.", category: "Inspect", accepts: "application/pdf", multiple: false },
];

export const CATEGORIES: ToolCategory[] = [
  "Organize",
  "Edit",
  "Convert",
  "Secure",
  "Inspect",
  "Layout",
];

export function getTool(slug: string) {
  return TOOLS.find((t) => t.slug === slug);
}
