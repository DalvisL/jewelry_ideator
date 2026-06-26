# Jewelry Ideator — Web

A React + Vite port of the Jewelry Ideator app, so it can run on a phone via
the browser (and "Add to Home Screen") with no Xcode / Apple Developer account
and instant iteration.

The native SwiftUI app still lives alongside this in the repo.

## Develop

```bash
cd web
npm install
npm run dev
```

Open the printed URL. To test on your phone over Wi-Fi, run
`npm run dev -- --host` and visit the **Network** URL it prints.

## Build

```bash
npm run build      # outputs to web/dist
npm run preview    # serve the production build locally
```

## Deploy to GitHub Pages

The included workflow (`.github/workflows/deploy.yml`) builds and deploys on
every push to `main`. To turn it on:

1. Push the repo to GitHub.
2. **Settings → Pages → Build and deployment → Source: GitHub Actions.**
3. Push to `main` — the site goes live at
   `https://<user>.github.io/<repo>/`.

`vite.config.js` sets `base: "./"`, so the app works at a project subpath
without extra config.

> **Note:** the workflow assumes the web app is in a `web/` subfolder. If you
> move it to the repo root, update `working-directory` / `path` in the workflow.

## Use on iPhone

Open the deployed URL in Safari → **Share → Add to Home Screen**. It launches
fullscreen with its own icon. Saved ideas persist in the browser via
`localStorage`.

## Structure

```
web/
  index.html
  src/
    main.jsx            # entry
    App.jsx             # state + layout
    styles.css
    components/
      IdeaCard.jsx
      SavedIdeas.jsx
    data/
      jewelry.js        # data pools + generate() — port of JewelryGenerator.swift
  public/
    icon.svg
    manifest.webmanifest
```
