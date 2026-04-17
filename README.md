# FreePDF No Bullshit

A browser-based PDF editor focused on the same day-to-day workflow as mainstream online PDF tools.

## Features

- Clean centered toolbar with selection, text, sign, highlight, redact, image, draw, check, cross, sticky note, erase, search, and date tools
- Context-sensitive right panel that only shows controls for the active tool or selected item
- Signature creation modal with a reusable transparent signature
- Optional local autosave that restores your uploaded PDF and edits after a refresh
- Transparent text, signature, and image placement on the page
- Undo, redo, duplicate, delete, page navigation, zoom, search, and PDF re-export
- Export a brand-new PDF with all edits embedded into the document

## Run locally

```bash
npm install
npm run dev
```

Then open the local URL shown by Vite, usually `http://localhost:5173`.

## Deploy for free

This project is a static Vite app, so it can be hosted for free on services like Vercel, Netlify, Cloudflare Pages, or Render Static Sites.

### Recommended path: GitHub + Vercel

1. Create a new GitHub repository and upload this project.
2. Go to Vercel and import that repository.
3. Keep the default Vite settings.
4. Make sure the build command is `npm run build`.
5. Make sure the output directory is `dist`.
6. Set the environment variable `SITE_URL` to your final public domain, for example `https://freepdf-nobullshit.com`.
7. Click deploy.

After that, each push to GitHub can automatically update the live site.

### Fastest path: drag-and-drop deploy

1. Run `npm run build`.
2. Upload the `dist` folder to a static hosting service that supports drag-and-drop deploys.

### Privacy note

This app runs fully in the browser. Uploaded PDFs and edits stay on the user's device unless you later add a backend yourself. Local autosave can be turned off in the app.

## How to use it

1. Use **Upload New** to open a PDF.
2. Pick a tool from the toolbar.
3. Use the right-side panel to configure only that tool or the currently selected item.
4. Click or draw on the page to place annotations, notes, signatures, redactions, or images.
5. Click **Download** to export the edited PDF.

## Notes

- This app is focused on form filling, markup, signing, search, and annotations, not rewriting the original printed PDF text.
- Exported edits are flattened into the new PDF so they stay visible when shared.
- The current feature set is inspired by mainstream PDF editors, but it is still a lightweight local implementation rather than a full Acrobat replacement.

