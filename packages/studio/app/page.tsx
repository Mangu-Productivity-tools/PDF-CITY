import Link from "next/link";
import { CATEGORIES, TOOLS } from "@/lib/tools";

export default function HomePage() {
  return (
    <div>
      <h1>Every PDF tool, in the browser.</h1>
      <p className="lede">
        Quire is the public face of pubpdf: merge, split, stamp, convert EPUB and Word,
        impose booklets. Nothing is uploaded. Use it freely.
      </p>
      {CATEGORIES.map((cat) => (
        <section key={cat} style={{ marginBottom: 28 }}>
          <div className="cat" style={{ paddingLeft: 0 }}>{cat}</div>
          <div className="grid">
            {TOOLS.filter((t) => t.category === cat).map((t) => (
              <Link key={t.slug} href={`/tools/${t.slug}`} className="card">
                <div className="kicker">{t.category}</div>
                <h3>{t.name}</h3>
                <p>{t.blurb}</p>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
