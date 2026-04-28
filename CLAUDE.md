# StoryForge Project Guide

## Project Overview
StoryForge is a web app for organizing the "Life of Bon" isekai/anime story. It has 4 tabs (Story Canvas, Writing, Characters, Arcs & Timeline) and uses Claude AI to organize story notes into categorized cards.

## Tech Stack
- **Plain HTML + CSS + JavaScript** — no frameworks, no build steps
- **localStorage** for all data persistence
- **Anthropic Claude API** called directly from the browser
- **Libraries via CDN**: mammoth.js (Word files), PDF.js (PDFs)

## My Environment
- Windows 11 — `egarza` (work) / `esteb` (home)
- Shell: **PowerShell** — use `;` instead of `&&`
- Dev: open `index.html` in Live Server (no build step)

## Where Things Live

| Path | Purpose |
|---|---|
| `index.html` / `style.css` / `app.js` | The entire app — only these three files |
| `story-utils.js` | Shared pure utilities (testable) |
| `tests/` | Vitest unit tests for `story-utils.js` |
| `docs/session-reports/` | Session reports (HTML) |
| `docs/roadmaps/` | Feature roadmap |
| `design/` | UI reference images |
| `story/` | Source story notes and manuscript files |
| `story/wiki/` | Claude-generated story reference pages (characters, timeline, world-rules, themes, open-questions) |
| `.claude/skills/` | `/insights`, `/status`, and `/refresh-wiki` skill specs |
| `.claude/rules/` | Topic-specific persistent rules |
| `CODEBASE.md` | Full technical reference: file map, schemas, localStorage keys, key functions |

## Core Rules
- Plain HTML/CSS/JS only — no npm, no frameworks, no build tools
- Read every file before editing it
- No new files beyond `index.html`, `style.css`, `app.js`
- Browser-test DOM changes before committing
- After 2 failed attempts, stop and explain — don't retry blindly
- Trust the user's bug description — check the browser Console before reading code
- Do not add new `localStorage` keys without listing them in `CODEBASE.md` first

**Topic rules in `.claude/rules/`:**
- `editing.md` — file editing, TDD pattern, scope limits
- `api.md` — Claude API model, chunk sizing, stop_reason checks
- `css.md` — variable system, D1 override block location, selector grep rule
- `browser-testing.md` — sprint test gate, module onclick audit, addEventListener pattern
- `design.md` — redesign scope, confirmation workflow

## Skills

| Skill | Spec | When to use |
|---|---|---|
| `/insights` | `.claude/skills/insights/SKILL.md` | End of session — generates HTML report |
| `/status` | `.claude/skills/status/SKILL.md` | Start of session — quick orientation |
| `/refresh-wiki` | `.claude/skills/refresh-wiki/SKILL.md` | Regenerate story wiki pages from source files |

## Git Workflow
- Remote: `https://github.com/Bon004/Life-of-Bon.git`
- Keep `main` stable; branch for big experiments
- Push regularly

## Next Phases
See `docs/roadmaps/roadmap-future-features.html` for the full build roadmap.
