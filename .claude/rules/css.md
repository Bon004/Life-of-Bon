# CSS / Styling Rules

- All colors via CSS variables — look for `--accent`, `--bg`, `--color-*` at the top of `style.css`
- Column colors: blue=character, green=world, purple=arc, amber=quote, red=idea
- Before adding any CSS rule, grep `style.css` for that selector first
- **D1 Design Polish override block lives at ~line 3560** and silently wins over top-level rules — always check there if a style isn't applying
- Cards are inline-editable via `contenteditable="true"` — don't break this with pointer-events or overflow changes
