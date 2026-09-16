"use client";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <div style={{ padding: 32 }}>
      <h1>Something broke</h1>
      <p>The studio hit an unexpected error. Your files are still on this device.</p>
      <button className="btn" onClick={reset}>Try again</button>
    </div>
  );
}
