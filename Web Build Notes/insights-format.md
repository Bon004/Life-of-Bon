# /insights — Format Reference

When the user types `/insights`, generate a structured report in this exact 8-section format.
Read the current card data from context, or ask the user to paste relevant info if needed.

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

## Session Report Rules

Every `/insights` run must produce **two outputs**:
1. A new `session-report-YYYY-MM-DD.html` in `Web Build Notes/session-reports/`
2. An updated `full-project-report.html` in the same folder (add a row to Session History + update the "Last updated" date)

**Immutability:** Each `session-report-YYYY-MM-DD.html` is created once and never modified again. Only `full-project-report.html` is updated over time.

**Same-day second run:** If a `session-report-YYYY-MM-DD.html` already exists for today, ask the user whether to update/append the existing file or create a new file (`session-report-YYYY-MM-DD-2.html`, etc.). Never ask on the first run of a day — just create the file.

**Save path (always):** Detect the active machine by checking the working directory, then save to the matching path:
- **Home machine (esteb):** `C:\Users\esteb\Documents\Story website\Web Build Notes\session-reports\`
- **Work laptop (egarza):** `C:\Users\egarza\Master File for code stuff\Life-of-Bon\Web Build Notes\session-reports\`

Never save to `.claude/usage-data/` or any other location. If a report ends up anywhere else, it is in the wrong place.
