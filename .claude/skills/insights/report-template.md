# /insights — Report Template (10 sections)

Fill every section. Use concrete values — no "TBD" unless data is genuinely unavailable.

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

### 9. Handoff
**Branch:** `[git branch name]`
**Last commit:** `[SHA] — [commit message]`

**Files changed or created this session:**
- `path/to/file.js` — [one-line reason]

**Decisions made this session:**
- [Decision]: [why — what alternative was rejected]

**Resume here:**
1. [First concrete action to take next session]
2. [Second action, if any]
3. [Third action, if any]

**Known blockers or open questions:**
- [Anything unresolved that the next session needs to know before starting]

### 10. Claude Collaboration Insights
Reflect on *this session only*.

**What I asked Claude to do:**
- [1-line summary per request]

**What worked well:**
- [Approach, tool, or pattern that produced a clean result]

**What needed correction:**
- [Where Claude went off-track and how it was redirected]

**Patterns worth repeating:**
- [Tool / skill / workflow combinations to reuse]

**Candidates to persist into CLAUDE.md or memory:**
- [Preferences or rules that should survive to future sessions]
```
