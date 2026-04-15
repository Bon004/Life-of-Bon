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

## File Structure
```
storyforge/
├── index.html       # All HTML structure
├── style.css        # All styles (CSS variables)
├── app.js           # All JavaScript logic
├── CLAUDE.md        # This file
└── README.md        # (optional) user documentation
```

## My Environment
- Machine: Windows 10, user is `esteb`
- Project path: `C:\Users\esteb\Documents\Story website`
- Shell: **PowerShell** — always use PowerShell-compatible syntax (`;` instead of `&&`, no bash-only constructs like `||`, avoid backtick quoting differences)
- Paths with spaces: always quote them in terminal commands
- Home machine: no restrictions, full admin access
- No build steps — open index.html directly or use Live Server
- Browser testing: manually in browser for UI/DOM features
- Unit testing: `npm test` (vitest) for pure utility functions in `story-utils.js`

## How to Work on This Project

### Local Development
1. Open **PowerShell** and navigate to the project folder:
   ```
   cd "C:\Users\esteb\Documents\Story website"
   ```
2. Start Live Server:
   ```
   npx live-server
   ```
3. Browser opens automatically to `127.0.0.1:5500`

### Key Data Structure
```javascript
// Each card looks like this:
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

### API Key Storage
- Saved in browser `localStorage` under key `sf_api_key`
- Only shared with Anthropic directly
- Safe for personal use (for production apps, move to server)

### Data Persistence
- All cards saved in `localStorage` under key `sf_cards`
- Automatically saved when added, edited, or deleted
- No server required

### localStorage Keys
- `sf_cards` — array of all card objects (each card has: id, type, title, content, status, createdAt)
- `sf_api_key` — user's Anthropic API key (string)
- `sf_positions` — map card positions `{[cardId]: {x, y, w, h}}`
- `sf_connections` — array of connection objects `{id, from, to, auto}`
- `sf_zoom` — current map zoom level (float)
- `sf_chat_memory` — summarized chat memory from past sessions (string, max 3000 chars)
- `sf_summary` — cached story summary text (string)
- `sf_synced_files` — array of synced file keys (name + lastModified) for folder sync
- `sf_unsynced_ids` — Set of card IDs added since last map sync
- `sf_suggestions` — array of AI suggestion objects `{id, source, text, status, createdAt, notes}`
- `sf_writing_copy` — Writing tab: working copy content (plain text)
- `sf_writing_draft` — Writing tab: draft/exploration content (plain text)
- `sf_character_profiles` — Characters tab: `{ [cardId]: { role, enneagram, goal, fear, arc, notes } }`
- `sf_arc_sequence_map` — Arcs tab: `{ [sequenceNumber]: [arcCardId, ...] }` — AI-mapped arcs to 8-sequence slots
- `sf_arc_order` — Arcs tab: `[arcCardId, ...]` — user-defined sort order for the timeline strip
- `sf_situation_order` — Arcs tab: `[1, 2, ... 36]` — user-defined display order for the 36 Dramatic Situations
- `sf_writing_copy` — Writing tab: working copy content (now stored as HTML from rich text editor)
- Do NOT add new keys without listing them here first

### Card Status Field
Each card has a `status` field: `"active"` (default) or `"archived"` (superseded/no longer relevant).
- Archive/Restore via the ⋮ AI Actions dropdown on any map card or the Archive panel
- Archived cards are hidden from board and map views; browse them in the Archive left panel

## Claude Code Commands

These are commands typed in the **Claude Code chat** (not inside the StoryForge app itself).

### `/insights` — Story & Project Report

When the user types `/insights`, generate a structured report in this exact 8-section format. Read the current card data from context, or ask the user to paste relevant info if needed.

```
## StoryForge Insights Report — [Date]

### 1. Story Overview
- Total active cards by type (character / world / arc / quote / idea)
- Archived vs active count
- Brief story logline derived from card content

### 2. Character Analysis
- Named characters identified (group multiple cards by character name)
- Arc status per main character: what's established, what's missing
- Characters with multiple cards — list and flag contradictions or gaps

### 3. Plot & Arc Structure
- Active arc cards and their position in the 8-sequence structure (if mapped)
- Which of the 36 Dramatic Situations are selected / in use
- Identified plot gaps or unresolved setups

### 4. World-Building Status
- What's established (from world cards)
- Obvious gaps (e.g., magic system defined but society not)
- Consistency issues between world cards

### 5. Writing Progress
- Word count in Working Copy (if known)
- Current stage (outline / draft / revision)

### 6. UI & Feature Progress
Track build status of pending improvements:
- [ ] Archive sidebar (left panel)
- [ ] Home page / landing screen
- [ ] Writing tab rich text toolbar
- [ ] Character grouping by name
- [ ] Arcs tab: drag-to-reorder + edit buttons
- [ ] 36 Dramatic Situations: reorderable list

### 7. Open Questions & Gaps
- Story threads set up but not resolved
- Characters needing more development
- World rules mentioned but not defined

### 8. Recommended Next Actions
- Top 3 story-side priorities
- Top 1–2 build tasks to tackle next
```

### Session Report Rules
Every `/insights` run must produce **two outputs**:
1. A new `session-report-YYYY-MM-DD.html` in `Web Build Notes/session-reports/`
2. An updated `full-project-report.html` in the same folder (add a row to Session History + update the "Last updated" date)

**Immutability:** Each `session-report-YYYY-MM-DD.html` is created once and never modified again. Only `full-project-report.html` is updated over time.

**Same-day second run:** If a `session-report-YYYY-MM-DD.html` already exists for today, ask the user whether to update/append the existing file or create a new file (`session-report-YYYY-MM-DD-2.html`, etc.). Never ask on the first run of a day — just create the file.

## When Editing Code

1. **Always read the file first** before making changes
2. **Keep it simple** — no over-engineering, one feature at a time
3. **Test in browser** before committing (for DOM/UI changes)
4. **Explain like a beginner** — comments should be clear and helpful
5. **No deleting features** — if something isn't working, debug it instead

### TDD for Utility Functions
Pure functions in `story-utils.js` (no DOM, no API, no localStorage) should follow the TDD loop:
1. Write the test in `tests/story-utils.test.js` first
2. Run `npm test` — confirm it fails
3. Implement the function in `story-utils.js`
4. Run `npm test` — confirm it passes

DOM-dependent code in `app.js` stays as manual browser testing only.

## What NOT to Do
- Don't suggest npm packages, webpack, React, or any build tools — plain HTML/JS only
- Don't add new files beyond index.html, style.css, app.js
- Don't use fetch() for local files — everything runs in-browser
- If something isn't working after 2 attempts, stop and explain the problem instead of retrying

## Next Phases (In Order)
1. ✅ Add Notes with AI organization (DONE)
2. Polish homepage design
   - Hero section with title, subtitle, and visible "Add Notes" CTA
   - Consistent card shadows and hover states
   - Done when: looks polished on 1080p desktop and iPad
3. Writing tab: chapter editor, word count, auto-save
   - Done when: user can type a chapter, see word count live, and have it save automatically
4. Characters tab: character profile sheets, emoji picker
   - Done when: each character card has expandable profile fields and an emoji avatar picker
5. Arcs tab: arc timeline with events
   - Done when: arcs display in chronological order with events attached
6. Settings/backup: export/import data
   - Done when: user can download all cards as JSON and re-import them
7. Mobile refinements for iPad use
   - Done when: all 4 tabs are usable on iPad without horizontal scrolling

## Git Workflow
- Push changes regularly to `https://github.com/Bon004/Life-of-Bon.git`
- Keep `main` branch stable and working
- For big experiments, use branches (`git branch feature-name`)

## Debugging Tips
- Open browser DevTools (`F12`): Console tab shows errors
- Check `localStorage` in DevTools to see saved data
- Test with small files first before uploading large PDFs
- Refresh page (`F5`) if something looks stuck

### Debugging Approach
- **Trust the user's description.** If the user says something is broken, do NOT assume it works — inspect the actual failure first.
- When a bug is reported, reproduce or identify the root cause before proposing a fix.
- Check the browser Console for errors before reading code.
