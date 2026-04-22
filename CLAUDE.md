# StoryForge Project Guide

## Project Overview
StoryForge is a web app for organizing your isekai/anime story called "Life of Bon" — where the main character gets reincarnated. It has 4 tabs (Story Canvas, Writing, Characters, Arcs & Timeline) and uses Claude AI to automatically organize your story notes into categorized cards.

## Tech Stack
- **Plain HTML + CSS + JavaScript** (NO frameworks, no build steps)
- **localStorage** for all data persistence (cards, API key)
- **Live Server** for local development (just open the folder and click "Go Live")
- **Anthropic Claude API** called directly from the browser (with `anthropic-dangerous-direct-browser-access` header)
- **Libraries via CDN**: mammoth.js (Word files), PDF.js (PDFs)
- **Model**: claude-sonnet-4-5-20250929

## My Environment
- Machine: Windows 11, user is `egarza` (work laptop) or `esteb` (home)
- Project path: `C:\Users\egarza\Master File for code stuff\Life-of-Bon` (work) / `C:\Users\esteb\Documents\Story website` (home)
- Shell: **PowerShell** — always use PowerShell-compatible syntax (`;` instead of `&&`)
- No build steps — open index.html directly or use Live Server

## Where Things Live

| Folder | Purpose |
|---|---|
| `docs/` | Session reports (`docs/session-reports/`) and feature roadmap (`docs/roadmaps/`) |
| `design/` | UI reference images |
| `story/` | Source story notes and manuscript files |
| `tests/` | Vitest unit tests for `story-utils.js` |
| `.claude/skills/` | Skill definitions — one subfolder per skill, each with a `SKILL.md` |

Full technical reference (file map, schemas, key functions): see `CODEBASE.md`.

## How to Work on This Project

### Key Data Structure
```javascript
{
  id:        "a3f9b2",
  type:      "character",  // character | world | arc | quote | idea
  title:     "Bon",
  content:   "Main character who gets reincarnated...",
  status:    "active",     // "active" | "archived"
  createdAt: "2026-04-07T12:00:00Z"
}
```

### Card Types
- **character** → people, beings, named characters
- **world** → locations, places, world rules, magic systems
- **arc** → plot points, story events, narrative arcs
- **quote** → memorable lines or exact dialogue
- **idea** → loose ideas, themes, future plans

> Extended types (12 total): location, faction, lore, event, scene, relationship, theme. Full schema: see `CODEBASE.md`.

## Important Notes

### Styling
- All colors are CSS variables in `style.css` (look for `--accent`, `--bg`, `--color-*`)
- Column colors: blue (character), green (world), purple (arc), amber (quote), red (idea)
- Cards are inline-editable with `contenteditable="true"`

### File Support
- **Text**: .txt, .md
- **Images**: .jpg, .png, .heic (sent as base64 to Claude vision API)
- **Documents**: .docx (via mammoth.js), .pdf (via PDF.js)
- **Paste mode**: plain text input directly

### Data Persistence
- All cards saved in `localStorage` under key `sf_cards`; API key under `sf_api_key`
- For the full localStorage key reference, see `CODEBASE.md`
- Do NOT add new keys without listing them in `CODEBASE.md` first

### Card Status Field
Each card has a `status` field: `"active"` (default) or `"archived"` (superseded/no longer relevant).
- Archive/Restore via the ⋮ AI Actions dropdown on any map card or the Archive panel
- Archived cards are hidden from board and map views; browse them in the Archive left panel

## Skills

| Skill | Spec | When to invoke |
|---|---|---|
| `/insights` | `.claude/skills/insights/SKILL.md` | End of session — generates HTML report, saves to `docs/session-reports/` |
| `/status` | `.claude/skills/status/SKILL.md` | Start of session — quick orientation from git + last report |

Each `SKILL.md` is the single source of truth for that skill's workflow, output format, and save paths.

## When Editing Code

1. **Always read the file first** before making changes
2. **Keep it simple** — no over-engineering, one feature at a time
3. **Test in browser** before committing (for DOM/UI changes)
4. **No deleting features** — if something isn't working, debug it instead

### TDD for Utility Functions
Pure functions in `story-utils.js` follow the TDD loop: write test → confirm fail → implement → confirm pass.
DOM-dependent code in `app.js` stays as manual browser testing only.

## What NOT to Do
- Don't suggest npm packages, webpack, React, or any build tools — plain HTML/JS only
- Don't add new files beyond index.html, style.css, app.js
- Don't use fetch() for local files — everything runs in-browser
- If something isn't working after 2 attempts, stop and explain the problem instead of retrying

## Next Phases
See `docs/roadmaps/roadmap-future-features.html` for the full build roadmap.

## Workflow Guidelines

### "Redesign" means structural + visual
When the user asks for a redesign, treat it as layout + typography + palette changes — not just color tweaks.
- Always propose a redesign plan first (layout scope + palette)
- Confirm whether the user wants layout changes, palette changes, or both
- Deliver spacing, hierarchy, card shape, and typography improvements — not just CSS color variable swaps

### Browser test gate
Before starting any new feature sprint, manually test the existing tabs to catch regressions. If something is visibly broken, fix it before adding new features.

## Git Workflow
- Push changes regularly to `https://github.com/Bon004/Life-of-Bon.git`
- Keep `main` branch stable; use branches for big experiments

## Debugging Approach
- **Trust the user's description.** If the user says something is broken, do NOT assume it works — inspect the actual failure first.
- When a bug is reported, reproduce or identify the root cause before proposing a fix.
- Check the browser Console for errors before reading code.
