# Quire — pubpdf studio

Private, client-side PDF studio. Files never leave the browser.

This is the free public surface of the pubpdf monorepo. The existing
`packages/api` + `packages/worker` pipeline remains the heavy EPUB
conversion service. Quire is what we put on Vercel so anyone can merge,
split, stamp, convert, and impose PDFs without an account.

```bash
cd packages/studio
npm install
npm run dev     # http://localhost:3003
```

Vercel: set the project root to `packages/studio` (or deploy this folder
directly). Build command is `npm run build`.
