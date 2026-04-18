# StoryForge — Developer Index

Quick reference for navigating and understanding the codebase.

---

## Files

| File | Size | Purpose |
|---|---|---|
| `index.html` | ~300 lines | All HTML structure: board/map panels, modals, chat panel |
| `style.css` | ~1,250 lines | All styles (dark theme, CSS variables, cards, modals) |
| `app.js` | ~2,100 lines | All JavaScript logic |
| `story-utils.js` | ~65 lines | Shared utilities: prompt builders, type constants |
| `CLAUDE.md` | — | Project guide for AI-assisted development |

---

## app.js Sections

Search with **Ctrl+F** using the section name to jump directly.

| Section | Marker | What it does |
|---|---|---|
| 1 · Card Data | `SECTION 1` | Init — loads all state from localStorage on page load |
| 2 · Card Helpers | `SECTION 2` | saveCards, addCard, deleteCard, renderCards (board view) |
| 3 · + Card Buttons | `SECTION 3` | Manual card creation via prompt() |
| 4 · Tab Switching | `SECTION 4` | Switches between Story Canvas, Writing, Characters, Arcs tabs |
| 5 · Modal Open/Close | `SECTION 5` | Add Notes modal lifecycle |
| 6 · Modal Mode Toggle | `SECTION 6` | Paste Text vs Upload File |
| 7 · File Upload | `SECTION 7` | Reads .txt .md .docx .pdf .jpg .png |
| 8 · API Key | `SECTION 8` | Saves key to localStorage as sf_api_key |
| 9 · Organize with AI | `SECTION 9` | Main AI feature: notes → Claude → card extraction |
| 10 · Sync Notes | `SECTION 10` | Batch imports story-notes/ folder via FileSystem API |
| 11a · Map Render | `11a` | renderMap() — places cards, sets default positions |
| 11b · Map Dragging | `11b` | makeDraggable() — zoom-aware card drag |
| 11c · Map Connect + SVG | `11c` | startConnect, drawConnections() — bezier SVG lines |
| 12 · Story Summary | `SECTION 12` | generateSummary() — AI overview bar |
| 13 · Claude Chat | `SECTION 13` | sendChatMessage(), chat panel, memory management |
| 14 · Utility Functions | `SECTION 14` | Unsynced tracking, callClaudeForCard(), show/hide panels |
| 14a · Map Panning | `14a` | makeMapPannable() — click+drag to pan canvas |
| 14b · Auto-Organize | `14b` | autoOrganizeMap() — arranges cards in type columns |
| 14c · Combine Cards | `14c` | handleCardSelectForCombine(), showCombinePanel() |

---

## Key Functions

| Function | Line (approx) | What it does |
|---|---|---|
| `addCard(type, title, content)` | ~165 | Creates a card, marks it unsynced, re-renders |
| `deleteCard(id)` | ~180 | Removes card + its connections |
| `renderCards()` | ~190 | Renders board view (5 columns by type) |
| `renderMap()` | ~1043 | Renders map view (absolute-positioned nodes) |
| `makeDraggable(el, id)` | ~1207 | Attaches drag events to a map card |
| `autoOrganizeMap()` | ~1860 | Lays cards in columns, auto-connects within columns |
| `drawConnections()` | ~1296 | Draws SVG bezier curves between connected cards |
| `makeMapPannable()` | ~1818 | Enables click+drag to pan the canvas |
| `applyZoom(zoom)` | ~983 | Scales the canvas and updates scroll area |
| `organizeWithAI()` | ~562 | Sends pasted/uploaded text → Claude → adds cards |
| `buildStoryContext()` | ~1591 | Builds compact AI context (5 full cards + titles) |
| `sendChatMessage()` | ~1617 | Two-call flow: memory summarizer + main response |
| `callClaudeForCard(key, prompt, maxTok)` | ~1790 | Lightweight Claude call (no system prompt) for card actions |
| `generateSummary()` | ~1453 | Sends card titles → Claude → story overview |
| `saveCards()` | ~91 | Persists cards[] to localStorage |
| `saveCardPositions()` | ~1378 | Persists cardPositions{} to localStorage |
| `saveConnections()` | ~1382 | Persists connections[] to localStorage |

---

## localStorage Keys

| Key | Stores |
|---|---|
| `sf_cards` | JSON array of all cards |
| `sf_api_key` | Anthropic API key |
| `sf_positions` | `{ [cardId]: { x, y, w, h } }` map positions |
| `sf_connections` | `[{ id, from, to, auto }]` connection list |
| `sf_zoom` | Map zoom level (0.1–5.0) |
| `sf_unsynced_ids` | JSON array of card IDs not yet organized on map |
| `sf_synced_files` | Filenames already imported via folder sync |
| `sf_summary` | Cached AI-generated story overview |
| `sf_summary_expanded` | Whether the summary bar is expanded |
| `sf_chat_memory` | Compressed chat history (capped at 3,000 chars) |
| `sf_batches` | `[{ id, createdAt, cardCount }]` — one entry per staged AI import batch |
| `sf_dismissed_batches` | JSON array of batch IDs dismissed from the batch strip (B2) |
| `sf_draft_history` | `[{ savedAt, content }]` — up to 10 working-copy snapshots (5c) |

---

## Key Flows

**Add card via AI:**
1. User opens modal → pastes text or uploads file
2. `organizeWithAI()` → sends to Claude (capped at 12,000 chars)
3. Claude returns JSON array of cards
4. Each card: `addCard()` → pushed to `cards[]`, marked in `unsyncedIds`
5. Board re-renders; map shows sync badge

**Switch to map:**
1. `renderMap()` — default positions assigned by type column
2. `applyZoom()` — canvas scaled
3. Scroll reset to `scrollLeft=280, scrollTop=120` (shows left buffer)
4. If unsynced cards: `showMapSyncPanel()`

**Auto-organize map:**
1. `autoOrganizeMap()` — columns: character(400), world(730), arc(1060), quote(1390), idea(1720)
2. Auto-connections created between consecutive cards in same column
3. `renderMap()` called to re-draw
4. Viewport scroll reset to frame layout

**Chat with AI:**
1. `sendChatMessage()` — if history > 20 turns, Call A summarizes oldest 10 → appended to `sf_chat_memory`
2. Call B sends: system prompt + memory + story context (first turn only) + last 20 turns
3. Response streamed into chat panel

---

## Where to Look

| Debugging... | Look at... |
|---|---|
| Cards not saving | `saveCards()`, `addCard()` in Section 2 |
| Map position wrong | `renderMap()` typeOffsets, `autoOrganizeMap()` in 14b |
| Cards going off-screen | `makeDraggable()` boundary in 11b |
| Connections not drawing | `drawConnections()` in 11c |
| AI calls failing | Check api key in Section 8; check DevTools Network tab |
| Too many tokens used | `buildStoryContext()`, `sf_chat_memory` cap in Section 13 |
| File not parsing | `handleFile()` in Section 7 |
| Sync not finding files | `syncStoryNotes()` in Section 10 |
