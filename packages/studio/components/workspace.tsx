"use client";

import { useCallback, useState } from "react";
import type { ToolDef } from "@/lib/tools";
import { executeTool, makeSamplePdf, type RunOptions, type StagedFile } from "@/lib/pdf";

function download(name: string, bytes: Uint8Array, mime: string) {
  const blob = new Blob([bytes as BlobPart], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export function Workspace({ tool }: { tool: ToolDef }) {
  const [files, setFiles] = useState<StagedFile[]>([]);
  const [opts, setOpts] = useState<RunOptions>({
    text: tool.slug === "watermark" ? "CONFIDENTIAL" : "",
    rotate: 90,
    nup: 2,
    pageSize: "Letter",
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const addFiles = useCallback(async (list: FileList | File[]) => {
    const next: StagedFile[] = [];
    for (const file of Array.from(list)) {
      const buf = new Uint8Array(await file.arrayBuffer());
      next.push({ name: file.name, bytes: buf, type: file.type || "application/octet-stream" });
    }
    setFiles((prev) => (tool.multiple ? [...prev, ...next] : next.slice(0, 1)));
    setErr(null);
    setNote(null);
  }, [tool.multiple]);

  async function run() {
    setBusy(true);
    setErr(null);
    setNote(null);
    try {
      const result = await executeTool(tool.slug, files, opts);
      setNote(result.note || `Ready · ${result.files.length} file${result.files.length === 1 ? "" : "s"}`);
      for (const f of result.files) download(f.name, f.bytes, f.mime);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "That file could not be processed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <p className="kicker" style={{ letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--pine)", fontSize: 11 }}>
        {tool.category}
      </p>
      <h1>{tool.name}</h1>
      <p className="lede">{tool.blurb} Processing happens on this device.</p>
      <div className="drop">
        <input type="file" accept={tool.accepts} multiple={tool.multiple} onChange={(e) => e.target.files && addFiles(e.target.files)} />
        <div>
          Drop files here, or click to choose
          <div style={{ marginTop: 6, fontSize: 13 }}>Accepts {tool.accepts}</div>
        </div>
      </div>
      <div className="files">
        {files.map((f, i) => (
          <div className="file-row" key={f.name + i}>
            <span>{f.name}</span>
            <span className="mono">{(f.bytes.byteLength / 1024).toFixed(1)} KB</span>
          </div>
        ))}
      </div>
      <div className="opts">
        {(tool.hint || ["watermark", "text-pdf"].includes(tool.slug)) && (
          <label className="field">
            {tool.hint || "Text"}
            <input
              type={tool.slug === "protect" || tool.slug === "unlock" ? "password" : "text"}
              value={
                tool.slug === "protect" || tool.slug === "unlock"
                  ? opts.password || ""
                  : tool.slug === "split" || tool.slug === "extract" || tool.slug === "delete-pages"
                    ? opts.range || ""
                    : opts.text || ""
              }
              onChange={(e) => {
                const v = e.target.value;
                if (tool.slug === "protect" || tool.slug === "unlock") setOpts({ ...opts, password: v });
                else if (tool.slug === "split" || tool.slug === "extract" || tool.slug === "delete-pages") setOpts({ ...opts, range: v });
                else setOpts({ ...opts, text: v });
              }}
            />
          </label>
        )}
        {tool.slug === "rotate" && (
          <label className="field">
            Angle
            <select value={opts.rotate} onChange={(e) => setOpts({ ...opts, rotate: Number(e.target.value) as 90 | 180 | 270 })}>
              <option value={90}>90</option>
              <option value={180}>180</option>
              <option value={270}>270</option>
            </select>
          </label>
        )}
        {tool.slug === "n-up" && (
          <label className="field">
            Pages per sheet
            <select value={opts.nup} onChange={(e) => setOpts({ ...opts, nup: Number(e.target.value) as 2 | 4 })}>
              <option value={2}>2-up</option>
              <option value={4}>4-up</option>
            </select>
          </label>
        )}
        {tool.slug === "flatten-size" && (
          <label className="field">
            Target size
            <select value={opts.pageSize} onChange={(e) => setOpts({ ...opts, pageSize: e.target.value as "Letter" | "A4" })}>
              <option>Letter</option>
              <option>A4</option>
            </select>
          </label>
        )}
        {tool.slug === "metadata" && (
          <>
            <label className="field">Title<input value={opts.title || ""} onChange={(e) => setOpts({ ...opts, title: e.target.value })} /></label>
            <label className="field">Author<input value={opts.author || ""} onChange={(e) => setOpts({ ...opts, author: e.target.value })} /></label>
            <label className="field">Subject<input value={opts.subject || ""} onChange={(e) => setOpts({ ...opts, subject: e.target.value })} /></label>
            <label className="field">Keywords<input value={opts.keywords || ""} onChange={(e) => setOpts({ ...opts, keywords: e.target.value })} /></label>
          </>
        )}
      </div>
      <div className="row">
        <button className="btn" disabled={busy || (tool.slug !== "text-pdf" && !files.length)} onClick={run}>
          {busy ? "Working" : "Run"}
        </button>
        <button className="btn ghost" disabled={busy} onClick={async () => {
          const sample = await makeSamplePdf();
          setFiles([sample]);
          setNote("Loaded a 4-page sample PDF.");
        }}>Load sample PDF</button>
        <button className="btn ghost" onClick={() => { setFiles([]); setNote(null); setErr(null); }}>Clear</button>
      </div>
      {err && <p className="err">{err}</p>}
      {note && <p className="ok">{note}</p>}
      <p className="privacy">
        Quire never uploads your documents. The worker pipeline stays available for heavy EPUB jobs; this studio is the free local surface.
      </p>
    </div>
  );
}
