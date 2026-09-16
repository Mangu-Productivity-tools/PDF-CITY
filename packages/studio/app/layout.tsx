import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { CATEGORIES, TOOLS } from "@/lib/tools";

export const metadata: Metadata = {
  title: "Quire \u00b7 pubpdf studio",
  description: "Private, client-side PDF tools. Merge, split, watermark, convert EPUB, and more. Files never leave the browser.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="app">
          <aside className="sidebar">
            <Link href="/" className="brand">
              <b>Quire</b>
              <span>pubpdf</span>
            </Link>
            {CATEGORIES.map((cat) => (
              <div key={cat}>
                <div className="cat">{cat}</div>
                {TOOLS.filter((t) => t.category === cat).map((t) => (
                  <Link key={t.slug} href={`/tools/${t.slug}`} className="nav-link">
                    {t.name}
                  </Link>
                ))}
              </div>
            ))}
            <div className="side-foot">
              Files stay in this browser. No account. Close to free, on purpose.
            </div>
          </aside>
          <div className="main">
            <header className="mobile-bar">
              <Link href="/" className="brand" style={{ padding: 0 }}>
                <b>Quire</b>
                <span>pubpdf</span>
              </Link>
              <Link href="/" style={{ fontSize: 13, color: "var(--muted)" }}>All tools</Link>
            </header>
            <div className="content">{children}</div>
            <nav className="bottom-nav">
              <Link href="/">Studio</Link>
              <Link href="/tools/merge">Merge</Link>
              <Link href="/tools/epub-pdf">EPUB</Link>
              <Link href="/tools/watermark">Stamp</Link>
            </nav>
          </div>
        </div>
      </body>
    </html>
  );
}
