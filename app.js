// ============================================================
// app.js — StoryForge: all the logic
// ============================================================
//
// TABLE OF CONTENTS
// ─────────────────────────────────────────────────────────────
//  Section 1  · Card Data         — loads cards from localStorage
//  Section 2  · Card Helpers      — saveCards, addCard, deleteCard, renderCards
//  Section 3  · + Card Buttons    — manual add via prompt()
//  Section 4  · Tab Switching     — switches between the 4 main tabs
//  Section 5  · Modal Open/Close  — Add Notes modal lifecycle
//  Section 6  · Modal Mode Toggle — Paste Text vs Upload File
//  Section 7  · File Upload       — reads .txt .md .docx .pdf .jpg .png
//  Section 8  · API Key           — saves key to localStorage
//  Section 9  · Organize with AI  — sends notes → Claude → extracts cards
//  Section 10 · Sync Notes        — batch syncs story-notes/ folder
//  Section 11 · Map View          — drag, zoom, connect, resize, SVG lines
//  Section 12 · Story Summary     — AI-generated overview bar
//  Section 13 · Claude Chat       — writing assistant panel
// ─────────────────────────────────────────────────────────────


// ============================================================
// SECTION 1: CARD DATA
// ─────────────────────────────────────────────────────────────
// What it does: Initializes all persistent state by reading from
// localStorage. This runs once when the page loads.
//
// Reads:  localStorage keys: sf_cards, sf_api_key, sf_positions,
//         sf_connections, sf_zoom
// Writes: populates cards[], cardPositions{}, connections[],
//         apiKey, mapZoom
// ============================================================

let cards = [];

try {
  const saved = localStorage.getItem('sf_cards');
  cards = saved ? JSON.parse(saved) : [];
} catch (e) {
  cards = [];
}

let apiKey = localStorage.getItem('sf_api_key') || '';

// Map view: card positions and connection lines
let cardPositions = {};
let connections    = [];
let viewMode       = 'board'; // 'board' or 'map'
let connectingFrom = null;    // cardId we're connecting FROM

try { cardPositions = JSON.parse(localStorage.getItem('sf_positions') || '{}'); } catch(e) {}
try { connections   = JSON.parse(localStorage.getItem('sf_connections') || '[]'); } catch(e) {}

// Map zoom level (0.1 = very far out, 5.0 = very zoomed in)
var mapZoom = parseFloat(localStorage.getItem('sf_zoom') || '1.0');

// Selection state for the combine-two-cards flow
var selectedCardsForCombine = [];
var wasDragging = false;

// Track new/edited cards not yet organized on the map
var unsyncedIds = new Set();
try {
  var _savedUnsynced = JSON.parse(localStorage.getItem('sf_unsynced_ids') || '[]');
  unsyncedIds = new Set(_savedUnsynced);
} catch(e) { unsyncedIds = new Set(); }

// Color lookup for each card type
const TYPE_COLORS = {
  character: '#3b82f6',
  world:     '#10b981',
  arc:       '#8b5cf6',
  quote:     '#f59e0b',
  idea:      '#ef4444'
};

// The Claude model used for all API calls. Update here to upgrade globally.
const CLAUDE_MODEL = 'claude-sonnet-4-5-20250929';

// Valid card types accepted by the app. Used for validating AI responses.
const VALID_CARD_TYPES = ['character', 'world', 'arc', 'quote', 'idea'];

// ============================================================
// SECTION 2: CARD HELPER FUNCTIONS
// ─────────────────────────────────────────────────────────────
// What it does: Core CRUD operations for cards. All changes go
// through saveCards() which persists to localStorage immediately.
//
// Reads:  cards[] array
// Writes: localStorage sf_cards, re-renders DOM via renderCards()
// Entry:  addCard(), deleteCard() are called throughout
// ============================================================

// saveCards: turns our cards array into a text string and stores it
function saveCards() {
  localStorage.setItem('sf_cards', JSON.stringify(cards));
}

// generateId: makes a random short ID like "a3f9b2" for each card
function generateId() {
  return Math.random().toString(36).slice(2, 8);
}

// escapeHtml: converts special characters so they're safe to put inside innerHTML
function escapeHtml(str) {
  return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// buildPrompt: returns the Claude prompt for the "Organize with AI" button
function buildPrompt(existingTitles) {
  const skipLine = existingTitles && existingTitles.length > 0
    ? 'Skip anything matching these already-existing titles: ' + existingTitles.join(', ') + '.'
    : '';
  return [
    'You are a story organization assistant. Read the notes below and extract story elements.',
    'Return a JSON array of objects. Each object must have exactly these fields:',
    '  "type"    — one of: character, world, arc, quote, idea',
    '  "title"   — short name or label (max 6 words)',
    '  "content" — 1-3 sentence description',
    '',
    'IMPORTANT: Spread cards across ALL 5 types where the material supports it:',
    '  character = people, beings, named characters',
    '  world     = locations, lore, magic systems, world rules',
    '  arc       = plot beats, story events, narrative arcs',
    '  quote     = memorable dialogue or lines',
    '  idea      = themes, concepts, future plans',
    '',
    skipLine,
    'Return only the JSON array, nothing else.'
  ].filter(Boolean).join('\n');
}

// buildSyncPrompt: same as buildPrompt but used for the Sync Notes batch job
function buildSyncPrompt(existingTitles) {
  const skipLine = existingTitles && existingTitles.length > 0
    ? 'Skip anything matching these already-existing titles: ' + existingTitles.join(', ') + '.'
    : '';
  return [
    'You are a story organization assistant. Read the content below and extract story elements.',
    'IMPORTANT: If the content is NOT related to a story, characters, plot, or worldbuilding, return an empty array [].',
    'Return a JSON array of objects. Each object must have exactly these fields:',
    '  "type"    — one of: character, world, arc, quote, idea',
    '  "title"   — short name or label (max 6 words)',
    '  "content" — 1-3 sentence description',
    '',
    'IMPORTANT: Spread cards across ALL 5 types where the material supports it:',
    '  character = people, beings, named characters',
    '  world     = locations, lore, magic systems, world rules',
    '  arc       = plot beats, story events, narrative arcs',
    '  quote     = memorable dialogue or lines',
    '  idea      = themes, concepts, future plans',
    '',
    skipLine,
    '- Maximum 15 new cards per file',
    'Return only the JSON array, nothing else.'
  ].filter(Boolean).join('\n');
}

// addCard: creates a new card object and adds it to the cards array
function addCard(type, title, content) {
  const card = {
    id:        generateId(),
    type:      type,
    title:     title || 'Untitled',
    content:   content || '',
    createdAt: new Date().toISOString()
  };
  cards.push(card);
  saveCards();
  unsyncedIds.add(card.id);
  saveUnsyncedIds();
  renderCards();
}

// deleteCard: removes a card by its id
function deleteCard(id) {
  cards = cards.filter(function(c) { return c.id !== id; });
  saveCards();
  renderCards();
}

// renderCards: redraws all cards — both board view and map view (if active)
function renderCards() {
  VALID_CARD_TYPES.forEach(function(type) {
    const col = document.getElementById('cards-' + type);
    col.innerHTML = ''; // clear the column

    // Get only the cards that belong to this column
    const colCards = cards.filter(function(c) { return c.type === type; });

    // Update count badge
    const countEl = document.getElementById('count-' + type);
    if (countEl) countEl.textContent = colCards.length;

    if (colCards.length === 0) {
      col.innerHTML = '<p class="col-empty">No cards yet — click + to add one.</p>';
      return;
    }

    // Build an HTML element for each card
    colCards.forEach(function(card) {
      const el = document.createElement('div');
      el.className = 'story-card';

      // We use contenteditable="true" so clicking a card makes it editable
      el.innerHTML =
        '<button class="card-delete" data-id="' + card.id + '" title="Delete">✕</button>' +
        '<div class="card-title" contenteditable="true" data-id="' + card.id + '" data-field="title">' + escapeHtml(card.title) + '</div>' +
        '<div class="card-content" contenteditable="true" data-id="' + card.id + '" data-field="content">' + escapeHtml(card.content) + '</div>';

      col.appendChild(el);
    });
  });

  // Also re-render map if that view is active
  if (viewMode === 'map') renderMap();

  // After rendering, attach event listeners to the new elements

  // Delete button listeners
  document.querySelectorAll('.card-delete').forEach(function(btn) {
    btn.addEventListener('click', function() {
      deleteCard(btn.getAttribute('data-id'));
    });
  });

  // Inline edit listeners: when you click away from an editable field, save the change
  document.querySelectorAll('[contenteditable="true"]').forEach(function(el) {
    el.addEventListener('blur', function() {
      const id    = el.getAttribute('data-id');
      const field = el.getAttribute('data-field');
      const card  = cards.find(function(c) { return c.id === id; });
      if (card) {
        var newVal = el.textContent.trim();
        if (card[field] !== newVal) {
          card[field] = newVal;
          saveCards();
          unsyncedIds.add(id);
          saveUnsyncedIds();
        }
      }
    });
  });
}


// ============================================================
// SECTION 3: "+ Card" BUTTONS (manual add)
// ─────────────────────────────────────────────────────────────
// What it does: Attaches click listeners to the + button at
// the top of each board column. Uses browser prompt() to ask
// for a title, then calls addCard().
//
// Entry:  .btn-add-card click → prompt → addCard()
// ============================================================

document.querySelectorAll('.btn-add-card').forEach(function(btn) {
  btn.addEventListener('click', function() {
    // Find which column this button belongs to
    const col  = btn.closest('.canvas-col');
    const type = col.getAttribute('data-type');

    // Ask the user for a title with a browser prompt
    const title = prompt('Card title:');
    if (title && title.trim()) {
      addCard(type, title.trim(), '');
    }
  });
});


// ============================================================
// SECTION 4: TAB SWITCHING
// ─────────────────────────────────────────────────────────────
// What it does: Manages the 4 top tabs (Story Canvas, Writing,
// Characters, Arcs). Shows the matching panel by toggling the
// 'active' class.
//
// Entry:  .tab-btn click → hides all panels → shows panel-{tab}
// ============================================================

const tabButtons = document.querySelectorAll('.tab-btn');
const tabPanels  = document.querySelectorAll('.tab-panel');

tabButtons.forEach(function(button) {
  button.addEventListener('click', function() {
    const targetTab = button.getAttribute('data-tab');

    // Remove 'active' from all tabs and panels
    tabButtons.forEach(function(b) { b.classList.remove('active'); });
    tabPanels.forEach(function(p)  { p.classList.remove('active'); });

    // Add 'active' to the clicked tab and its matching panel
    button.classList.add('active');
    const panel = document.getElementById('panel-' + targetTab);
    if (panel) panel.classList.add('active');
  });
});


// ============================================================
// SECTION 5: MODAL — OPEN & CLOSE
// ─────────────────────────────────────────────────────────────
// What it does: Controls the "Add Notes" modal. Opens on button
// click, closes via X button, clicking outside, or pressing ESC.
// Also clears form state when closed.
//
// Entry:  #openNotesModal click → show modal
//         #closeNotesModal / ESC / backdrop click → closeModal()
// ============================================================

const notesModal    = document.getElementById('notesModal');
const openNotesBtn  = document.getElementById('openNotesModal');
const closeNotesBtn = document.getElementById('closeNotesModal');

openNotesBtn.addEventListener('click', function() {
  notesModal.classList.remove('hidden');
  // If we already have an API key saved, open the key section to show it's set
  if (apiKey) {
    document.getElementById('apiKeyInput').value = apiKey;
  }
});

closeNotesBtn.addEventListener('click', closeModal);

// Click the dark background outside the modal → close it
notesModal.addEventListener('click', function(e) {
  if (e.target === notesModal) closeModal();
});

// ESC key also closes the modal
document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') closeModal();
});

function closeModal() {
  notesModal.classList.add('hidden');
  document.getElementById('pasteText').value = '';
  clearFileSelection();
  setModalStatus('');
}


// ============================================================
// SECTION 6: MODAL MODE TOGGLE (Paste Text vs Upload File)
// ─────────────────────────────────────────────────────────────
// What it does: Switches between the two input modes inside
// the Add Notes modal. Only one mode panel is visible at a time.
//
// Entry:  .mode-btn click → toggles active class on btn + panel
// ============================================================

const modeBtns   = document.querySelectorAll('.mode-btn');
const modePanels = document.querySelectorAll('.mode-panel');

modeBtns.forEach(function(btn) {
  btn.addEventListener('click', function() {
    const mode = btn.getAttribute('data-mode');

    modeBtns.forEach(function(b)   { b.classList.remove('active'); });
    modePanels.forEach(function(p) { p.classList.remove('active'); });

    btn.classList.add('active');
    document.getElementById('mode-' + mode).classList.add('active');
  });
});


// ============================================================
// SECTION 7: FILE UPLOAD & READING
// ─────────────────────────────────────────────────────────────
// What it does: Handles drag-and-drop and "Browse Files" file
// selection. Reads the file into memory based on its type:
//   .txt/.md   → plain text (FileReader)
//   .jpg/.png  → base64 image (for Claude vision API)
//   .docx      → plain text extracted via mammoth.js
//   .pdf       → plain text extracted via PDF.js
// The result is stored in fileContent{} until the user clicks
// "Organize with AI".
//
// Reads:  file from <input type="file"> or drag-and-drop
// Writes: fileContent = { type, text } or { type, base64, mediaType }
// Entry:  fileInput change / dropZone drop → handleFile(file)
// ============================================================

let fileContent = null; // holds the file contents after reading

const fileInput   = document.getElementById('fileInput');
const dropZone    = document.getElementById('dropZone');
const filePreview = document.getElementById('filePreview');
const fileNameEl  = document.getElementById('fileName');

// When user picks a file via the "Browse Files" button
fileInput.addEventListener('change', function() {
  if (fileInput.files[0]) handleFile(fileInput.files[0]);
});

// Drag & drop events
dropZone.addEventListener('dragover', function(e) {
  e.preventDefault(); // needed to allow dropping
  dropZone.classList.add('drag-over');
});

dropZone.addEventListener('dragleave', function() {
  dropZone.classList.remove('drag-over');
});

dropZone.addEventListener('drop', function(e) {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
});

// "✕ Remove" button clears the selected file
document.getElementById('clearFile').addEventListener('click', clearFileSelection);

function clearFileSelection() {
  fileContent = null;
  fileInput.value = '';
  filePreview.classList.add('hidden');
  dropZone.classList.remove('hidden');
}

// handleFile: decides how to read the file based on its extension
function handleFile(file) {
  const name = file.name.toLowerCase();
  setModalStatus('Reading file...');

  if (name.endsWith('.txt') || name.endsWith('.md')) {
    readAsText(file);

  } else if (name.endsWith('.docx')) {
    readAsDocx(file);

  } else if (
    name.endsWith('.jpg') || name.endsWith('.jpeg') ||
    name.endsWith('.png') || name.endsWith('.heic')
  ) {
    readAsImage(file);

  } else if (name.endsWith('.pdf')) {
    readAsPdf(file);

  } else {
    setModalStatus('Unsupported file type. Please use .txt .md .jpg .png .heic or .docx');
    return;
  }

  // Show the file name in the preview row
  fileNameEl.textContent = '📄 ' + file.name;
  filePreview.classList.remove('hidden');
  dropZone.classList.add('hidden');
}

// readAsText: reads .txt and .md files
function readAsText(file) {
  const reader = new FileReader();
  reader.onload = function(e) {
    fileContent = { type: 'text', text: e.target.result };
    setModalStatus('File ready! Click "Organize with AI" to continue.');
  };
  reader.readAsText(file);
}

// readAsImage: reads image files as base64 (the format Claude understands)
function readAsImage(file) {
  const reader = new FileReader();
  reader.onload = function(e) {
    // e.target.result looks like: "data:image/jpeg;base64,/9j/4AAQ..."
    const base64    = e.target.result.split(',')[1]; // just the base64 part
    const mediaType = file.type || 'image/jpeg';
    fileContent = { type: 'image', base64: base64, mediaType: mediaType };
    setModalStatus('Image ready! Click "Organize with AI" to continue.');
  };
  reader.readAsDataURL(file);
}

// readAsDocx: reads Word documents using the mammoth.js library
function readAsDocx(file) {
  if (typeof mammoth === 'undefined') {
    setModalStatus('Word doc reader not loaded yet. Please refresh the page and try again.');
    return;
  }
  const reader = new FileReader();
  reader.onload = function(e) {
    mammoth.extractRawText({ arrayBuffer: e.target.result })
      .then(function(result) {
        fileContent = { type: 'text', text: result.value };
        setModalStatus('Word doc ready! Click "Organize with AI" to continue.');
      })
      .catch(function() {
        setModalStatus('Could not read Word doc. Please paste the text in the "Paste Text" tab instead.');
      });
  };
  reader.readAsArrayBuffer(file);
}


// readAsPdf: reads PDF files using the PDF.js library
async function readAsPdf(file) {
  if (typeof pdfjsLib === 'undefined') {
    setModalStatus('PDF reader not loaded. Please refresh the page and try again.');
    return;
  }

  // Point PDF.js to its worker file (needed for it to work)
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

  try {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

    let text = '';
    // Loop through every page and pull out the text
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      text += content.items.map(function(item) { return item.str; }).join(' ') + '\n';
    }

    fileContent = { type: 'text', text: text };
    setModalStatus('PDF ready! Click "Organize with AI" to continue.');
  } catch (err) {
    setModalStatus('Could not read PDF. Try a different file or paste the text instead.');
  }
}


// ============================================================
// SECTION 8: API KEY MANAGEMENT
// ─────────────────────────────────────────────────────────────
// How the key is stored and loaded (3-tier priority):
//
//   1. Local file (api-key.txt in the project folder)
//      - Fetched automatically at startup via Live Server
//      - Gitignored — safe from commits
//      - Best for "set it and forget it" use
//
//   2. Browser localStorage (key: sf_api_key)
//      - Saved whenever the user clicks Save in the modal
//      - Persists between browser sessions
//      - Falls back when the file isn't present
//
//   3. Manual entry
//      - User pastes key into the modal input
//      - Saved to localStorage (and optionally overwrites the txt file)
//
// Security note: the key lives only on your machine (localhost).
// Other websites cannot read your localhost files or localStorage
// due to the browser's same-origin policy. The key is never
// hardcoded in source files and is gitignored.
//
// Entry: initApiKeyUx() → called at startup
//        #saveApiKey click → saves key → updates UI
//        #clearKeyBtn click → removes from localStorage → shows banner
// ============================================================

// initApiKeyUx: runs at startup. Tries to load the key from the local file
// first, then falls back to localStorage. Updates all UI accordingly.
async function initApiKeyUx() {
  let key = '';

  // --- Step 1: Try to fetch from api-key.txt ---
  // Only fetches if localStorage doesn't already have a valid key,
  // so returning users skip the network request entirely.
  const cached = localStorage.getItem('sf_api_key') || '';
  if (cached) {
    key = cached;
    apiKey = key;
  } else {
    try {
      const resp = await fetch('api-key.txt');
      if (resp.ok) {
        const text = (await resp.text()).trim();
        if (text.startsWith('sk-')) {
          key = text;
          apiKey = key;
          // Mirror to localStorage so the key works even if the file is moved later
          localStorage.setItem('sf_api_key', key);
        }
      }
    } catch (_) {
      // File not found or Live Server not running — silently fall through
    }
  }

  // --- Step 3: Update the UI to reflect what we found ---
  updateKeyStatusUi(key);

  // Banner → open modal focused on the key section
  document.getElementById('noKeyBannerBtn').addEventListener('click', function() {
    document.getElementById('notesModal').classList.remove('hidden');
    document.getElementById('apiKeyDetails').open = true;
    // Small delay lets the modal's display transition complete before focusing
    setTimeout(function() { document.getElementById('apiKeyInput').focus(); }, 80);
  });

  // Clear button → remove from localStorage and show banner
  document.getElementById('clearKeyBtn').addEventListener('click', clearApiKey);
}

// updateKeyStatusUi: updates the summary chip, banner, input, and clear button
// based on whether a key is currently available.
function updateKeyStatusUi(key) {
  const chip     = document.getElementById('keyStatusChip');
  const banner   = document.getElementById('noKeyBanner');
  const input    = document.getElementById('apiKeyInput');
  const clearBtn = document.getElementById('clearKeyBtn');

  if (key) {
    const masked = '···' + key.slice(-4); // last 4 chars so user can verify which key is active
    chip.textContent = '✓ active (' + masked + ')';
    chip.classList.add('has-key');
    banner.classList.add('hidden');
    input.value = key; // pre-fill so the user can see/edit the current key
    clearBtn.classList.remove('hidden');
  } else {
    chip.textContent = '— click to set';
    chip.classList.remove('has-key');
    banner.classList.remove('hidden');
    input.value = '';
    clearBtn.classList.add('hidden');
  }
}

// clearApiKey: removes the saved key from localStorage and resets the UI.
function clearApiKey() {
  apiKey = '';
  localStorage.removeItem('sf_api_key');
  updateKeyStatusUi('');
  setModalStatus('🗑️ Saved key removed. Enter a new one above.');
  document.getElementById('apiKeyDetails').open = true;
}

// Save button: validate and persist the key the user typed in the modal
document.getElementById('saveApiKey').addEventListener('click', function() {
  const key = document.getElementById('apiKeyInput').value.trim();
  if (!key) {
    setModalStatus('⚠️ Paste your API key first.');
    return;
  }
  if (!key.startsWith('sk-')) {
    setModalStatus('⚠️ That doesn\'t look like an Anthropic key (should start with sk-).');
    return;
  }
  apiKey = key;
  localStorage.setItem('sf_api_key', key);
  updateKeyStatusUi(key);
  setModalStatus('✅ API key saved!');
});


// getApiKey: returns the active Anthropic API key from memory or localStorage.
// Centralizes the repeated pattern: apiKey || localStorage.getItem('sf_api_key')
function getApiKey() {
  return apiKey || localStorage.getItem('sf_api_key') || '';
}

// getExistingTitles: returns lowercase list of all current card titles.
// Used to prevent Claude from creating duplicate cards.
function getExistingTitles() {
  return cards.map(function(c) { return c.title.toLowerCase(); });
}

// ============================================================
// SECTION 9: ORGANIZE WITH AI
// ─────────────────────────────────────────────────────────────
// What it does: The main AI feature. Takes whatever the user
// pasted or uploaded, sends it to Claude with a structured
// prompt, and parses the JSON response into cards on the board.
//
// Reads:  pasteText value, fileContent{}, apiKey
// Writes: new cards via addCard() → saves to localStorage
// Entry:  #organizeBtn click → organizeWithAI()
// ============================================================

document.getElementById('organizeBtn').addEventListener('click', organizeWithAI);

async function organizeWithAI() {

  // --- Get and validate the API key ---
  const key = document.getElementById('apiKeyInput').value.trim() || apiKey;
  if (!key) {
    // Open the API key section so the user sees where to enter it
    document.getElementById('apiKeyDetails').open = true;
    setModalStatus('⚠️ Please enter your Anthropic API key first.');
    return;
  }
  // Save the key so it's remembered
  apiKey = key;
  localStorage.setItem('sf_api_key', key);

  // --- Figure out which mode is active and get the content ---
  const activeMode = document.querySelector('.mode-btn.active').getAttribute('data-mode');
  const pasteText  = document.getElementById('pasteText').value.trim();

  if (activeMode === 'paste' && !pasteText) {
    setModalStatus('⚠️ Please paste some text first.');
    return;
  }
  if (activeMode === 'upload' && !fileContent) {
    setModalStatus('⚠️ Please select a file first.');
    return;
  }

  // --- Collect existing card titles so we can skip duplicates ---
  // We pass these to Claude and ask it not to repeat what's already there
  const existingTitles = getExistingTitles();

  // --- Build the prompt we'll send to Claude ---
  const prompt = buildPrompt(existingTitles);

  // --- Build the message content for the API ---
  // For text: just append the notes to the prompt
  // For images: send image + prompt as separate parts
  let messageContent;

  if (activeMode === 'paste') {
    var text = pasteText.length > 12000
      ? (showToast('Note: text trimmed to ~12,000 chars for processing', 4000), pasteText.slice(0, 12000))
      : pasteText;
    messageContent = prompt + '\n\nContent to organize:\n' + text;

  } else if (fileContent.type === 'text') {
    var fileText = fileContent.text.length > 12000
      ? (showToast('Note: file trimmed to ~12,000 chars for processing', 4000), fileContent.text.slice(0, 12000))
      : fileContent.text;
    messageContent = prompt + '\n\nContent to organize:\n' + fileText;

  } else {
    // Image: Claude can see images when we send them as base64
    messageContent = [
      {
        type: 'image',
        source: {
          type:       'base64',
          media_type: fileContent.mediaType,
          data:       fileContent.base64
        }
      },
      {
        type: 'text',
        text: prompt + '\n\nPlease read the image above and extract story elements.'
      }
    ];
  }

  // --- Show loading state ---
  setModalStatus('⏳ Sending to Claude AI...');
  document.getElementById('organizeBtn').disabled = true;

  try {
    // --- Call the Anthropic API ---
    // We send a fetch() request directly to Anthropic's server.
    // The header 'anthropic-dangerous-direct-browser-access' tells Anthropic
    // we know what we're doing — normally API keys should be on a server,
    // but for a personal local app this is fine.
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type':                            'application/json',
        'x-api-key':                               key,
        'anthropic-version':                       '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model:      CLAUDE_MODEL,
        max_tokens: 2048,
        messages: [
          { role: 'user', content: messageContent }
        ]
      })
    });

    // Read the full API response body
    const data = await response.json();

    // If the API returned an error status, show the message from Claude's error body
    if (!response.ok) {
      const errMsg = data?.error?.message || data?.message || 'API error (status ' + response.status + ')';
      throw new Error(errMsg);
    }

    // --- Parse the response ---
    let raw = '';
    if (Array.isArray(data.content) && data.content[0] && typeof data.content[0].text === 'string') {
      raw = data.content[0].text.trim();
    } else if (typeof data.output_text === 'string') {
      raw = data.output_text.trim();
    } else if (typeof data.text === 'string') {
      raw = data.text.trim();
    } else if (data.completion?.message?.content && Array.isArray(data.completion.message.content)) {
      raw = data.completion.message.content.map(function(item) {
        return item.text || '';
      }).join('\n').trim();
    }

    if (!raw) {
      console.error('Unexpected Claude response format', data);
      throw new Error('AI returned unexpected response format. Check the browser console for details.');
    }

    // Sometimes Claude wraps JSON in ```json ... ``` — strip those if present
    raw = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();

    // Parse the JSON array
    let newCards;
    try {
      newCards = JSON.parse(raw);
    } catch (e) {
      console.error('Failed to parse Claude JSON', raw);
      throw new Error('AI returned unexpected format. Please try again.');
    }

    if (!Array.isArray(newCards)) {
      throw new Error('AI returned unexpected format. Please try again.');
    }

    // --- Add the new cards (skip duplicates) ---
    let addedCount = 0;
    newCards.forEach(function(c) {
      // Skip if missing required fields or invalid type
      if (!c.type || !c.title) return;
      if (!VALID_CARD_TYPES.includes(c.type)) return;

      // Skip if a card with this title already exists
      const alreadyExists = existingTitles.includes(c.title.toLowerCase());
      if (alreadyExists) return;

      addCard(c.type, c.title, c.content || '');
      addedCount++;
    });

    // --- Show success and switch to canvas ---
    const word = addedCount === 1 ? 'card' : 'cards';
    setModalStatus('✅ Added ' + addedCount + ' new ' + word + ' to your canvas!');
    if (addedCount > 0) setTimeout(generateSummary, 2000);

    // After 1.5 seconds, close the modal and show the canvas
    setTimeout(function() {
      document.querySelector('[data-tab="canvas"]').click();
      closeModal();
    }, 1500);

  } catch (err) {
    // Show a clear error message
    setModalStatus('❌ ' + err.message);
  } finally {
    // Always re-enable the button after the request finishes
    document.getElementById('organizeBtn').disabled = false;
  }
}


// ============================================================
// HELPER: setModalStatus — updates the small status line in the modal footer
// ============================================================
function setModalStatus(msg) {
  document.getElementById('organizeStatus').textContent = msg;
}


// ============================================================
// SECTION 10: SYNC NOTES FROM story-notes/ FOLDER
// ─────────────────────────────────────────────────────────────
// What it does: Reads story-notes/manifest.json to get a list
// of all files. Skips any already processed (stored in
// sf_synced_files). Sends new files to Claude one-by-one and
// adds whatever cards come back.
//
// Reads:  story-notes/manifest.json, each file listed in it
// Writes: new cards via addCard(), updates sf_synced_files
// Entry:  #syncNotesBtn click → syncStoryNotes()
// Helper: processFileWithAi(), extractTextFromPdfBuffer()
// ============================================================

document.getElementById('syncNotesBtn').addEventListener('click', syncStoryNotes);

async function syncStoryNotes() {
  const key = document.getElementById('apiKeyInput').value.trim() || apiKey;
  if (!key) {
    alert('Please set your API key first — click "+ Add Notes" and expand the 🔑 API Key section.');
    return;
  }

  // Requires Chrome/Edge File System Access API
  if (!window.showDirectoryPicker) {
    alert('Folder sync requires Chrome or Edge. Please open the site in one of those browsers.');
    return;
  }

  // Open a folder picker so the user selects their notes folder
  let dirHandle;
  try {
    dirHandle = await window.showDirectoryPicker();
  } catch (err) {
    if (err.name === 'AbortError') return; // user cancelled
    alert('Could not open folder: ' + err.message);
    return;
  }

  const btn = document.getElementById('syncNotesBtn');
  btn.disabled = true;

  try {
    const SUPPORTED = ['txt', 'md', 'pdf', 'docx', 'jpg', 'jpeg', 'png', 'heic'];
    const synced = JSON.parse(localStorage.getItem('sf_synced_files') || '[]');

    // Scan all files in the selected folder (top-level only)
    const filesToProcess = [];
    for await (const entry of dirHandle.values()) {
      if (entry.kind !== 'file') continue;
      const ext = entry.name.split('.').pop().toLowerCase();
      if (!SUPPORTED.includes(ext)) continue;
      const file    = await entry.getFile();
      // Track by filename + lastModified to detect changes
      const fileKey = entry.name + '_' + file.lastModified;
      if (synced.includes(fileKey)) continue;
      filesToProcess.push({ file, ext, fileKey, name: entry.name });
    }

    if (filesToProcess.length === 0) {
      btn.textContent = '✅ Already synced!';
      setTimeout(function() { btn.textContent = '↻ Sync Notes'; btn.disabled = false; }, 2500);
      return;
    }

    let totalAdded = 0;

    for (let i = 0; i < filesToProcess.length; i++) {
      const { file, ext, fileKey, name } = filesToProcess[i];
      btn.textContent = '⏳ ' + (i + 1) + '/' + filesToProcess.length + ' — ' + name;

      let messageContent;

      // Recompute existing titles each iteration since cards accumulate
      var existingTitlesNow = getExistingTitles();

      if (ext === 'jpg' || ext === 'jpeg' || ext === 'png' || ext === 'heic') {
        const base64 = await new Promise(function(resolve) {
          const reader = new FileReader();
          reader.onload = function(e) { resolve(e.target.result.split(',')[1]); };
          reader.readAsDataURL(file);
        });
        messageContent = [
          { type: 'image', source: { type: 'base64', media_type: file.type || 'image/jpeg', data: base64 } },
          { type: 'text',  text: buildSyncPrompt(existingTitlesNow) + '\n\nExtract any story elements from this image.' }
        ];

      } else if (ext === 'pdf') {
        const buffer = await file.arrayBuffer();
        const text   = await extractTextFromPdfBuffer(buffer);
        messageContent = buildSyncPrompt(existingTitlesNow) + '\n\nContent to organize:\n' + text.slice(0, 8000);

      } else if (ext === 'docx') {
        const buffer = await file.arrayBuffer();
        const result = await mammoth.extractRawText({ arrayBuffer: buffer });
        messageContent = buildSyncPrompt(existingTitlesNow) + '\n\nContent to organize:\n' + result.value.slice(0, 8000);

      } else {
        // txt / md — read directly from the File object (no fetch needed)
        const text = await file.text();
        messageContent = buildSyncPrompt(existingTitlesNow) + '\n\nContent to organize:\n' + text.slice(0, 8000);
      }

      btn.textContent = '✨ Organizing ' + name + '...';
      try {
        const added = await processFileWithAi(key, messageContent);
        totalAdded += added;
        // Mark as processed so we skip it next time
        synced.push(fileKey);
        localStorage.setItem('sf_synced_files', JSON.stringify(synced));
      } catch (fileErr) {
        // Skip this file and continue — don't abort the whole sync
        showToast('⚠️ Skipped ' + name + ': ' + fileErr.message);
        console.warn('Sync skipped', name, fileErr);
      }
    }

    const word = totalAdded === 1 ? 'card' : 'cards';
    btn.textContent = '✅ Added ' + totalAdded + ' ' + word + '!';
    if (totalAdded > 0) setTimeout(generateSummary, 1000);
    setTimeout(function() { btn.textContent = '↻ Sync Notes'; btn.disabled = false; }, 3000);

  } catch (err) {
    btn.textContent = '❌ ' + err.message;
    setTimeout(function() { btn.textContent = '↻ Sync Notes'; btn.disabled = false; }, 4000);
  }
}

// buildSyncPrompt is imported from story-utils.js

// extractTextFromPdfBuffer: same as readAsPdf but works on an ArrayBuffer directly
async function extractTextFromPdfBuffer(arrayBuffer) {
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let text = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const page    = await pdf.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map(function(item) { return item.str; }).join(' ') + '\n';
  }
  return text;
}

// processFileWithAi: calls the API and adds whatever cards come back
async function processFileWithAi(key, messageContent) {
  const existingTitles = getExistingTitles();

  let response, data;
  try {
    response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type':                              'application/json',
        'x-api-key':                                 key,
        'anthropic-version':                         '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model:      CLAUDE_MODEL,
        max_tokens: 2048,
        messages:   [{ role: 'user', content: messageContent }]
      })
    });
    data = await response.json();
  } catch (e) {
    throw new Error('Network error: ' + e.message);
  }
  if (!response.ok) throw new Error(data?.error?.message || 'API error (status ' + response.status + ')');

  let raw = (data.content?.[0]?.text || '').trim();
  raw = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();

  let newCards;
  try {
    newCards = JSON.parse(raw);
  } catch (e) {
    console.warn('Claude response was not valid JSON:', raw.slice(0, 200));
    showToast('⚠️ Could not parse AI response — no cards added');
    return 0;
  }
  if (!Array.isArray(newCards)) return 0;

  let count = 0;

  newCards.forEach(function(c) {
    if (!c.type || !c.title) return;
    if (!VALID_CARD_TYPES.includes(c.type)) return;
    if (existingTitles.includes(c.title.toLowerCase())) return;
    addCard(c.type, c.title, c.content || '');
    count++;
  });

  return count;
}


// ============================================================
// SECTION 11: MAP VIEW — drag, zoom, connect, resize
// ─────────────────────────────────────────────────────────────
// What it does: Free-canvas view where cards are positioned
// absolutely and can be dragged, zoomed, resized, and connected
// with SVG bezier lines.
//
// Key concepts:
//   - mapZoom: current scale (0.1–5.0). Drag deltas are divided
//     by mapZoom so cards follow the cursor at any zoom level.
//   - mapScaler: a wrapper div whose CSS width/height matches
//     the zoomed canvas size, giving the scroll container the
//     right scrollable area.
//   - cardPositions: { [id]: { x, y, w, h } } saved to
//     localStorage as sf_positions.
//   - connections: [{ id, from, to }] saved as sf_connections.
//   - ResizeObserver: detects when a card is resized and saves
//     the new w/h to localStorage.
//
// Reads:  cards[], cardPositions{}, connections[], mapZoom
// Writes: cardPositions{} → sf_positions, connections{} → sf_connections
// Entry:  #viewMap click → renderMap()
//         scroll wheel on #mapView → applyZoom()
// ============================================================

document.getElementById('viewBoard').addEventListener('click', function() {
  viewMode = 'board';
  document.getElementById('viewBoard').classList.add('active');
  document.getElementById('viewMap').classList.remove('active');
  document.getElementById('boardView').classList.remove('hidden');
  document.getElementById('mapView').classList.add('hidden');
  document.getElementById('mapHint').classList.add('hidden');
  document.getElementById('zoomControls').classList.add('hidden');
  document.getElementById('mapButtons').classList.add('hidden');
  cancelConnect();
  hideCombinePanel();
  hideMapSyncPanel();
});

document.getElementById('viewMap').addEventListener('click', function() {
  viewMode = 'map';
  document.getElementById('viewMap').classList.add('active');
  document.getElementById('viewBoard').classList.remove('active');
  document.getElementById('mapView').classList.remove('hidden');
  document.getElementById('boardView').classList.add('hidden');
  document.getElementById('mapHint').classList.remove('hidden');
  document.getElementById('zoomControls').classList.remove('hidden');
  document.getElementById('mapButtons').classList.remove('hidden');
  renderMap();
  applyZoom(mapZoom);
  updateSyncButtonState();
  // Defer centering one frame so the browser finishes laying out the new card elements
  requestAnimationFrame(centerMapOnCards);
  // If there are unsynced cards, prompt the user before organizing
  if (unsyncedIds.size > 0) {
    showMapSyncPanel();
  }
});

// ── 11d: ZOOM ────────────────────────────────────────────────

// applyZoom: scales the map canvas and updates the scroll area + label
function applyZoom(newZoom) {
  // Clamp between 0.1× and 5×
  mapZoom = Math.max(0.1, Math.min(5.0, newZoom));
  mapZoom = Math.round(mapZoom * 100) / 100; // avoid floating-point drift

  localStorage.setItem('sf_zoom', String(mapZoom));

  var mapInner  = document.getElementById('mapInner');
  var mapScaler = document.getElementById('mapScaler');

  // Scale the canvas visually (transform-origin: 0 0 set in CSS)
  mapInner.style.transform = 'scale(' + mapZoom + ')';

  // Resize the scaler wrapper so the scroll container knows the full extent
  mapScaler.style.width  = (4000 * mapZoom) + 'px';
  mapScaler.style.height = (2500 * mapZoom) + 'px';

  // Update zoom label
  var label = document.getElementById('zoomLabel');
  if (label) label.textContent = Math.round(mapZoom * 100) + '%';
}

// Scroll wheel on the map → zoom in/out
document.getElementById('mapView').addEventListener('wheel', function(e) {
  e.preventDefault();
  var direction = e.deltaY > 0 ? -0.1 : 0.1;
  applyZoom(mapZoom + direction);
}, { passive: false });

// Zoom + / − / reset buttons
document.getElementById('zoomIn').addEventListener('click', function() {
  applyZoom(mapZoom + 0.1);
});
document.getElementById('zoomOut').addEventListener('click', function() {
  applyZoom(mapZoom - 0.1);
});
document.getElementById('zoomLabel').addEventListener('click', function() {
  applyZoom(1.0); // click the percentage label to reset to 100%
});

// Escape cancels connection mode and closes floating panels
document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') {
    if (connectingFrom) cancelConnect();
    closeModal();
    hideCombinePanel();
    hideMapSyncPanel();
  }
});

// ── 11a: RENDER & DEFAULT POSITIONS ─────────────────────────

// renderMap: place all cards as free-floating nodes on the canvas
function renderMap() {
  const mapInner = document.getElementById('mapInner');

  // Remove old map cards (keep the SVG)
  mapInner.querySelectorAll('.map-card').forEach(function(el) { el.remove(); });

  // Assign default positions for cards that don't have one yet.
  // Column offsets match autoOrganizeMap() so manual and auto layouts align.
  var typeOffsets = {
    character: 400, world: 730, arc: 1060, quote: 1390, idea: 1720
  };
  var typeCounters = { character: 0, world: 0, arc: 0, quote: 0, idea: 0 };

  cards.forEach(function(card) {
    if (!cardPositions[card.id]) {
      var col = typeOffsets[card.type] || 400;
      var row = typeCounters[card.type] || 0;
      cardPositions[card.id] = {
        x: col + (row % 2) * 230,
        y: 200 + Math.floor(row / 2) * 180
      };
    }
    typeCounters[card.type] = (typeCounters[card.type] || 0) + 1;
  });

  // Render each card
  cards.forEach(function(card) {
    var pos   = cardPositions[card.id];
    var color = TYPE_COLORS[card.type] || '#94a3b8';

    var el = document.createElement('div');
    el.className  = 'map-card';
    el.dataset.id = card.id;
    el.style.left        = pos.x + 'px';
    el.style.top         = pos.y + 'px';
    el.style.borderLeftColor = color;
    // Restore saved card size if the user previously resized it
    if (pos.w) el.style.width  = pos.w + 'px';
    if (pos.h) el.style.height = pos.h + 'px';

    el.innerHTML =
      '<button class="card-tab-btn" data-id="' + card.id + '" title="AI Actions">⋮</button>' +
      '<div class="card-tab-dropdown" data-id="' + card.id + '"></div>' +
      '<div class="map-card-header">' +
        '<span class="col-dot" style="background:' + color + ';flex-shrink:0"></span>' +
        '<div class="map-card-title" contenteditable="true" data-id="' + card.id + '" data-field="title">' + escapeHtml(card.title) + '</div>' +
      '</div>' +
      '<div class="map-card-content" contenteditable="true" data-id="' + card.id + '" data-field="content">' + escapeHtml(card.content) + '</div>' +
      '<div class="map-card-actions">' +
        '<button class="map-action-btn connect" data-id="' + card.id + '" title="Connect">⊕</button>' +
        '<button class="map-action-btn delete"  data-id="' + card.id + '" title="Delete">✕</button>' +
      '</div>';

    mapInner.appendChild(el);
    makeDraggable(el, card.id);

    // Click on card body (not editable / buttons) — handles combine selection
    el.addEventListener('click', (function(cardId) {
      return function(e) {
        if (e.target.matches('[contenteditable]') || e.target.closest('button')) return;
        if (connectingFrom) return;
        if (wasDragging) return;
        handleCardSelectForCombine(cardId);
      };
    })(card.id));

    // ResizeObserver: fires whenever the card is resized by the user.
    // Saves the new dimensions so they persist after page refresh.
    (function(cardEl, cardId) {
      var observer = new ResizeObserver(function() {
        var pos = cardPositions[cardId];
        if (pos) {
          pos.w = cardEl.offsetWidth;
          pos.h = cardEl.offsetHeight;
          saveCardPositions();
        }
      });
      observer.observe(cardEl);
    })(el, card.id);
  });

  // Wire up buttons
  mapInner.querySelectorAll('.map-action-btn.connect').forEach(function(btn) {
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      startConnect(btn.dataset.id);
    });
  });

  mapInner.querySelectorAll('.map-action-btn.delete').forEach(function(btn) {
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      deleteCard(btn.dataset.id);
    });
  });

  // Wire up the ⋮ AI tab buttons
  mapInner.querySelectorAll('.card-tab-btn').forEach(function(btn) {
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      var cardId   = btn.dataset.id;
      var dropdown = mapInner.querySelector('.card-tab-dropdown[data-id="' + cardId + '"]');
      if (!dropdown) return;

      // Close all other open dropdowns first
      mapInner.querySelectorAll('.card-tab-dropdown.open').forEach(function(d) {
        if (d !== dropdown) d.classList.remove('open');
      });

      // Build dropdown contents based on whether the card has connections
      var hasConnections = connections.some(function(c) {
        return c.from === cardId || c.to === cardId;
      });
      dropdown.innerHTML =
        '<div class="dropdown-section">AI Actions</div>' +
        '<button data-action="summarize" data-id="' + cardId + '">📝 Summarize Card</button>' +
        '<button data-action="continue"  data-id="' + cardId + '">✨ Continue Story</button>' +
        '<button data-action="related"   data-id="' + cardId + '">🔗 Find Related Cards</button>' +
        (hasConnections
          ? '<button data-action="sync"    data-id="' + cardId + '">🔀 Sync with Connected</button>'
          : '') +
        '<div class="dropdown-section">Card</div>' +
        '<button data-action="delete" data-id="' + cardId + '" class="danger">✕ Delete Card</button>';

      dropdown.classList.toggle('open');

      // Wire up dropdown buttons
      dropdown.querySelectorAll('button[data-action]').forEach(function(item) {
        item.addEventListener('click', function(e) {
          e.stopPropagation();
          dropdown.classList.remove('open');
          handleCardContextMenuAction(item.dataset.action, item.dataset.id);
        });
      });
    });
  });

  // Close dropdowns when clicking elsewhere on the map
  document.addEventListener('click', function closeDropdowns() {
    mapInner.querySelectorAll('.card-tab-dropdown.open').forEach(function(d) {
      d.classList.remove('open');
    });
  }, { once: false, capture: false });

  // Inline editing in map cards
  mapInner.querySelectorAll('[contenteditable="true"]').forEach(function(el) {
    el.addEventListener('blur', function() {
      var id    = el.dataset.id;
      var field = el.dataset.field;
      var card  = cards.find(function(c) { return c.id === id; });
      if (card) { card[field] = el.textContent.trim(); saveCards(); }
    });
    // Prevent drag when editing
    el.addEventListener('mousedown', function(e) { e.stopPropagation(); });
  });

  drawConnections();
  makeMapPannable();
}

// ── 11b: CARD DRAGGING ───────────────────────────────────────

// makeDraggable: lets a map card be dragged around the canvas
function makeDraggable(el, cardId) {
  el.addEventListener('mousedown', function(e) {
    // If we're in connect mode and clicking a different card, finish the connection
    if (connectingFrom && connectingFrom !== cardId) {
      finishConnect(cardId);
      return;
    }
    // Don't drag when clicking editable areas or buttons
    if (e.target.matches('[contenteditable]') || e.target.closest('button')) return;

    var startX   = e.clientX;
    var startY   = e.clientY;
    var startLeft = cardPositions[cardId].x;
    var startTop  = cardPositions[cardId].y;
    var moved = false;

    el.classList.add('dragging');
    e.preventDefault();
    e.stopPropagation(); // prevent map pan triggering when dragging a card

    function onMove(e) {
      moved = true;
      wasDragging = true;
      // Divide mouse delta by mapZoom so the card follows the cursor
      // correctly at any zoom level (e.g., at 0.5× zoom, mouse moves
      // 100px but we only want the card to move 50px in canvas space)
      var newX = Math.max(-50, Math.min(3900, startLeft + (e.clientX - startX) / mapZoom));
      var newY = Math.max(-50, Math.min(2400, startTop  + (e.clientY - startY) / mapZoom));
      // Preserve saved w/h when updating position
      var existing = cardPositions[cardId] || {};
      cardPositions[cardId] = { x: newX, y: newY, w: existing.w, h: existing.h };
      el.style.left = newX + 'px';
      el.style.top  = newY + 'px';
      drawConnections();
    }

    function onUp() {
      el.classList.remove('dragging');
      if (moved) saveCardPositions();
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      if (wasDragging) setTimeout(function() { wasDragging = false; }, 50);
    }

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
}

// ── 11c: CONNECT CARDS & DRAW SVG LINES ─────────────────────

// startConnect: enter "connect from this card" mode
function startConnect(fromId) {
  connectingFrom = fromId;
  document.querySelectorAll('.map-card').forEach(function(el) {
    el.classList.remove('connecting-from', 'connecting-target');
  });
  var fromEl = document.querySelector('.map-card[data-id="' + fromId + '"]');
  if (fromEl) fromEl.classList.add('connecting-from');
  document.querySelectorAll('.map-card:not([data-id="' + fromId + '"])').forEach(function(el) {
    el.classList.add('connecting-target');
  });
  document.body.classList.add('connecting-mode');
}

// finishConnect: draw a line from connectingFrom to toId
function finishConnect(toId) {
  if (!connectingFrom || connectingFrom === toId) { cancelConnect(); return; }

  // Skip if connection already exists
  var exists = connections.some(function(c) {
    return (c.from === connectingFrom && c.to === toId) ||
           (c.from === toId && c.to === connectingFrom);
  });

  if (!exists) {
    connections.push({ id: generateId(), from: connectingFrom, to: toId });
    saveConnections();
  }

  cancelConnect();
  drawConnections();
}

// cancelConnect: exit connection mode
function cancelConnect() {
  connectingFrom = null;
  document.querySelectorAll('.map-card').forEach(function(el) {
    el.classList.remove('connecting-from', 'connecting-target');
  });
  document.body.classList.remove('connecting-mode');
}

// drawConnections: draw SVG bezier curves between connected cards
function drawConnections() {
  var svg = document.getElementById('connectionsSvg');
  if (!svg) return;
  svg.innerHTML = '';

  connections.forEach(function(conn) {
    var fromEl = document.querySelector('.map-card[data-id="' + conn.from + '"]');
    var toEl   = document.querySelector('.map-card[data-id="' + conn.to + '"]');
    if (!fromEl || !toEl) return;

    var x1 = parseFloat(fromEl.style.left) + fromEl.offsetWidth  / 2;
    var y1 = parseFloat(fromEl.style.top)  + fromEl.offsetHeight / 2;
    var x2 = parseFloat(toEl.style.left)   + toEl.offsetWidth    / 2;
    var y2 = parseFloat(toEl.style.top)    + toEl.offsetHeight   / 2;

    // Cubic bezier for a smooth S-curve
    var cx1 = x1 + (x2 - x1) * 0.5;
    var cy1 = y1;
    var cx2 = x1 + (x2 - x1) * 0.5;
    var cy2 = y2;
    var d = 'M ' + x1 + ' ' + y1 + ' C ' + cx1 + ' ' + cy1 + ' ' + cx2 + ' ' + cy2 + ' ' + x2 + ' ' + y2;

    // Visual line — auto-connections are lighter, manual connections more prominent
    var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', d);
    path.setAttribute('stroke', conn.auto ? '#2d3340' : '#94a3b8');
    path.setAttribute('stroke-width', conn.auto ? '1' : '1.5');
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke-dasharray', conn.auto ? '3,7' : '5,4');
    svg.appendChild(path);

    // Delete button at midpoint
    var midX = (x1 + x2) / 2;
    var midY = (y1 + y2) / 2;

    var g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('pointer-events', 'all');
    g.style.cursor = 'pointer';

    var circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', midX);
    circle.setAttribute('cy', midY);
    circle.setAttribute('r', '8');
    circle.setAttribute('fill', '#161b22');   // dark surface, matches dark theme
    circle.setAttribute('stroke', '#484f58');
    circle.setAttribute('stroke-width', '1.5');

    var txt = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    txt.setAttribute('x', midX);
    txt.setAttribute('y', midY + 4);
    txt.setAttribute('text-anchor', 'middle');
    txt.setAttribute('font-size', '9');
    txt.setAttribute('fill', '#94a3b8');
    txt.setAttribute('font-family', 'sans-serif');
    txt.textContent = '✕';

    g.appendChild(circle);
    g.appendChild(txt);
    g.addEventListener('click', function() { deleteConnection(conn.id); });
    svg.appendChild(g);
  });
}

function deleteConnection(connId) {
  connections = connections.filter(function(c) { return c.id !== connId; });
  saveConnections();
  drawConnections();
}

function saveCardPositions() {
  localStorage.setItem('sf_positions', JSON.stringify(cardPositions));
}

function saveConnections() {
  localStorage.setItem('sf_connections', JSON.stringify(connections));
}

// handleCardContextMenuAction: called when user picks an option from the ⋮ dropdown on a map card
async function handleCardContextMenuAction(action, cardId) {
  var key = getApiKey();
  if (!key) {
    alert('Please set your API key first — click "+ Add Notes" and expand the API Key section.');
    return;
  }

  if (action === 'delete') {
    deleteCard(cardId);
    return;
  }

  var card = cards.find(function(c) { return c.id === cardId; });
  if (!card) return;

  // Get all cards connected to this one
  var connectedCards = connections
    .filter(function(c) { return c.from === cardId || c.to === cardId; })
    .map(function(c) { return c.from === cardId ? c.to : c.from; })
    .map(function(id) { return cards.find(function(c) { return c.id === id; }); })
    .filter(Boolean);

  var cardText = card.title + ': ' + card.content;
  var connText = connectedCards.map(function(c) { return '- ' + c.title + ': ' + c.content; }).join('\n');

  var prompt;
  if (action === 'summarize') {
    prompt = 'Summarize this story note in 2-3 clear sentences:\n\n' + cardText;

  } else if (action === 'continue') {
    prompt = 'Based on this story note from "Life of Bon", suggest 2-3 specific ways the story could continue from here:\n\n' + cardText;

  } else if (action === 'related') {
    // Use compact card list (titles + types only) instead of full content — saves ~2k tokens per tap
    var compactCtx = cards.map(function(c) { return '[' + c.type + '] ' + c.title; }).join('\n');
    prompt = 'Given this story note and the story card index below, which other elements, themes, or characters does it relate to most? Give 2-3 specific connections.\n\nNote:\n' + cardText + '\n\nStory cards:\n' + compactCtx;

  } else if (action === 'sync') {
    if (connectedCards.length === 0) {
      showToast('This card has no connections. Use ⊕ to connect cards first.');
      return;
    }
    prompt = 'These connected story notes are from "Life of Bon". Reconcile and merge them into a coherent combined description (2-4 sentences):\n\nMain card:\n' + cardText + '\n\nConnected cards:\n' + connText;
  }

  // Send to Claude and add result to chat without auto-opening it
  var maxTok = { summarize: 200, continue: 300, related: 300, sync: 250 };
  try {
    var reply = await callClaudeForCard(key, prompt, maxTok[action] || 300);
    var label = { summarize: '📝 Summary', continue: '✨ Story Ideas', related: '🔗 Related Cards', sync: '🔀 Merged View' };
    appendChatMsg('assistant', (label[action] || 'AI') + ' for "' + card.title + '":\n\n' + reply);
    showChatNotif();
    showToast((label[action] || 'AI') + ' ready — open chat to view', 4500);
  } catch (err) {
    showToast('❌ ' + err.message);
  }
}


// ============================================================
// SECTION 12: STORY SUMMARY
// ─────────────────────────────────────────────────────────────
// What it does: Sends all current cards to Claude and asks for
// a 1–2 sentence story overview. Result is shown in the summary
// bar at the bottom of the canvas and cached in localStorage.
//
// Reads:  cards[], apiKey
// Writes: #summaryText innerHTML, localStorage sf_summary
// Entry:  #refreshSummary click → generateSummary()
//         Also called automatically after AI organizes or syncs
// ============================================================

document.getElementById('refreshSummary').addEventListener('click', generateSummary);

// Summary bar collapse/expand toggle
document.getElementById('toggleSummary').addEventListener('click', function() {
  var bar = document.getElementById('summaryBar');
  var collapsed = bar.classList.toggle('collapsed');
  localStorage.setItem('sf_summary_expanded', collapsed ? 'false' : 'true');
});

async function generateSummary() {
  var key = getApiKey();
  if (!key) {
    document.getElementById('summaryText').textContent = 'Set your API key to generate a story overview.';
    return;
  }
  if (cards.length === 0) {
    document.getElementById('summaryText').textContent = 'Add some cards first to see a story overview.';
    return;
  }

  document.getElementById('summaryText').textContent = 'Generating overview...';

  // Build condensed card list (title + first 50 chars of content) to save tokens
  var byType = {};
  cards.forEach(function(c) {
    if (!byType[c.type]) byType[c.type] = [];
    var snippet = c.content ? c.content.slice(0, 80) : '';
    byType[c.type].push(c.title + (snippet ? ': ' + snippet : ''));
  });

  var storyData = '';
  var labels = { character: 'Characters', world: 'World', arc: 'Plot', quote: 'Quotes', idea: 'Ideas' };
  Object.keys(byType).forEach(function(type) {
    storyData += (labels[type] || type) + ':\n' + byType[type].join('\n') + '\n\n';
  });

  try {
    var res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type':                              'application/json',
        'x-api-key':                                 key,
        'anthropic-version':                         '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model:      CLAUDE_MODEL,
        max_tokens: 300,
        messages: [{
          role:    'user',
          content: 'Write a 3–5 sentence story overview for an isekai light novel called "Life of Bon" based on these notes. Be specific about characters, current arcs, and world details. Max 120 words.\n\n' + storyData
        }]
      })
    });

    var data = await res.json();
    if (!res.ok) throw new Error(data?.error?.message || 'API error');

    var text = (data.content?.[0]?.text || '').trim();
    document.getElementById('summaryText').textContent = text;
    localStorage.setItem('sf_summary', text);

    // Make sure bar is expanded so user sees the new summary
    document.getElementById('summaryBar').classList.remove('collapsed');
    localStorage.setItem('sf_summary_expanded', 'true');

  } catch (err) {
    document.getElementById('summaryText').textContent = 'Could not generate summary — ' + err.message;
  }
}

// Load saved summary and collapsed state on startup
(function() {
  var saved = localStorage.getItem('sf_summary');
  if (saved) document.getElementById('summaryText').textContent = saved;

  var expanded = localStorage.getItem('sf_summary_expanded');
  // Default expanded (true). Collapse only if explicitly saved as 'false'.
  if (expanded === 'false') {
    document.getElementById('summaryBar').classList.add('collapsed');
  }
})();


// ============================================================
// SECTION 13: CLAUDE CHAT
// ─────────────────────────────────────────────────────────────
// What it does: A floating writing assistant chat panel. On the
// first message it injects all current story cards as context
// so Claude can answer questions about specific characters,
// plot, or world details.
//
// Key: chatHistory[] keeps the conversation turn-by-turn. On
// the first user message, two synthetic turns are prepended
// (user sends the story notes, assistant acknowledges them)
// so Claude has context from message 1.
//
// Reads:  cards[], apiKey, chatHistory[]
// Writes: chatHistory[], DOM messages in #chatMessages
// Entry:  #openChat click → openChat() → #chatSend → sendChatMessage()
// ============================================================

var chatHistory = [];
var chatIsOpen  = false;

document.getElementById('openChat').addEventListener('click', openChat);
document.getElementById('chatClose').addEventListener('click', closeChat);
document.getElementById('chatSend').addEventListener('click', sendChatMessage);

document.getElementById('chatInput').addEventListener('keydown', function(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendChatMessage();
  }
});

// Auto-grow the chat textarea
document.getElementById('chatInput').addEventListener('input', function() {
  this.style.height = 'auto';
  this.style.height = Math.min(this.scrollHeight, 110) + 'px';
});

function openChat() {
  chatIsOpen = true;
  document.getElementById('chatPanel').classList.add('open');
  document.getElementById('chatInput').focus();
  // Clear notification dot when chat is opened
  var dot = document.getElementById('chatNotifDot');
  if (dot) dot.classList.add('hidden');
  // Show memory badge if we have a stored memory summary
  var memBadge = document.getElementById('chatMemoryBadge');
  if (memBadge) {
    memBadge.style.display = localStorage.getItem('sf_chat_memory') ? '' : 'none';
  }
}

function closeChat() {
  chatIsOpen = false;
  document.getElementById('chatPanel').classList.remove('open');
}

// buildStoryContext: summarises all cards for Claude's system context.
// To reduce token usage: sends full content only for the 5 most recently added cards;
// all other cards send title + type only.
function buildStoryContext() {
  if (cards.length === 0) return 'No story notes added yet.';

  // Sort by createdAt to find the most recent
  var sorted = cards.slice().sort(function(a, b) {
    return new Date(b.createdAt) - new Date(a.createdAt);
  });
  var recentIds = sorted.slice(0, 5).map(function(c) { return c.id; });

  var byType = {};
  cards.forEach(function(c) {
    if (!byType[c.type]) byType[c.type] = [];
    var isRecent = recentIds.includes(c.id);
    // Full content for recent cards; title only for the rest (saves tokens)
    byType[c.type].push('• ' + c.title + (isRecent && c.content ? ': ' + c.content : ''));
  });

  var ctx = 'Current story notes for "Life of Bon":\n\n';
  var labels = { character: 'Characters', world: 'World Building', arc: 'Plot & Arcs', quote: 'Key Quotes', idea: 'Ideas' };
  Object.keys(byType).forEach(function(type) {
    ctx += (labels[type] || type) + ':\n' + byType[type].join('\n') + '\n\n';
  });
  return ctx;
}

// sendChatMessage: two-call structure —
//   Call A (conditional): if chatHistory > 20 turns, summarize oldest 10 into sf_chat_memory
//   Call B (always): main response, injecting sf_chat_memory as system context + last 20 turns
async function sendChatMessage() {
  var input = document.getElementById('chatInput');
  var msg   = input.value.trim();
  if (!msg) return;

  var key = getApiKey();
  if (!key) {
    appendChatMsg('assistant', 'Please set your API key first — click "+ Add Notes" and expand the API Key section.');
    return;
  }

  appendChatMsg('user', msg);
  input.value = '';
  input.style.height = 'auto';

  chatHistory.push({ role: 'user', content: msg });

  var typingId = 'typing-' + Date.now();
  appendChatMsg('assistant', '...', typingId);
  document.getElementById('chatSend').disabled = true;

  try {
    // If history is getting long, summarize oldest turns before trimming
    if (chatHistory.length > 20) {
      var oldest = chatHistory.slice(0, 10);
      chatHistory = chatHistory.slice(10);
      try {
        var memText = oldest.map(function(m) {
          return (m.role === 'user' ? 'User: ' : 'Claude: ') + m.content;
        }).join('\n');
        var memRes = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type':                              'application/json',
            'x-api-key':                                 key,
            'anthropic-version':                         '2023-06-01',
            'anthropic-dangerous-direct-browser-access': 'true'
          },
          body: JSON.stringify({
            model:      CLAUDE_MODEL,
            max_tokens: 200,
            messages: [{
              role:    'user',
              content: 'Summarize these story-planning notes as brief bullet points (max 100 words). Capture key decisions, character details, and plot points only:\n\n' + memText
            }]
          })
        });
        var memData = await memRes.json();
        if (memRes.ok) {
          var memSummary = (memData.content?.[0]?.text || '').trim();
          // Append to any existing memory, then cap at 3000 chars (keep most recent)
          var existing = localStorage.getItem('sf_chat_memory') || '';
          var combined = (existing ? existing + '\n' : '') + memSummary;
          if (combined.length > 3000) combined = combined.slice(-3000);
          localStorage.setItem('sf_chat_memory', combined);
          var memBadge = document.getElementById('chatMemoryBadge');
          if (memBadge) memBadge.style.display = '';
        }
      } catch (_) { /* memory summarization is best-effort */ }
    }

    // Build system prompt, injecting stored memory if available
    var baseSystem = 'You are a creative writing assistant helping develop an isekai/anime light novel called "Life of Bon" where the main character Bon gets reincarnated. Be specific, creative, and concise. Help with writing, brainstorming, characters, plot, and dialogue.';
    var storedMemory = localStorage.getItem('sf_chat_memory');
    var systemPrompt = storedMemory
      ? baseSystem + '\n\nStory planning memory from earlier in this session:\n' + storedMemory
      : baseSystem;

    // Build messages: if first turn, prepend a context exchange
    var messages = [];
    if (chatHistory.length === 1) {
      messages.push({
        role:    'user',
        content: 'Here is my story data:\n\n' + buildStoryContext() + '\nI will now ask you questions.'
      });
      messages.push({
        role:    'assistant',
        content: 'Got it! I can see your "Life of Bon" story notes. Ready to help with writing, characters, plot, dialogue — whatever you need.'
      });
    }
    // Cap history sent to API at last 20 turns to control token usage
    var trimmedHistory = chatHistory.length > 20 ? chatHistory.slice(-20) : chatHistory;
    messages = messages.concat(trimmedHistory);

    var res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type':                              'application/json',
        'x-api-key':                                 key,
        'anthropic-version':                         '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model:      CLAUDE_MODEL,
        max_tokens: 1024,
        system:     systemPrompt,
        messages:   messages
      })
    });

    var data = await res.json();
    if (!res.ok) throw new Error(data?.error?.message || 'API error');

    var reply = (data.content?.[0]?.text || '').trim();
    var typingEl = document.getElementById(typingId);
    if (typingEl) typingEl.remove();

    appendChatMsg('assistant', reply);
    chatHistory.push({ role: 'assistant', content: reply });

  } catch (err) {
    var typingEl = document.getElementById(typingId);
    if (typingEl) typingEl.remove();
    appendChatMsg('assistant', '❌ ' + err.message);
  } finally {
    document.getElementById('chatSend').disabled = false;
  }
}

function appendChatMsg(role, text, id) {
  var msgs = document.getElementById('chatMessages');
  var div  = document.createElement('div');
  div.className = 'chat-msg ' + role;
  if (id) div.id = id;
  var p = document.createElement('p');
  p.textContent = text;
  div.appendChild(p);
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
}


// ============================================================
// SECTION 14: NEW UTILITY & FEATURE FUNCTIONS
// ============================================================

// saveUnsyncedIds: persists unsynced card IDs to localStorage
function saveUnsyncedIds() {
  localStorage.setItem('sf_unsynced_ids', JSON.stringify(Array.from(unsyncedIds)));
  updateSyncButtonState();
}

// updateSyncButtonState: updates the Sync Map button appearance
function updateSyncButtonState() {
  var btn = document.getElementById('mapSyncBtn');
  if (!btn) return;
  var count = unsyncedIds.size;
  if (count > 0) {
    btn.innerHTML = '<span class="unsynced-dot"></span>Sync (' + count + ')';
    btn.classList.add('has-unsynced');
  } else {
    btn.textContent = '⊞ Sync Map';
    btn.classList.remove('has-unsynced');
  }
}

// showToast: shows a brief auto-dismissing notification
function showToast(msg, durationMs) {
  var toast = document.createElement('div');
  toast.className = 'sf-toast';
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(function() {
    toast.classList.add('sf-toast-fade');
    setTimeout(function() { if (toast.parentNode) toast.remove(); }, 350);
  }, durationMs || 3000);
}

// showChatNotif: shows the notification dot on the "Ask Claude" FAB button
function showChatNotif() {
  var dot = document.getElementById('chatNotifDot');
  if (dot && !chatIsOpen) dot.classList.remove('hidden');
}

// callClaudeForCard: lightweight Claude API call for single-card actions (no system prompt)
async function callClaudeForCard(key, prompt, maxTokens) {
  var res, data;
  try {
    res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type':                              'application/json',
        'x-api-key':                                 key,
        'anthropic-version':                         '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model:      CLAUDE_MODEL,
        max_tokens: maxTokens || 300,
        messages: [{ role: 'user', content: prompt }]
      })
    });
    data = await res.json();
  } catch (e) {
    throw new Error('Network error: ' + e.message);
  }
  if (!res.ok) throw new Error(data?.error?.message || 'API error (status ' + res.status + ')');
  return (data.content?.[0]?.text || '').trim();
}

// centerMapOnCards: scrolls the map viewport so the card cluster is centered.
// Falls back to a sensible default if there are no positioned cards.
function centerMapOnCards() {
  var mapView = document.getElementById('mapView');
  if (!mapView) return;

  var positions = Object.values(cardPositions);
  if (positions.length === 0) {
    // No cards yet — scroll to where new cards will appear
    mapView.scrollLeft = 280;
    mapView.scrollTop  = 120;
    return;
  }

  // Find the bounding box of all card positions
  var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  positions.forEach(function(p) {
    var x = p.x || 0, y = p.y || 0;
    var w = p.w || 210, h = p.h || 140; // 210 matches default CSS .map-card width
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x + w > maxX) maxX = x + w;
    if (y + h > maxY) maxY = y + h;
  });

  // Center of all cards in canvas space
  var centerX = (minX + maxX) / 2;
  var centerY = (minY + maxY) / 2;

  // Scroll so that point is in the middle of the visible viewport, accounting for zoom
  var vpW = mapView.clientWidth;
  var vpH = mapView.clientHeight;
  mapView.scrollLeft = Math.max(0, centerX * mapZoom - vpW / 2);
  mapView.scrollTop  = Math.max(0, centerY * mapZoom - vpH / 2);
}

// ── 14a: MAP PANNING ─────────────────────────────────────────

// makeMapPannable: enables click+drag on the empty canvas to pan the map view
function makeMapPannable() {
  var mapView  = document.getElementById('mapView');
  var mapInner = document.getElementById('mapInner');
  if (!mapInner) return;

  // Remove previous listener before re-attaching (renderMap is called multiple times)
  if (mapInner._panHandler) {
    mapInner.removeEventListener('mousedown', mapInner._panHandler);
  }

  mapInner._panHandler = function(e) {
    // Only fire when clicking directly on mapInner (card mousedown calls stopPropagation)
    if (e.target !== mapInner) return;
    if (connectingFrom) return;
    // Clicking empty canvas also clears card selection
    hideCombinePanel();

    var startScrollLeft = mapView.scrollLeft;
    var startScrollTop  = mapView.scrollTop;
    var startX = e.clientX;
    var startY = e.clientY;

    mapInner.style.cursor = 'grabbing';
    e.preventDefault();

    function onMove(e) {
      mapView.scrollLeft = startScrollLeft - (e.clientX - startX);
      mapView.scrollTop  = startScrollTop  - (e.clientY - startY);
    }
    function onUp() {
      mapInner.style.cursor = '';
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  mapInner.addEventListener('mousedown', mapInner._panHandler);
}

// ── 14b: AUTO-ORGANIZE MAP ───────────────────────────────────

// autoOrganizeMap: arranges all cards in columns by type, auto-connects within each column
// Column math: colX = START_X + colIndex * (CARD_W + COL_GAP)
//   e.g. character at 400, world at 730, arc at 1060, quote at 1390, idea at 1720
function autoOrganizeMap() {
  var TYPE_ORDER = VALID_CARD_TYPES; // character → world → arc → quote → idea
  var CARD_W     = 210; // card width
  var COL_GAP    = 120; // gap between columns (total column stride = 330px)
  var START_X    = 400; // left offset — gives 400px of left scroll buffer
  var START_Y    = 200; // top offset — gives breathing room above the first card
  var ROW_GAP    = 200; // vertical gap between cards in a column

  // Remove old auto-connections (manually created connections are preserved)
  connections = connections.filter(function(c) { return !c.auto; });

  TYPE_ORDER.forEach(function(type, colIndex) {
    var colCards = cards
      .filter(function(c) { return c.type === type; })
      .sort(function(a, b) { return new Date(a.createdAt) - new Date(b.createdAt); });

    var colX = START_X + colIndex * (CARD_W + COL_GAP);

    colCards.forEach(function(card, rowIndex) {
      var existing = cardPositions[card.id] || {};
      cardPositions[card.id] = {
        x: colX,
        y: START_Y + rowIndex * ROW_GAP,
        w: existing.w,
        h: existing.h
      };

      // Auto-connect consecutive cards within the same column
      if (rowIndex > 0) {
        var prevCard = colCards[rowIndex - 1];
        var alreadyConnected = connections.some(function(c) {
          return (c.from === prevCard.id && c.to === card.id) ||
                 (c.from === card.id && c.to === prevCard.id);
        });
        if (!alreadyConnected) {
          connections.push({ id: generateId(), from: prevCard.id, to: card.id, auto: true });
        }
      }
    });
  });

  saveCardPositions();
  saveConnections();

  // Defer centering one frame so the browser finishes laying out the reorganized cards
  requestAnimationFrame(centerMapOnCards);
}

// ── 14c: COMBINE CARDS ───────────────────────────────────────

// handleCardSelectForCombine: manages the 2-card selection state for combining
function handleCardSelectForCombine(cardId) {
  var idx = selectedCardsForCombine.indexOf(cardId);

  if (idx !== -1) {
    // Clicking a selected card deselects it
    selectedCardsForCombine.splice(idx, 1);
    if (selectedCardsForCombine.length < 2) hideCombinePanel();
  } else if (selectedCardsForCombine.length >= 2) {
    // Clicking a 3rd card: clear all selection, select the new one
    selectedCardsForCombine = [cardId];
    hideCombinePanel();
  } else {
    selectedCardsForCombine.push(cardId);
    if (selectedCardsForCombine.length === 2) {
      showCombinePanel(selectedCardsForCombine[0], selectedCardsForCombine[1]);
    }
  }

  // Update visual selection classes
  document.querySelectorAll('.map-card').forEach(function(el) {
    el.classList.toggle('card-selected', selectedCardsForCombine.indexOf(el.dataset.id) !== -1);
  });
}

// showCombinePanel: populates and shows the floating combine panel
function showCombinePanel(id1, id2) {
  var card1 = cards.find(function(c) { return c.id === id1; });
  var card2 = cards.find(function(c) { return c.id === id2; });
  if (!card1 || !card2) return;

  document.getElementById('combineCard1Name').textContent = card1.title;
  document.getElementById('combineCard2Name').textContent = card2.title;
  document.getElementById('combineContextNote').value = '';
  document.getElementById('combineStatusMsg').textContent = '';
  document.getElementById('combineConfirmBtn').disabled = false;
  document.getElementById('combinePanel').classList.remove('hidden');
}

// hideCombinePanel: hides the combine panel and clears selection state
function hideCombinePanel() {
  var panel = document.getElementById('combinePanel');
  if (panel) panel.classList.add('hidden');
  selectedCardsForCombine = [];
  document.querySelectorAll('.map-card.card-selected').forEach(function(el) {
    el.classList.remove('card-selected');
  });
}

// showMapSyncPanel: shows the map sync prompt
function showMapSyncPanel() {
  var count = unsyncedIds.size;
  var countEl = document.getElementById('mapSyncCount');
  if (countEl) countEl.textContent = count;
  var note = document.getElementById('mapSyncContextNote');
  if (note) note.value = '';
  var msg = document.getElementById('mapSyncStatusMsg');
  if (msg) msg.textContent = '';
  var btn = document.getElementById('mapSyncConfirmBtn');
  if (btn) btn.disabled = false;
  var panel = document.getElementById('mapSyncPanel');
  if (panel) panel.classList.remove('hidden');
}

// hideMapSyncPanel: hides the map sync panel
function hideMapSyncPanel() {
  var panel = document.getElementById('mapSyncPanel');
  if (panel) panel.classList.add('hidden');
}

// Wire up combine panel buttons
document.getElementById('combineCancelBtn').addEventListener('click', hideCombinePanel);

document.getElementById('combineConfirmBtn').addEventListener('click', async function() {
  var key = getApiKey();
  if (!key) {
    document.getElementById('combineStatusMsg').textContent = '⚠️ Set your API key first.';
    return;
  }
  if (selectedCardsForCombine.length < 2) return;

  var card1 = cards.find(function(c) { return c.id === selectedCardsForCombine[0]; });
  var card2 = cards.find(function(c) { return c.id === selectedCardsForCombine[1]; });
  if (!card1 || !card2) return;

  var instructions = document.getElementById('combineContextNote').value.trim();
  var instrLine = instructions ? '\n\nUser instructions: ' + instructions : '';

  var combinePrompt =
    'Combine these two story notes into ONE new story card.' + instrLine + '\n' +
    'Return ONLY a JSON object with fields: "type" (one of: character, world, arc, quote, idea), ' +
    '"title" (max 6 words), "content" (2-3 sentences).\n\n' +
    'Card A: ' + card1.title + ': ' + card1.content + '\n' +
    'Card B: ' + card2.title + ': ' + card2.content;

  document.getElementById('combineStatusMsg').textContent = '⏳ Combining...';
  document.getElementById('combineConfirmBtn').disabled = true;

  try {
    var raw = await callClaudeForCard(key, combinePrompt, 300);
    raw = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();
    var newCard = JSON.parse(raw);
    if (newCard && newCard.title && VALID_CARD_TYPES.includes(newCard.type)) {
      addCard(newCard.type, newCard.title, newCard.content || '');
      hideCombinePanel();
      showToast('✅ Created "' + newCard.title + '" (' + newCard.type + ')');
    } else {
      throw new Error('Unexpected response format');
    }
  } catch (err) {
    document.getElementById('combineStatusMsg').textContent = '❌ ' + err.message + ' — try again';
    document.getElementById('combineConfirmBtn').disabled = false;
  }
});

// ── 14d: MAP SYNC PANEL ──────────────────────────────────────

// Wire up map sync panel buttons
document.getElementById('mapSyncSkipBtn').addEventListener('click', function() {
  hideMapSyncPanel();
  autoOrganizeMap();
  renderMap();
  unsyncedIds.clear();
  saveUnsyncedIds();
});

document.getElementById('mapSyncConfirmBtn').addEventListener('click', async function() {
  var key = getApiKey();
  if (!key) {
    document.getElementById('mapSyncStatusMsg').textContent = '⚠️ Set your API key first.';
    return;
  }

  var contextNote = document.getElementById('mapSyncContextNote').value.trim();
  var unsyncedCards = Array.from(unsyncedIds)
    .map(function(id) { return cards.find(function(c) { return c.id === id; }); })
    .filter(Boolean);

  if (unsyncedCards.length === 0) {
    hideMapSyncPanel();
    autoOrganizeMap();
    renderMap();
    return;
  }

  document.getElementById('mapSyncStatusMsg').textContent = '⏳ Syncing...';
  document.getElementById('mapSyncConfirmBtn').disabled = true;

  var cardListText = unsyncedCards.map(function(c) {
    return '- [' + c.id + '] ' + c.type + ': ' + c.title + ' — ' + c.content;
  }).join('\n');

  var syncPromptText =
    'Review these story notes and improve their descriptions if needed. Keep them concise (1-3 sentences).' +
    (contextNote ? '\n\nContext: ' + contextNote : '') +
    '\n\nReturn ONLY a JSON array where each object has: "id" (unchanged), "type" (unchanged), "title", "content".\n\n' +
    cardListText;

  try {
    var raw = await callClaudeForCard(key, syncPromptText, 800);
    raw = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();
    var improved = JSON.parse(raw);
    if (Array.isArray(improved)) {
      improved.forEach(function(item) {
        if (!item.id || !item.title) return;
        var card = cards.find(function(c) { return c.id === item.id; });
        if (card && VALID_CARD_TYPES.includes(item.type)) {
          card.title   = item.title;
          card.content = item.content || card.content;
        }
      });
      saveCards();
    }
  } catch(err) {
    // Sync failed — still organize, just with current data
  }

  hideMapSyncPanel();
  autoOrganizeMap();
  renderMap();
  unsyncedIds.clear();
  saveUnsyncedIds();
  showToast('✅ Map organized!');
});

// Wire up toolbar map buttons
document.getElementById('mapSyncBtn').addEventListener('click', function() {
  if (unsyncedIds.size > 0) {
    showMapSyncPanel();
  } else {
    autoOrganizeMap();
    renderMap();
    showToast('Map organized!');
  }
});

document.getElementById('reorgBtn').addEventListener('click', function() {
  autoOrganizeMap();
  renderMap();
  showToast('Map re-organized!');
});


// ============================================================
// INITIALIZE — runs when the page first loads
// ============================================================
renderCards();
initApiKeyUx(); // async: loads key from file → localStorage → shows banner if missing
