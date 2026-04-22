# /status — Quick Project Orientation

Give a fast orientation to the current state of the Life-of-Bon / StoryForge project. Use this at the start of a session to get up to speed without reading multiple files manually.

## When to Use
At the beginning of a session — especially after switching machines or after a gap of several days.

## Workflow

Run these in parallel:
- `git log --oneline -8` — recent commits
- `git status` — uncommitted changes
- `git branch --show-current` — current branch
- Read the most recent file in `Web Build Notes/session-reports/` (sort by filename descending, pick the first)

Then produce a structured plain-text summary in this format:

---

## StoryForge Status — YYYY-MM-DD

**Branch:** `<branch>` | **Last commit:** `<hash> — <message>`

**Uncommitted changes:** <none / list of files>

### What was built last session
<2–4 bullets from the last session report's sprint title and section 06>

### Resume here
<"Resume here" list from section 09 of the last session report — copy it verbatim if it exists>

### Top open questions
<"Known blockers / open questions" from section 09 — top 2–3 items only>

### Next roadmap items
<From section 08 "Build-side" — top 3 items>

---

Keep the output tight — this is a quick orientation, not a full report. If the last session report doesn't exist yet, note that and pull context from `git log` instead.
