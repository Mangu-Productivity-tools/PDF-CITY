import type { Metadata } from "next";
import "./globals.css";
import { CATEGORIES, TOOLS } from "@/lib/tools";

export const metadata: Metadata = {
  title: "Quire \u00b7 pubpdf studio",
  description: "Private, client-side PDF tools. Files never leave the browser.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="app">
          <aside className="sidebar">
            <a href="/" className="brand"><b>Quire</b><span>pubpdf</span></a>
            {CATEGORIES.map((cat) => (
              <div key={cat}>
                <div className="cat">{cat}</div>
                {TOOLS.filter((t) => t.category === cat).map((t) => (
                  <a key={t.slug} href={`/tools/${t.slug}`} className="nav-link">{t.name}</a>
                ))}
              </div>
            ))}
            <div className="side-foot">Files stay in this browser. No account. Close to free, on purpose.</div>
          </aside>
          <div className="main">
            <header className="mobile-bar">
              <a href="/" className="brand" style={{ padding: 0 }}><b>Quire</b><span>pubpdf</span></a>
              <a href="/" style={{ fontSize: 13, color: "var(--muted)" }}>All tools</a>
            </header>
            <div className="content">{children}</div>
            <nav className="bottom-nav">
              <a href="/">Studio</a>
              <a href="/tools/merge">Merge</a>
              <a href="/tools/epub-pdf">EPUB</a>
              <a href="/tools/watermark">Stamp</a>
            </nav>
          </div>
        </div>
      </body>
    </html>
  );
}
