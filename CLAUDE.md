# StoryForge Project Guide

## Project Overview
StoryForge is a web app for organizing your isekai/anime story called "Life of Bon" — where the main character gets reincarnated. It has 4 tabs (Story Canvas, Writing, Characters, Arcs & Timeline) and uses Claude AI to automatically organize your story notes into categorized cards.

## Tech Stack
- **Plain HTML + CSS + JavaScript** (NO frameworks, no build steps)
- **localStorage** for all data persistence (cards, API key)
- **Live Server** for local development (just open the folder and click "Go Live")
- **Anthropic Claude API** called directly from the browser (with `anthropic-dangerous-direct-browser-access` header)
- **Libraries via CDN**: mammoth.js (Word files), PDF.js (PDFs)
- **Model**: claude-sonnet-4-5-20250929

## File Structure
```
storyforge/
├── index.html       # All HTML structure
├── style.css        # All styles (CSS variables)
├── app.js           # All JavaScript logic
├── CLAUDE.md        # This file
└── README.md        # (optional) user documentation
```

## How to Work on This Project

### Local Development
1. Open terminal and navigate to the storyforge folder:
   ```
   cd C:\Users\esteb\Documents\storyforge
   ```
2. Start Live Server:
   ```
   npx live-server
   ```
3. Browser opens automatically to `127.0.0.1:5500`

### Key Data Structure
```javascript
// Each card looks like this:
{
  id:        "a3f9b2",
  type:      "character",  // character | world | arc | quote | idea
  title:     "Bon",
  content:   "Main character who gets reincarnated...",
  createdAt: "2026-04-07T12:00:00Z"
}
```

### Card Types
- **character** → people, beings, named characters
- **world** → locations, places, world rules, magic systems
- **arc** → plot points, story events, narrative arcs
- **quote** → memorable lines or exact dialogue
- **idea** → loose ideas, themes, future plans

## Important Notes

### Styling
- All colors are CSS variables in `style.css` (look for `--accent`, `--bg`, `--color-*`)
- Column colors: blue (character), green (world), purple (arc), amber (quote), red (idea)
- Cards are inline-editable with `contenteditable="true"`

### File Support
- **Text**: .txt, .md
- **Images**: .jpg, .png, .heic (sent as base64 to Claude vision API)
- **Documents**: .docx (via mammoth.js), .pdf (via PDF.js)
- **Paste mode**: plain text input directly

### API Key Storage
- Saved in browser `localStorage` under key `sf_api_key`
- Only shared with Anthropic directly
- Safe for personal use (for production apps, move to server)

### Data Persistence
- All cards saved in `localStorage` under key `sf_cards`
- Automatically saved when added, edited, or deleted
- No server required

## When Editing Code

1. **Always read the file first** before making changes
2. **Keep it simple** — no over-engineering, one feature at a time
3. **Test in browser** before committing
4. **Explain like a beginner** — comments should be clear and helpful
5. **No deleting features** — if something isn't working, debug it instead

## Next Phases (In Order)
1. ✅ Add Notes with AI organization (DONE)
2. Polish homepage design (make it look like "an actual website")
3. Writing tab: chapter editor, word count, auto-save
4. Characters tab: character profile sheets, emoji picker
5. Arcs tab: arc timeline with events
6. Settings/backup: export/import data
7. Mobile refinements for iPad use

## Git Workflow
- Push changes regularly to `https://github.com/Bon004/Life-of-Bon.git`
- Keep `main` branch stable and working
- For big experiments, use branches (`git branch feature-name`)

## Debugging Tips
- Open browser DevTools (`F12`): Console tab shows errors
- Check `localStorage` in DevTools to see saved data
- Test with small files first before uploading large PDFs
- Refresh page (`F5`) if something looks stuck
