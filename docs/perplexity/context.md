# StoryForge — Persistent Project Context for Perplexity
*Stable reference. Updated only when the project fundamentally changes.*

_Last reviewed: 2026-05-02. If this date is >1 month old, some details (model versions, design system, feature list) may be stale._

---

## What Is This App

**StoryForge** is a single-page web app for writers of all types — novelists, essayists, screenwriters, researchers. Built by Esteban (sole developer), who designed it around his own isekai/anime story ("Life of Bon") first — but the goal is a tool any writer can tailor to their own workflow.

**Stack:** Plain HTML + CSS + JS only — no frameworks, no build tools, no npm. Runs entirely in-browser. All data persists to `localStorage`. Calls the Anthropic Claude API directly from the browser.

**Three files are the entire app:**
- `index.html` — structure and markup
- `style.css` — all styling (OKLCH token system, D1 design polish block ~line 3951)
- `app.js` — all logic (type="module", so inline onclick handlers are broken by design)

---

## Tabs / Features

| Tab | Purpose |
|-----|---------|
| Story Canvas | Kanban board — cards organized by type (Character, World, Arc, Quote, Idea) |
| Writing | Distraction-free editor with draft history |
| Characters | Character reference cards |
| Arcs & Timeline | Plot arc tracking |
| Map, Outline, and others | Additional story organization views |

**AI core feature:** Paste raw story notes or upload a file → Claude organizes them into typed cards across the kanban canvas.

**Sage:** AI assistant sidebar. Powered by Claude (claude-sonnet-4-5-20250929). Has ElevenLabs TTS voice output and speech recognition input. Visual avatar is an animated canvas orb.

*These tabs reflect the current fiction-default layout; future templates may rename or reorganize them for other writing types.*

---

## Working Assumptions (Do Not Contradict)

- Single-user, strictly personal tool — no accounts, no sharing, no collaboration.
- Claude is the only AI model in use; no plans to switch or add providers.
- Data lives in localStorage; risk of loss is accepted until a backup strategy exists.
- Design language stays dark and minimal; see Anti-References for specific "never use" patterns.
- No new npm packages, frameworks, or build tools are planned; any change here should be treated as a major architecture shift.

---

## Core Flows (How Esteban Actually Uses It)

- **Capture session:** paste messy notes → "Organize with AI" → review/fix/tag generated cards → done
- **Writing session:** open Writing tab → pull in 1–3 relevant cards for reference → draft → save
- **Planning session:** open Arcs & Timeline → review beats or structure → adjust
- **Sage session:** voice or text conversation with Sage for brainstorming or feedback on a draft
- **Research session:** collect sources and quotes as cards → tag by topic → link into outline
- **Essay session:** use Outline + cards to structure sections, then draft in Writing tab

---

## Design System

**Color tokens (OKLCH):**
```
--accent:     oklch(58% 0.16 272)    /* indigo */
--bg:         oklch(7.5% 0.009 264)  /* near-black */
--surface:    oklch(11.5% 0.011 264)
--surface-2:  oklch(14.5% 0.013 264)
--surface-3:  oklch(18% 0.015 264)
--border:     oklch(100% 0 0 / 0.07)
--text:       oklch(90% 0.005 264)
--text-muted: oklch(60% 0.008 264)
```

**Category colors (card tinting via color-mix):**
- character → blue (#3b82f6)
- world → green (#10b981)
- arc → purple (#8b5cf6)
- quote → amber (#f59e0b)
- idea → red (#ef4444)

**Typography:** `Inter` (UI) + `Lora` serif (headings). Weights: 400/500/600/700 only.

**Key CSS rule:** The D1 design polish override block lives at ~line 3951 in `style.css` and wins over earlier rules silently. Always check there first if a style isn't applying.

---

## Anti-References (What We Explicitly Avoid)

- No gradient text (`background-clip: text` is unset in the D1 block)
- No glassmorphism (backdrop-blur only for functional modal layering)
- No aurora/neon backgrounds
- No purple-neon SaaS aesthetic
- No hero-metric layouts
- No AI-cliche design patterns

---

## Claude API Configuration

- Model: `claude-sonnet-4-5-20250929`
- Browser calls require header: `anthropic-dangerous-direct-browser-access: true`
- Chunk size target: ~10K chars (larger chunks silently fail at token limits)
- Always check `stop_reason === 'max_tokens'` — truncated responses return `[]` with no error

---

## Data Model (High Level)

- **Card** — core unit: `{ id, type, title, content, status, tags[], createdAt, lastModified, ... }`
- **Card types:** character, world, arc, quote, idea, location, faction, lore, event, theme, mechanic, other
- **Position** — map layout: `{ [cardId]: { x, y, w, h } }` stored separately from card data.
- **Connection** — SVG bezier link between two cards: `{ from, to }`.
- **Draft** — writing editor state: working copy (raw HTML) + history snapshots (up to 10).
- **Arc sequence** — 8 fixed beats per arc.
- **Outline node** — tree of outline items with beats and links to cards.

All data stored in localStorage under per-project keys (`<projectId>_cards`, `<projectId>_positions`, etc.). No server, no sync.

---

## Known Sharp Edges

- **Large pastes to Claude:** >~10K chars may silently fail at token limits — no error thrown, returns `[]`.
- **localStorage wipes:** browser clearing storage = total data loss. No backup exists yet.
- **Canvas performance:** may feel laggy beyond ~200 cards; avoid features that require rendering all cards at once.
- **Voice features:** stall when network is unstable; don't design critical UX flows that require voice to work.
- **API key:** stored in localStorage, manually entered — no auth layer protects it.

---

## Performance & Limits

- Storage: ~5MB localStorage cap (browser-dependent)
- Cards: untested beyond ~200; monitor for lag as canvas grows
- API: ~10K chars per chunk; returns `[]` with no error when tokens max out

*(For failure scenarios, see Known Sharp Edges above.)*

---

## Auth & Privacy

- Strictly personal tool — no authentication, no user accounts, no sharing
- No telemetry, no analytics; only external calls are to the Claude API and ElevenLabs

---

## Dev Environment

- Windows 10/11 (home: `esteb`, work: `egarza`)
- Shell: PowerShell
- Dev server: Live Server extension in VS Code — open `index.html`, no build step
- Git remote: `https://github.com/Bon004/Life-of-Bon.git`

---

## Roadmap Snapshot
*Roadmap last updated: 2026-05-02. If this is >3 months old, treat with suspicion.*

- **Short term:** Sage UX polish, stabilize voice features, keyboard shortcut discoverability, generalize for all writer types
- **Medium term:** export/import flows, basic backup strategy, shareable read-only views
- **Not planned:** multi-user collaboration, backend services, mobile app

---

## Collaboration Model

StoryForge is developed as a three-way collaboration:
- **Esteban** — drives feature priorities and approves all plans; final decision-maker.
- **Claude Code** (CLI) — primary implementation partner. Handles code, planning, session reports.
- **Perplexity** — design and research consultant. Advises on design, UX, and research. Sees context via uploaded handoff files.

*See `docs/perplexity/handoff.md` for the current session's live context.*
