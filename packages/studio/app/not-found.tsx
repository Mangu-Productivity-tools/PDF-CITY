import Link from "next/link";

export default function NotFound() {
  return (
    <div>
      <h1>Not in the catalog</h1>
      <p className="lede">That tool does not exist. Head back to the studio.</p>
      <Link href="/" className="btn" style={{ display: "inline-block" }}>All tools</Link>
    </div>
  );
}
