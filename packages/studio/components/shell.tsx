"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";
import { CATEGORIES, TOOLS } from "@/lib/tools";

export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return TOOLS;
    return TOOLS.filter((t) => `${t.name} ${t.blurb} ${t.slug}`.toLowerCase().includes(s));
  }, [q]);

  return (
    <div className="app">
      <aside className="sidebar">
        <Link href="/" className="brand">
          <b>Quire</b>
          <span>pubpdf</span>
        </Link>
        <input
          className="search"
          placeholder="Search tools"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        {CATEGORIES.map((cat) => {
          const items = filtered.filter((t) => t.category === cat);
          if (!items.length) return null;
          return (
            <div key={cat}>
              <div className="cat">{cat}</div>
              {items.map((t) => (
                <Link
                  key={t.slug}
                  href={`/tools/${t.slug}`}
                  className={`nav-link${path === `/tools/${t.slug}` ? " active" : ""}`}
                >
                  {t.name}
                </Link>
              ))}
            </div>
          );
        })}
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
          <Link href="/" style={{ fontSize: 13, color: "var(--muted)" }}>
            All tools
          </Link>
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
  );
}
