# /insights — Session Report Generator

Generate an HTML session report for the Life-of-Bon / StoryForge project and save it to `Web Build Notes/session-reports/`.

## When to Use
Run at the end of a coding session to capture what was built, story state, decisions made, and what to do next. This is the primary continuity mechanism between work and home machines.

## Workflow

### Step 1 — Gather context (run all in parallel)
- `git log --oneline -10` — recent commits
- `git diff HEAD~1 --stat` — files changed last commit
- `git status` — uncommitted changes
- Read the most recent session report from `Web Build Notes/session-reports/` — identifies the last sprint label, run number, and open questions

### Step 2 — Determine file name
- Format: `session-report-YYYY-MM-DD.html`
- If a file with that date already exists, append `-2`, `-3`, etc.
- Save to: `Web Build Notes/session-reports/`

### Step 3 — Determine run number
- Check filenames for today's date to calculate the run number (first file = Run 1, second = Run 2, etc.)

### Step 4 — Generate the HTML report

Use the CSS template below (copy it verbatim — do not simplify or modify the styles). Fill in the content sections based on what happened this session.

**Content rules:**
- If a section was not touched this session, use `<p class="na">Not reviewed this session.</p>` — do NOT invent data
- Story sections (01–05) should reflect actual card data if the user imported or edited story content this session
- Section 06 (UI & Feature Progress) must carry forward the full checklist from the previous session report, updating checkboxes for anything completed this session
- Section 09 (Handoff) is the most important section — "Resume here" must be specific and actionable
- Section 10 must include what prompts were actually used, what worked, and what to do differently

## HTML Template

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>StoryForge — Session Report YYYY-MM-DD</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #0b1220;
      --surface: #131a2b;
      --surface-2: #0f172a;
      --border: #1f2a44;
      --text: #e2e8f0;
      --text-strong: #f8fafc;
      --muted: #94a3b8;
      --subtle: #64748b;
      --accent: #60a5fa;
      --accent-soft: rgba(96, 165, 250, 0.12);
      --success: #4ade80;
      --success-soft: rgba(74, 222, 128, 0.10);
      --warn: #fbbf24;
      --warn-soft: rgba(251, 191, 36, 0.10);
      --shadow: 0 1px 0 rgba(255,255,255,0.04), 0 10px 30px rgba(0,0,0,0.35);
      --radius: 12px;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { background: var(--bg); }
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      color: var(--text);
      line-height: 1.7;
      padding: 64px 24px 96px;
      -webkit-font-smoothing: antialiased;
    }
    .container { max-width: 860px; margin: 0 auto; }
    .cover { margin-bottom: 56px; }
    .eyebrow {
      color: var(--accent);
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      margin-bottom: 14px;
    }
    h1 {
      font-size: 36px;
      font-weight: 700;
      color: var(--text-strong);
      letter-spacing: -0.02em;
      line-height: 1.2;
      margin-bottom: 10px;
    }
    .subtitle { color: var(--muted); font-size: 15px; margin-bottom: 22px; max-width: 68ch; }
    .chips { display: flex; flex-wrap: wrap; gap: 8px; }
    .chip {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: var(--surface);
      border: 1px solid var(--border);
      color: var(--muted);
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      padding: 6px 10px;
      border-radius: 999px;
    }
    .chip strong { color: var(--text-strong); font-weight: 600; letter-spacing: 0.02em; text-transform: none; }
    .chip-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--accent); }
    section { margin-bottom: 48px; }
    h2 {
      display: flex;
      align-items: center;
      gap: 14px;
      font-size: 20px;
      font-weight: 600;
      color: var(--text-strong);
      letter-spacing: -0.01em;
      margin-bottom: 18px;
    }
    h2 .num {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      border-radius: 50%;
      background: var(--accent-soft);
      color: var(--accent);
      font-family: 'JetBrains Mono', Consolas, monospace;
      font-size: 12px;
      font-weight: 600;
      letter-spacing: 0;
    }
    .card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 22px 26px;
      box-shadow: var(--shadow);
    }
    .card + .card { margin-top: 12px; }
    p { font-size: 14.5px; color: var(--text); margin-bottom: 12px; }
    p:last-child { margin-bottom: 0; }
    strong { color: var(--text-strong); font-weight: 600; }
    ul { padding-left: 20px; margin-bottom: 12px; }
    ul:last-child { margin-bottom: 0; }
    li { font-size: 14.5px; color: var(--text); margin-bottom: 6px; }
    li::marker { color: var(--subtle); }
    a { color: var(--accent); text-decoration: none; border-bottom: 1px dashed rgba(96,165,250,0.4); }
    a:hover { border-bottom-style: solid; }
    code {
      background: var(--surface-2);
      border: 1px solid var(--border);
      padding: 2px 7px;
      border-radius: 6px;
      font-family: 'JetBrains Mono', Consolas, monospace;
      font-size: 12.5px;
      color: var(--accent);
    }
    .callout {
      border-radius: 10px;
      padding: 14px 18px;
      margin: 14px 0;
      font-size: 14px;
      border: 1px solid transparent;
      border-left-width: 3px;
    }
    .callout.key { background: var(--success-soft); border-color: rgba(74,222,128,0.25); border-left-color: var(--success); color: #bbf7d0; }
    .callout.warn { background: var(--warn-soft); border-color: rgba(251,191,36,0.25); border-left-color: var(--warn); color: #fde68a; }
    .callout strong { color: inherit; }
    .handoff-row { display: flex; gap: 14px; margin-bottom: 8px; font-size: 14px; }
    .handoff-key { font-weight: 600; color: var(--muted); min-width: 130px; letter-spacing: 0.02em; }
    .handoff-val { color: var(--text); flex: 1; }
    .na { color: var(--subtle); font-style: italic; font-size: 13.5px; }
    .footer {
      margin-top: 72px;
      padding-top: 20px;
      border-top: 1px solid var(--border);
      color: var(--subtle);
      font-size: 12px;
      text-align: center;
      letter-spacing: 0.04em;
    }
  </style>
</head>
<body>
<div class="container">

  <header class="cover">
    <div class="eyebrow">StoryForge · Session Report</div>
    <h1><!-- Sprint/session title --></h1>
    <p class="subtitle"><!-- 1–2 sentence summary of what happened this session --></p>
    <div class="chips">
      <span class="chip"><span class="chip-dot"></span><strong>YYYY-MM-DD</strong></span>
      <span class="chip">Run <strong>N</strong></span>
      <span class="chip">Branch <strong><!-- branch name --></strong></span>
      <span class="chip">Commit <strong><!-- short hash --></strong></span>
    </div>
  </header>

  <section>
    <h2><span class="num">01</span>Story Overview</h2>
    <div class="card">
      <!-- Bon's current situation, reincarnation status, key story beats covered this session. If not touched: <p class="na">Not reviewed this session.</p> -->
    </div>
  </section>

  <section>
    <h2><span class="num">02</span>Character Analysis</h2>
    <div class="card">
      <!-- Active characters and their arc status. If not touched: <p class="na">Not reviewed this session.</p> -->
    </div>
  </section>

  <section>
    <h2><span class="num">03</span>Plot &amp; Arc Structure</h2>
    <div class="card">
      <!-- Plot arcs and their progression. If not touched: <p class="na">Not reviewed this session.</p> -->
    </div>
  </section>

  <section>
    <h2><span class="num">04</span>World-Building Status</h2>
    <div class="card">
      <!-- Locations, factions, magic systems. If not touched: <p class="na">Not reviewed this session.</p> -->
    </div>
  </section>

  <section>
    <h2><span class="num">05</span>Writing Progress</h2>
    <div class="card">
      <!-- Word count, scenes written, quotes captured. If not touched: <p class="na">Not reviewed this session.</p> -->
    </div>
  </section>

  <section>
    <h2><span class="num">06</span>UI &amp; Feature Progress</h2>
    <div class="card">
      <ul>
        <!-- Carry forward the full checklist from the previous session report. Mark [x] for completed, [ ] for pending. Add new items at the bottom for things built this session. -->
      </ul>
    </div>
  </section>

  <section>
    <h2><span class="num">07</span>Open Questions &amp; Gaps</h2>
    <div class="card">
      <ul>
        <!-- Unresolved decisions, untested features, known risks -->
      </ul>
    </div>
  </section>

  <section>
    <h2><span class="num">08</span>Recommended Next Actions</h2>
    <div class="card">
      <p><strong>Story-side:</strong></p>
      <ul>
        <!-- Story work to do next -->
      </ul>
      <p><strong>Build-side:</strong></p>
      <ul>
        <!-- Features/sprints to tackle next, in priority order -->
      </ul>
    </div>
  </section>

  <section>
    <h2><span class="num">09</span>Handoff</h2>
    <div class="card">
      <div class="handoff-row"><div class="handoff-key">Branch</div><div class="handoff-val"><code><!-- branch --></code></div></div>
      <div class="handoff-row"><div class="handoff-key">Last commit</div><div class="handoff-val"><code><!-- hash — message --></code></div></div>

      <p style="margin-top:14px;"><strong>Files changed this session:</strong></p>
      <ul>
        <!-- file.ext — what changed and why -->
      </ul>

      <p><strong>Decisions made:</strong></p>
      <ul>
        <!-- <strong>Decision summary.</strong> Why it was made — what was rejected and why. -->
      </ul>

      <p><strong>Resume here:</strong></p>
      <ul>
        <!-- Specific, actionable next steps. Not vague goals — exact tasks. -->
      </ul>

      <p><strong>Known blockers / open questions:</strong></p>
      <ul>
        <!-- Things that will bite the next session if not addressed -->
      </ul>
    </div>
  </section>

  <section>
    <h2><span class="num">10</span>Claude Collaboration Insights</h2>
    <div class="card">
      <p><strong>What I asked Claude to do:</strong></p>
      <ul>
        <!-- Actual prompts/requests made this session -->
      </ul>

      <p><strong>What worked well:</strong></p>
      <ul>
        <!-- Techniques, prompt patterns, agent strategies that were effective -->
      </ul>

      <p><strong>What to do differently:</strong></p>
      <ul>
        <!-- Inefficiencies, wrong turns, things to improve next time -->
      </ul>
    </div>
  </section>

  <div class="footer">Generated by /insights · StoryForge · Life of Bon</div>
</div>
</body>
</html>
```

## Save & Confirm
After writing the file, tell the user:
- The file path it was saved to
- The run number
- What sections were populated vs. marked "not reviewed"
- One-line summary of what's next (from section 08)
