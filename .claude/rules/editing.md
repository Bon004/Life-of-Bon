# Code Editing Rules

- Always read the full file before making any changes
- One feature at a time — no over-engineering or abstractions beyond what the task needs
- No new files beyond `index.html`, `style.css`, `app.js`
- No npm packages, webpack, React, or any build tools — plain HTML/JS only
- No `fetch()` for local files — everything runs in-browser
- No deleting features — if something isn't working, debug it instead
- After 2 failed attempts to fix something, stop and explain the problem rather than retrying
- TDD loop for pure functions in `story-utils.js` (write test → fail → implement → pass); manual browser testing only for `app.js` DOM code
- Do not add new `localStorage` keys without listing them in `CODEBASE.md` first
