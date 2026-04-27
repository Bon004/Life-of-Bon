---
name: refresh-wiki
description: Regenerate all story wiki reference pages from source files into story/wiki/
type: skill
---

# /refresh-wiki — Story Wiki Refresh

Regenerate the Life of Bon story wiki from source files. Run this whenever the master document is updated with new canon decisions.

## Source Files (read in this order)
1. `story/Life-of-Bon-FINAL-MASTER-NEW.txt` — primary source, 13 sections, authoritative canon
2. `story/Notes for Master txt file/Life of Bon; Complete Story Bible.txt` — secondary, use only to fill gaps

**Always prefer the master doc over the story bible when they conflict.** The master doc is the final merged version.

## Output Files (overwrite, never append)
Write all 5 pages to `story/wiki/`. Overwrite existing content completely each run.

---

## Page 1: `story/wiki/characters.md`

Cover every named or role-defined character. For each: **Role**, **Arc summary** (what changes about them across the story), **Key traits** (3–5 bullets), **Relationships** (who they connect to and how), **Canon fate** if decided.

Characters to cover:
- Bon (pre-reincarnation Japan identity + post-reincarnation arc)
- Elena (mother)
- Leon (father)
- Best Friend (name TBD — note current status of arc)
- Love Interest (name TBD)
- The Tragic Champion role (note: suspended as of April 2026 — see master doc Section 5)
- Vaela / The Unnamed / She Who Remains

Keep each character block under 25 lines. Scannable bullets, not paragraphs.

---

## Page 2: `story/wiki/timeline.md`

One row/block per story arc. For each arc:
- **Arc name + number**
- **Age range + chapter range** (use master doc figures; note where ranges are estimates)
- **Overarching goal** (one sentence)
- **Key events** (3–6 bullets)
- **Character state at end of arc** (where is Bon emotionally/physically?)

Include the Pre-Reincarnation section (Japan, Ch 1–3) as Arc 0.

---

## Page 3: `story/wiki/world-rules.md`

Sections:
1. **World** — name(s), open decision on Aetheria vs. Eldarion, brief geography note
2. **Magic system** — 4 elemental schools, 5 power levels (use E→D→C→B→A→S for guild ranks — NOT Bronze→Diamond, that system was cut), Battle Aura (Touki), silent casting
3. **Dungeons** — what they are, spatial folding, danger, plot relevance
4. **Guild system** — E→S ranks, purpose
5. **The Demon Lords** — title definition, not villain-coded, one will appear in Bon's story (who/when TBD)
6. **The Seers** — Church of Divine Light inner circle, prejudiced against non-humans, likely misread Vaela's anchors as divine
7. **The 10 Great Monarchs** — brief note, 3 not yet fully locked (Elysia, Soren, Niamh)
8. **Vaela's anchor network** — ancient monuments/standing stones, memory observation, how it works

---

## Page 4: `story/wiki/themes.md`

Sections:
1. **Core themes** — 4 major thematic pillars (connection vs. avoidance, redemption vs. self-hatred, power vs. responsibility, memory/identity/reality)
2. **Philosophical core** — the physical existence vs. consciousness question; why Vaela is wrong
3. **Tone anchors** — the 6 reference works and what each contributes
4. **Bon's internal voice** — the Subaru/Armin quotes that define his self-talk register
5. **Bon's growth arc** — the 4 transformation axes (self-hatred→acceptance, isolation→connection, perfectionism→growth mindset, individual→community)
6. **Narrative techniques** — show-don't-tell implementation, measurable goals structure, emotional pacing

---

## Page 5: `story/wiki/open-questions.md`

Format as a numbered checklist. Two sections:

### Intentional Creative Forks (Section 12)
Unresolved by design — decide when the story demands it, not before.
Pull all 12 items from Section 12. Format each as:
`- [ ] #N — Short description of the open decision`

### Continuity Audit Status (Section 13)
Brief summary only — not the full resolution text.
List resolved items as `- [x] Issue name — RESOLVED` and any deferred items as `- [~] Issue name — DEFERRED (reason)`.

**Perplexity's note on this page:** format for 30-second scanning. Bullets only, no paragraphs.

---

## Format Rules (apply to all pages)
- Max ~300 lines per page — this is a reference layer, not a copy of the source
- Bullets and tables over paragraphs
- Bold key terms
- Add a one-line header comment at top of each file: `<!-- Last refreshed: [date] from Life-of-Bon-FINAL-MASTER-NEW.txt -->`
- If a detail is genuinely TBD in the source, write `TBD` — don't invent canon

## After Writing
Report which pages were written and note any source gaps (things marked TBD in the master doc that you couldn't fill).
