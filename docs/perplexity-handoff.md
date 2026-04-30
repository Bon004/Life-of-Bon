# StoryForge — Perplexity Design Handoff
## Session: 2026-04-30 | Visual Revamp Sprint

---

## WHAT IS THIS APP

StoryForge is a single-page web app for organizing an isekai/anime story ("Life of Bon"). Plain HTML + CSS + JS, no frameworks, no build tools. Runs entirely in-browser, persists everything to localStorage, calls the Anthropic Claude API directly.

**10+ tabs:** Home, Story Canvas (kanban), Writing editor, Characters, Arcs & Timeline, Map, Outline, and more.

**Core feature:** Paste raw story notes or upload a file, Claude AI organizes them into typed cards (Characters, World Building, Plot Arcs, Quotes, Ideas) arranged in columns on a kanban canvas.

**AI assistant:** "Sage" — a sidebar chat panel powered by Claude with ElevenLabs TTS voice output and speech recognition input. The orb UI (animated canvas sphere) is Sage's visual avatar.

---

## CURRENT DEV STATE

- **Last commit:** `6451b7e` — session report 2026-04-30
- **Two sprints built but uncommitted** (pending browser test — can't test voice at work):
  - Sprint O: voice debounce fix, auto-send toggle, Sage pause/resume
  - Sprint P: 429 rate limit friendly error, TTS teardown on error, chat history cap
- **This session's focus:** visual revamp — voice testing blocked at work machine

---

## DESIGN SYSTEM (WHAT'S ALREADY IN PLACE)

### Token system (style.css lines 1–120)
```
Brand palette — OKLCH
--accent:        oklch(58% 0.16 272)   /* indigo */
--bg:            oklch(7.5% 0.009 264) /* near-black, blue-tinted */
--surface:       oklch(11.5% 0.011 264)
--surface-2:     oklch(14.5% 0.013 264)
--surface-3:     oklch(18% 0.015 264)
--border:        oklch(100% 0 0 / 0.07)
--text:          oklch(90% 0.005 264)
--text-muted:    oklch(60% 0.008 264)

Category colors (used via color-mix for card tinting):
  character → blue  (#3b82f6)
  world     → green (#10b981)
  arc       → purple (#8b5cf6)
  quote     → amber (#f59e0b)
  idea      → red   (#ef4444)

Typography:
  --font-ui:  'Inter', system-ui, sans-serif
  --font-lit: 'Lora', Georgia, serif   (used for headings)

Spacing/motion:
  --radius: 8px  |  --radius-lg: 12px
  --transition: 0.16s ease
  --ease-out: cubic-bezier(0.22, 1, 0.36, 1)
  --ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1)
```

### D1 Design Polish block (style.css ~line 3951)
The override block that polishes everything. Key things already done in Sprint M + D1:
- OKLCH token system (replaced old hex/rgba)
- Card shadow + cardIn entrance animation (fade up + scale from 0.97)
- Tab panel panelIn animation (0.24s ease-out)
- Column background tint gradients per type (8% opacity)
- Accent buttons: solid fill, glow hover ring (no gradient, no glass)
- Focus rings: accent glow instead of browser default
- Chat panel header: raised surface gradient
- Writing pane: deeper canvas bg (#09091a), box-shadow editor
- `background-clip: text` explicitly unset on .app-title (no gradient text)

**Key rule:** The D1 block at line 3951 silently wins over earlier rules. Always grep there first if a style isn't applying.

---

## WHAT'S STILL PENDING (DESIGN ROADMAP)

From the roadmap (`docs/roadmaps/roadmap-future-features.html`):

| Item | Status |
|------|--------|
| D3: Branding & logo area — gradient wordmark, icon, topbar distinction | Not started |
| Orb Speaking visual — wave ripple particle displacement | Not started (state machine wired, visual not coded) |
| Ambient chat UI — ephemeral full-screen conversational layout replacing 310px sidebar | Not started |
| /impeccable formal critique | Just completed — see below |

---

## /IMPECCABLE FORMAL CRITIQUE — 2026-04-30

This is a two-assessment audit run today using the /impeccable skill (LLM design review + deterministic CLI scan).

### AI Slop Verdict: CLEAN

Zero AI cliche patterns detected:
- No purple/neon gradients anywhere
- No glassmorphism cards (backdrop-blur used only for functional modal layering)
- No aurora backgrounds
- No gradient text (background-clip: text explicitly unset in D1 block)
- No identical card grids (cards are typed with subtle color mixing)
- No hero-metric layouts

Assessment: someone looking at this would not immediately say "AI made that." The design avoids all the 2023-2024 SaaS telltales.

---

### Design Health Score (Nielsen's 10 Heuristics)

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3.5/4 | AI operations lack persistent in-viewport progress indicator |
| 2 | Match System / Real World | 3/4 | Emoji symbols over text labels — assumes cultural familiarity |
| 3 | User Control and Freedom | 3.5/4 | Undo/archive exist; keyboard shortcuts invisible to user |
| 4 | Consistency and Standards | 3.5/4 | Button styles consistent; padding/sizing not on a grid |
| 5 | Error Prevention | 3/4 | Import confirms; unsaved-changes close prevention missing |
| 6 | Recognition Rather Than Recall | 2.5/4 | Power features (spotlight, re-organize) hidden until hover; emoji-reliant |
| 7 | Flexibility and Efficiency | 3.5/4 | Power features exist; no keyboard shortcuts or command palette |
| 8 | Aesthetic and Minimalist Design | 4/4 | Strongest point — disciplined, dark, zero decorative noise |
| 9 | Error Recovery | 2.5/4 | Draft history exists; no card trash/undo; recovery assumes prior export |
| 10 | Help and Documentation | 1.5/4 | Sparse tooltips, no onboarding, API key setup buried |
| **Total** | | **30.5/40** | **B+ — Functional, not exceptional** |

---

### Automated CLI Scan Findings

Ran `npx impeccable --json index.html`. Found 6 issues across 3 patterns:

| Pattern | Count | Detail |
|---------|-------|--------|
| `tiny-text` | 4 | 11px and 11.52px text found (likely labels, timestamps, badges) |
| `overused-font` | 1 | Inter flagged as overused — partially a false positive (it's paired with Lora serif) |
| `skipped-heading` | 1 | h1 "StoryForge" followed by h3 "Add Notes" with no h2 in between |

No glass, gradients, neon, or hero-metric patterns found by the automated scan.

---

### What's Working (3 strong points)

1. **Typography hierarchy** — Lora serif for headings creates authority. Inter is clean. Weights are disciplined (400/500/600/700 only). The system reads well.
2. **Card micro-interactions** — subtle lift (translateY -2px) + shadow expansion on hover at 0.16s ease. Category color mixing at 7% opacity gives visual structure without noise. This is crafted detail.
3. **OKLCH color system** — perceptually uniform, forward-thinking. Category colors (blue/green/purple/amber/red) are distinct without clashing. Accent is used sparingly.

---

### Priority Issues (ordered by impact)

**[P2] Keyboard shortcut visibility**
- Problem: Esc, Ctrl+Z, F11, and other shortcuts exist but are only in `title` attributes. Users at 2 AM won't discover them.
- Fix: Visible `?` button (bottom-right) that shows a keyboard shortcut cheat sheet.

**[P2] Mobile type hierarchy collapse**
- Problem: On mobile (375px), .home-title and .home-subtitle converge to a <1.15x ratio. Hierarchy collapses.
- Fix: In @media (max-width: 768px), increase contrast between heading and subtitle sizes.

**[P2] AI feature discoverability**
- Problem: "Organize with AI" doesn't explain what it does. Power features (column spotlight ⊙, re-organize ↻) hidden behind hover. New users won't find them.
- Fix: Inline (?) tooltips on AI actions. First-use highlight on hidden features.

**[P3] Writing editor line length**
- Problem: Writing editor has no max-width — on a wide monitor a line can be 180+ characters.
- Fix: Set max-width: 65ch or ~700px on the editor container.

**[P3] Heading hierarchy skip (accessibility)**
- Problem: h1 "StoryForge" → h3 "Add Notes" with no h2. Breaks screen reader document outline.
- Fix: Add an h2 between them, or reclassify the h3.

---

### Minor Observations

- Inconsistent button sizes: .btn-add-card is 24x24px (square), .btn-sync-notes is 7px vertical with variable width. Could align to a 32px or 40px grid.
- Modal animation uses cubic-bezier(0.34, 1.4, 0.64, 1) — slight overshoot/bounce. The shared ease-out tokens (0.22, 1, 0.36, 1) would be more consistent.
- No prefers-reduced-motion support detected for the orb canvas animation.
- No CSS [hidden] { display: none !important; } global guard — recommended two sessions ago to prevent CSS specificity traps on modals.

---

### Provocative Questions from the Audit

1. **Why emoji in the header instead of custom icons?** "📦 Archive" assumes users recognize a cardboard box. Would SVG icons (or even text labels) be more legible across platforms?
2. **Is the kanban column metaphor the best fit for a solo writer?** It's well-executed, but have you considered timeline or mind-map alternatives? The map view hints at this.
3. **Does always-visible Sage encourage AI dependency over actual writing?** Is there a philosophy about when AI should be offered vs. gated?

---

### Overall Grade: B+ (83/100)

A production-ready tool for serious writers that avoids AI design clichés. Strong visual discipline, good micro-interactions, sophisticated color system. Falls short on discoverability, mobile experience, and onboarding.

**Biggest opportunity:** The app is better than it appears to a new user. It has power features (column spotlight, voice I/O, distraction-free mode, batch archive) that users won't find on their own. Solving discoverability without adding visual noise is the core design challenge.

---

## WHAT WE WANT FROM YOU (PERPLEXITY)

We're about to run a focused visual polish sprint in Claude design. Based on the audit above:

1. **Prioritization:** Given a dark-themed writing tool with these specific audit findings (B+ score, strong aesthetic but weak discoverability and mobile hierarchy), what should we tackle first for the highest ROI? We're thinking: (a) discoverability/onboarding polish, (b) mobile type fixes, (c) topbar/branding upgrade (D3), or (d) something the audit missed.

2. **Design direction for the topbar (D3):** The brief says "gradient wordmark, icon, topbar distinction." But PRODUCT.md explicitly bans gradient text. What's a strong, non-cliche way to give the topbar more visual identity and authority without hitting the anti-references (no neon, no glass, no startup SaaS aesthetic)?

3. **OKLCH token expansion:** We're working inside an existing OKLCH system. If we want to add warmth or more personality without breaking the system, what are the common traps and high-quality patterns for extending an OKLCH palette?

4. **Anything the audit missed?** Given the product context (solo writer, late night, serious creative work), what are we not seeing?

---

*Generated by /impeccable critique + /status | StoryForge | Life of Bon | 2026-04-30*
