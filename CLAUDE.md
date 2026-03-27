# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A pure static Chinese high school recitation/memorization practice tool. **This project intentionally avoids modern build toolchains** - no npm, no bundlers, no build process.

## Development Commands

```bash
# Local development - serve the files
python -m http.server 8000
# or
npx serve

# Cloudflare Workers deployment (optional backend)
npx wrangler deploy

# Deploy to GitHub Pages - auto-deploys on push to main via GitHub Actions
```

## Architecture

### Tech Stack
- Pure HTML/CSS/JavaScript (no frameworks, no npm, no build tools)
- Cloudflare Workers + D1 + AI (optional backend for analytics and handwriting recognition)
- Deployment: Cloudflare Workers (static assets via `ASSETS` binding, auto-deploy via Git integration)

### Key Files
| File | Purpose |
|------|---------|
| `public/index.html` | Main HTML structure with modal for stats, handwriting canvas |
| `public/app.js` | All frontend logic: DOM handling, game logic, localStorage, API calls, canvas drawing |
| `public/styles.css` | All styles with purple gradient theme, responsive design, handwriting section |
| `public/data/texts.js` | `TEXTS_LIBRARY` object: ~100+ Chinese literary works, keyed as `"《Title》- Author": "full text"` |
| `worker/index.js` | Cloudflare Workers API (`POST/GET /api/stats`, `POST /api/recognize`) with auto table init via `ensureTableExists()` |
| `wrangler.jsonc` | Workers config (primary): D1 binding `btw`, AI binding `AI`, static assets via `ASSETS` binding |
| `wrangler.toml` | Workers config (secondary): same bindings in TOML format |
| `schema.sql` | D1 database schema for recitation events |

### Data Flow
```
User Input (keyboard or handwriting) → normalizeText() → Compare → Highlight Errors → Update Progress
                                                              ↓
                                                      localStorage (primary)
                                                              ↓
                                          fetch('/api/stats') (optional, silent)
                                          fetch('/api/recognize') (optional, handwriting)
```

### Worker API (Optional)
- `POST /api/stats` — Record recitation completion (aggregated counts only, no user input)
- `GET /api/stats` — Global statistics (total times, unique users, top 10 texts)
- `GET /api/stats/me?uid=xxx` — Personal statistics (uid from browser fingerprint)
- `POST /api/recognize` — Handwriting OCR via Workers AI (`@cf/meta/llama-3.2-11b-vision-instruct`), auto-agrees to license on first call

## Design Philosophy

1. **Offline-first**: localStorage is the primary data store; Cloudflare API is optional and fails silently
2. **Zero dependencies**: No npm packages, no build tools, no framework
3. **Direct file editing**: All code is in single files - no module bundlers needed
4. **Privacy-conscious**: User input stays local by default; only aggregated stats optionally uploaded
5. **Handwriting canvas works offline**: Drawing/undo/clear require no network; only OCR recognition needs Workers AI

## Important Notes

- **Do NOT suggest npm install, build tools, or modern frameworks** - this simplicity is intentional
- **Do NOT propose architectural changes** - the minimal approach is a design choice
- Adding new texts: edit `public/data/texts.js` and add entries to `TEXTS_LIBRARY` as `"《Title》- Author": "full text"`
- CSS modifications: all in `public/styles.css` with CSS custom properties for theming
- The `worker/` directory is optional; the app works as a pure static site without it
- User IDs use browser fingerprinting (not cookies/storage) for anonymous tracking
- **Project structure**: static files live in `public/`, Worker code in `worker/`; `wrangler.jsonc` is the primary config (wrangler.toml is secondary)
- **Do NOT add `Co-Authored-By` to commit messages**
