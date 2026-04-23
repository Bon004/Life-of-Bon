# Browser Testing & Event Wiring Rules

- Browser-test every sprint before starting the next one — do not stack untested sprints
- `app.js` is `type="module"` — inline `onclick="fn()"` in HTML silently fails with "fn is not defined"
- Pre-commit audit: grep `index.html` for `onclick` — any match calling a module-scoped function is broken
- All event handlers must be wired with `document.getElementById(...).addEventListener(...)` inside `app.js`
- Trust the user's bug description — inspect the actual failure (check browser Console) before proposing a fix; do not assume things work
