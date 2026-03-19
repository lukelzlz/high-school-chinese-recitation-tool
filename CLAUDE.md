# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A pure static Chinese high school recitation/memorization practice tool. **This project intentionally avoids modern build toolchains** - no npm, no bundlers, no build process.

## Development Commands

Since there's no build process:

```bash
# Local development - serve the files
python -m http.server 8000
# or
npx serve

# Cloudflare Workers deployment (optional backend)
npx wrangler deploy
```

## Architecture

### Tech Stack
- Pure HTML/CSS/JavaScript (no frameworks)
- Cloudflare Workers + D1 (optional backend for analytics)
- Deployment: GitHub Pages, Cloudflare Pages, or Cloudflare Workers

### Key Files
| File | Purpose |
|------|---------|
| `index.html` | Main HTML structure with modal for stats |
| `app.js` | All frontend logic (~350 lines): DOM handling, game logic, localStorage, API calls |
| `styles.css` | All styles with purple gradient theme, responsive design |
| `data/texts.js` | `TEXTS_LIBRARY` object containing ~100+ Chinese literary works |
| `worker/index.js` | Cloudflare Workers API for optional analytics |
| `schema.sql` | D1 database schema for recitation events |

### Data Flow
```
User Input → normalizeText() → Compare → Highlight Errors → Update Progress
                                                      ↓
                                              localStorage (primary)
                                                      ↓
                                          fetch('/api/stats') (optional)
```

## Design Philosophy

1. **Offline-first**: localStorage is the primary data store; Cloudflare API is optional and fails silently
2. **Zero dependencies**: No npm packages, no build tools, no framework
3. **Direct file editing**: All code is in single files - no module bundlers needed
4. **Privacy-conscious**: User input stays local by default; only aggregated stats optionally uploaded

## Important Notes

- **Do NOT suggest npm install, build tools, or modern frameworks** - this simplicity is intentional
- **Do NOT propose architectural changes** - the minimal approach is a design choice
- Adding new texts: edit `data/texts.js` and add to the `TEXTS_LIBRARY` object
- CSS modifications: all in `styles.css` with CSS custom properties for theming
- The `worker/` directory is optional for Cloudflare Workers deployment; the app works without it
