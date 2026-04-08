// ============================================================
// app.js — StoryForge: all the logic
// ============================================================


// ============================================================
// SECTION 1: CARD DATA
// Cards are stored in the browser's localStorage as a JSON string.
// When the page loads we read them back into this 'cards' array.
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

// Color lookup for each card type
const TYPE_COLORS = {
  character: '#3b82f6',
  world:     '#10b981',
  arc:       '#8b5cf6',
  quote:     '#f59e0b',
  idea:      '#ef4444'
};

// ============================================================
// SECTION 2: CARD HELPER FUNCTIONS
// ============================================================

// saveCards: turns our cards array into a text string and stores it
function saveCards() {
  localStorage.setItem('sf_cards', JSON.stringify(cards));
}

// generateId: makes a random short ID like "a3f9b2" for each card
function generateId() {
  return Math.random().toString(36).slice(2, 8);
}

// escapeHtml: prevents any HTML tags in user's text from breaking the page
// Example: if a user types "<b>bold</b>", this turns it into plain text
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
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
  const columnTypes = ['character', 'world', 'arc', 'quote', 'idea'];

  columnTypes.forEach(function(type) {
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
        card[field] = el.textContent.trim();
        saveCards();
      }
    });
  });
}


// ============================================================
// SECTION 3: "+ Card" BUTTONS (manual add)
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
  setStatus('');
}


// ============================================================
// SECTION 6: MODAL MODE TOGGLE (Paste Text vs Upload File)
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
  setStatus('Reading file...');

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
    setStatus('Unsupported file type. Please use .txt .md .jpg .png .heic or .docx');
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
    setStatus('File ready! Click "Organize with AI" to continue.');
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
    setStatus('Image ready! Click "Organize with AI" to continue.');
  };
  reader.readAsDataURL(file);
}

// readAsDocx: reads Word documents using the mammoth.js library
function readAsDocx(file) {
  if (typeof mammoth === 'undefined') {
    setStatus('Word doc reader not loaded yet. Please refresh the page and try again.');
    return;
  }
  const reader = new FileReader();
  reader.onload = function(e) {
    mammoth.extractRawText({ arrayBuffer: e.target.result })
      .then(function(result) {
        fileContent = { type: 'text', text: result.value };
        setStatus('Word doc ready! Click "Organize with AI" to continue.');
      })
      .catch(function() {
        setStatus('Could not read Word doc. Please paste the text in the "Paste Text" tab instead.');
      });
  };
  reader.readAsArrayBuffer(file);
}


// readAsPdf: reads PDF files using the PDF.js library
async function readAsPdf(file) {
  if (typeof pdfjsLib === 'undefined') {
    setStatus('PDF reader not loaded. Please refresh the page and try again.');
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
    setStatus('PDF ready! Click "Organize with AI" to continue.');
  } catch (err) {
    setStatus('Could not read PDF. Try a different file or paste the text instead.');
  }
}


// ============================================================
// SECTION 8: API KEY MANAGEMENT
// ============================================================

document.getElementById('saveApiKey').addEventListener('click', function() {
  const key = document.getElementById('apiKeyInput').value.trim();
  if (key) {
    apiKey = key;
    localStorage.setItem('sf_api_key', key);
    setStatus('✅ API key saved!');
  }
});


// ============================================================
// SECTION 9: ORGANIZE WITH AI
// This is the main feature — sends your notes to Claude and
// gets back organized cards for the canvas.
// ============================================================

document.getElementById('organizeBtn').addEventListener('click', organizeWithAI);

async function organizeWithAI() {

  // --- Get and validate the API key ---
  const key = document.getElementById('apiKeyInput').value.trim() || apiKey;
  if (!key) {
    // Open the API key section so the user sees where to enter it
    document.getElementById('apiKeyDetails').open = true;
    setStatus('⚠️ Please enter your Anthropic API key first.');
    return;
  }
  // Save the key so it's remembered
  apiKey = key;
  localStorage.setItem('sf_api_key', key);

  // --- Figure out which mode is active and get the content ---
  const activeMode = document.querySelector('.mode-btn.active').getAttribute('data-mode');
  const pasteText  = document.getElementById('pasteText').value.trim();

  if (activeMode === 'paste' && !pasteText) {
    setStatus('⚠️ Please paste some text first.');
    return;
  }
  if (activeMode === 'upload' && !fileContent) {
    setStatus('⚠️ Please select a file first.');
    return;
  }

  // --- Collect existing card titles so we can skip duplicates ---
  // We pass these to Claude and ask it not to repeat what's already there
  const existingTitles = cards.map(function(c) { return c.title.toLowerCase(); });

  // --- Build the prompt we'll send to Claude ---
  const prompt =
    'You are a story organizer for an isekai/anime story called "Life of Bon" where the main character gets reincarnated.\n\n' +
    'Extract story elements from the content provided and return ONLY a valid JSON array.\n' +
    'Do not add any explanation, markdown, or code fences — just the raw JSON array.\n\n' +
    'Each item in the array must look exactly like this:\n' +
    '{"type": "character", "title": "Name", "content": "Short description"}\n\n' +
    'Type must be one of:\n' +
    '- "character" → any person, being, or named character\n' +
    '- "world"     → locations, places, world rules, magic systems\n' +
    '- "arc"       → plot points, story events, narrative arcs\n' +
    '- "quote"     → memorable lines or exact dialogue\n' +
    '- "idea"      → loose ideas, themes, future plans\n\n' +
    'Rules:\n' +
    '- Skip anything matching these already-existing titles: ' + (existingTitles.join(', ') || 'none') + '\n' +
    '- Maximum 15 new cards\n' +
    '- Keep content to 1–3 sentences\n' +
    '- If nothing relevant is found, return []\n\n' +
    'Return only the JSON array, nothing else.';

  // --- Build the message content for the API ---
  // For text: just append the notes to the prompt
  // For images: send image + prompt as separate parts
  let messageContent;

  if (activeMode === 'paste') {
    messageContent = prompt + '\n\nContent to organize:\n' + pasteText;

  } else if (fileContent.type === 'text') {
    messageContent = prompt + '\n\nContent to organize:\n' + fileContent.text;

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
  setStatus('⏳ Sending to Claude AI...');
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
        model:      'claude-sonnet-4-5-20250929',
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
    const validTypes = ['character', 'world', 'arc', 'quote', 'idea'];

    newCards.forEach(function(c) {
      // Skip if missing required fields or invalid type
      if (!c.type || !c.title) return;
      if (!validTypes.includes(c.type)) return;

      // Skip if a card with this title already exists
      const alreadyExists = existingTitles.includes(c.title.toLowerCase());
      if (alreadyExists) return;

      addCard(c.type, c.title, c.content || '');
      addedCount++;
    });

    // --- Show success and switch to canvas ---
    const word = addedCount === 1 ? 'card' : 'cards';
    setStatus('✅ Added ' + addedCount + ' new ' + word + ' to your canvas!');
    if (addedCount > 0) setTimeout(generateSummary, 2000);

    // After 1.5 seconds, close the modal and show the canvas
    setTimeout(function() {
      document.querySelector('[data-tab="canvas"]').click();
      closeModal();
    }, 1500);

  } catch (err) {
    // Show a clear error message
    setStatus('❌ ' + err.message);
  } finally {
    // Always re-enable the button after the request finishes
    document.getElementById('organizeBtn').disabled = false;
  }
}


// ============================================================
// HELPER: setStatus — updates the small status line in the modal footer
// ============================================================
function setStatus(msg) {
  document.getElementById('organizeStatus').textContent = msg;
}


// ============================================================
// SECTION 10: SYNC NOTES FROM story-notes/ FOLDER
// Reads all files listed in story-notes/manifest.json,
// sends new ones to Claude, and adds the cards automatically.
// Already-processed files are skipped (tracked in localStorage).
// ============================================================

document.getElementById('syncNotesBtn').addEventListener('click', syncStoryNotes);

async function syncStoryNotes() {
  const key = document.getElementById('apiKeyInput').value.trim() || apiKey;
  if (!key) {
    alert('Please set your API key first — click "+ Add Notes" and expand the 🔑 API Key section.');
    return;
  }

  const btn = document.getElementById('syncNotesBtn');
  btn.disabled = true;

  try {
    // Load the list of files from manifest.json
    const res = await fetch('story-notes/manifest.json');
    if (!res.ok) throw new Error('Could not load story-notes/manifest.json');
    const manifest = await res.json();

    // Check which files we've already processed
    const synced = JSON.parse(localStorage.getItem('sf_synced_files') || '[]');
    const pending = manifest.files.filter(function(f) { return !synced.includes(f); });

    if (pending.length === 0) {
      btn.textContent = '✅ Already synced!';
      setTimeout(function() { btn.textContent = '🔄 Sync Notes'; btn.disabled = false; }, 2500);
      return;
    }

    let totalAdded = 0;

    for (let i = 0; i < pending.length; i++) {
      const filePath = pending[i];
      const fileName = filePath.split('/').pop();
      const ext      = fileName.split('.').pop().toLowerCase();

      btn.textContent = '⏳ Reading ' + fileName + '...';

      let messageContent;

      if (ext === 'jpg' || ext === 'jpeg' || ext === 'png' || ext === 'heic') {
        // Fetch image and convert to base64 for Claude vision
        const blob   = await fetch(filePath).then(function(r) { return r.blob(); });
        const base64 = await new Promise(function(resolve) {
          const reader = new FileReader();
          reader.onload = function(e) { resolve(e.target.result.split(',')[1]); };
          reader.readAsDataURL(blob);
        });
        messageContent = [
          { type: 'image', source: { type: 'base64', media_type: blob.type || 'image/jpeg', data: base64 } },
          { type: 'text',  text: buildSyncPrompt() + '\n\nExtract any story elements from this image.' }
        ];

      } else if (ext === 'pdf') {
        const buffer = await fetch(filePath).then(function(r) { return r.arrayBuffer(); });
        const text   = await extractTextFromPdfBuffer(buffer);
        messageContent = buildSyncPrompt() + '\n\nContent to organize:\n' + text;

      } else if (ext === 'docx') {
        const buffer = await fetch(filePath).then(function(r) { return r.arrayBuffer(); });
        const result = await mammoth.extractRawText({ arrayBuffer: buffer });
        messageContent = buildSyncPrompt() + '\n\nContent to organize:\n' + result.value;

      } else if (ext === 'txt' || ext === 'md') {
        const text = await fetch(filePath).then(function(r) { return r.text(); });
        messageContent = buildSyncPrompt() + '\n\nContent to organize:\n' + text;

      } else {
        // Unsupported file type — mark as done and skip
        synced.push(filePath);
        localStorage.setItem('sf_synced_files', JSON.stringify(synced));
        continue;
      }

      btn.textContent = '✨ Organizing ' + fileName + '...';
      const added = await sendToClaudeAndAddCards(key, messageContent);
      totalAdded += added;

      // Mark this file as processed so we don't re-run it next time
      synced.push(filePath);
      localStorage.setItem('sf_synced_files', JSON.stringify(synced));
    }

    const word = totalAdded === 1 ? 'card' : 'cards';
    btn.textContent = '✅ Added ' + totalAdded + ' ' + word + '!';
    if (totalAdded > 0) setTimeout(generateSummary, 1000);
    setTimeout(function() { btn.textContent = '🔄 Sync Notes'; btn.disabled = false; }, 3000);

  } catch (err) {
    btn.textContent = '❌ ' + err.message;
    setTimeout(function() { btn.textContent = '🔄 Sync Notes'; btn.disabled = false; }, 4000);
  }
}

// buildSyncPrompt: the instructions we send to Claude along with each file
function buildSyncPrompt() {
  const existingTitles = cards.map(function(c) { return c.title.toLowerCase(); });
  return (
    'You are a story organizer for an isekai/anime story called "Life of Bon" where the main character gets reincarnated.\n\n' +
    'Extract story elements from the content provided and return ONLY a valid JSON array.\n' +
    'Do not add any explanation, markdown, or code fences — just the raw JSON array.\n\n' +
    'Each item must look exactly like this:\n' +
    '{"type": "character", "title": "Name", "content": "Short description"}\n\n' +
    'Types:\n' +
    '- "character" → people, beings, named characters\n' +
    '- "world"     → locations, places, world rules, magic systems\n' +
    '- "arc"       → plot points, story events, narrative arcs\n' +
    '- "quote"     → memorable lines or exact dialogue\n' +
    '- "idea"      → loose ideas, themes, future plans\n\n' +
    'Rules:\n' +
    '- Skip anything matching these already-existing titles: ' + (existingTitles.join(', ') || 'none') + '\n' +
    '- Maximum 15 new cards per file\n' +
    '- Keep content to 1–3 sentences\n' +
    '- Return [] if nothing story-relevant is found\n\n' +
    'Return only the JSON array, nothing else.'
  );
}

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

// sendToClaudeAndAddCards: calls the API and adds whatever cards come back
async function sendToClaudeAndAddCards(key, messageContent) {
  const existingTitles = cards.map(function(c) { return c.title.toLowerCase(); });

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type':                              'application/json',
      'x-api-key':                                 key,
      'anthropic-version':                         '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify({
      model:      'claude-sonnet-4-5-20250929',
      max_tokens: 2048,
      messages:   [{ role: 'user', content: messageContent }]
    })
  });

  const data = await response.json();
  if (!response.ok) throw new Error(data?.error?.message || 'API error (status ' + response.status + ')');

  let raw = (data.content?.[0]?.text || '').trim();
  raw = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();

  let newCards;
  try { newCards = JSON.parse(raw); } catch (e) { return 0; }
  if (!Array.isArray(newCards)) return 0;

  const validTypes = ['character', 'world', 'arc', 'quote', 'idea'];
  let count = 0;

  newCards.forEach(function(c) {
    if (!c.type || !c.title) return;
    if (!validTypes.includes(c.type)) return;
    if (existingTitles.includes(c.title.toLowerCase())) return;
    addCard(c.type, c.title, c.content || '');
    count++;
  });

  return count;
}


// ============================================================
// SECTION 11: MAP VIEW — drag cards, draw connection lines
// ============================================================

document.getElementById('viewBoard').addEventListener('click', function() {
  viewMode = 'board';
  document.getElementById('viewBoard').classList.add('active');
  document.getElementById('viewMap').classList.remove('active');
  document.getElementById('boardView').classList.remove('hidden');
  document.getElementById('mapView').classList.add('hidden');
  document.getElementById('mapHint').classList.add('hidden');
  cancelConnect();
});

document.getElementById('viewMap').addEventListener('click', function() {
  viewMode = 'map';
  document.getElementById('viewMap').classList.add('active');
  document.getElementById('viewBoard').classList.remove('active');
  document.getElementById('mapView').classList.remove('hidden');
  document.getElementById('boardView').classList.add('hidden');
  document.getElementById('mapHint').classList.remove('hidden');
  renderMap();
});

// Escape cancels connection mode
document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') {
    if (connectingFrom) cancelConnect();
    closeModal();
  }
});

// renderMap: place all cards as free-floating nodes on the canvas
function renderMap() {
  const mapInner = document.getElementById('mapInner');

  // Remove old map cards (keep the SVG)
  mapInner.querySelectorAll('.map-card').forEach(function(el) { el.remove(); });

  // Assign default positions for cards that don't have one yet
  // Spread by type into columns, stacked vertically
  var typeOffsets = {
    character: 60,  world: 300, arc: 540, quote: 780, idea: 1020
  };
  var typeCounters = { character: 0, world: 0, arc: 0, quote: 0, idea: 0 };

  cards.forEach(function(card) {
    if (!cardPositions[card.id]) {
      var col = typeOffsets[card.type] || 60;
      var row = typeCounters[card.type] || 0;
      cardPositions[card.id] = {
        x: col + (row % 2) * 230,
        y: 60 + Math.floor(row / 2) * 180
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

    el.innerHTML =
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
}

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

    function onMove(e) {
      moved = true;
      var newX = Math.max(0, startLeft + (e.clientX - startX));
      var newY = Math.max(0, startTop  + (e.clientY - startY));
      cardPositions[cardId] = { x: newX, y: newY };
      el.style.left = newX + 'px';
      el.style.top  = newY + 'px';
      drawConnections();
    }

    function onUp() {
      el.classList.remove('dragging');
      if (moved) saveCardPositions();
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    }

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
}

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

    // Visual line
    var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', d);
    path.setAttribute('stroke', '#94a3b8');
    path.setAttribute('stroke-width', '1.5');
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke-dasharray', '5,4');
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
    circle.setAttribute('fill', '#ffffff');
    circle.setAttribute('stroke', '#94a3b8');
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


// ============================================================
// SECTION 12: STORY SUMMARY
// AI-generated overview shown at the bottom of the canvas.
// Auto-refreshes after notes are added or synced.
// ============================================================

document.getElementById('refreshSummary').addEventListener('click', generateSummary);

async function generateSummary() {
  var key = apiKey || localStorage.getItem('sf_api_key');
  if (!key) {
    document.getElementById('summaryText').textContent = 'Set your API key to generate a story overview.';
    return;
  }
  if (cards.length === 0) {
    document.getElementById('summaryText').textContent = 'Add some cards first to see a story overview.';
    return;
  }

  document.getElementById('summaryText').textContent = 'Generating overview...';

  // Build text of all cards grouped by type
  var byType = {};
  cards.forEach(function(c) {
    if (!byType[c.type]) byType[c.type] = [];
    byType[c.type].push(c.title + ': ' + c.content);
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
        model:      'claude-sonnet-4-5-20250929',
        max_tokens: 120,
        messages: [{
          role:    'user',
          content: 'Write a 1–2 sentence story overview for an isekai light novel called "Life of Bon" based on these notes. Be specific. Max 50 words.\n\n' + storyData
        }]
      })
    });

    var data = await res.json();
    if (!res.ok) throw new Error(data?.error?.message || 'API error');

    var text = (data.content?.[0]?.text || '').trim();
    document.getElementById('summaryText').textContent = text;
    localStorage.setItem('sf_summary', text);

  } catch (err) {
    document.getElementById('summaryText').textContent = 'Could not generate summary — ' + err.message;
  }
}

// Load saved summary on startup
(function() {
  var saved = localStorage.getItem('sf_summary');
  if (saved) document.getElementById('summaryText').textContent = saved;
})();


// ============================================================
// SECTION 13: CLAUDE CHAT
// A writing assistant panel with full story context.
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
}

function closeChat() {
  chatIsOpen = false;
  document.getElementById('chatPanel').classList.remove('open');
}

// buildStoryContext: summarises all cards for Claude's system context
function buildStoryContext() {
  if (cards.length === 0) return 'No story notes added yet.';

  var byType = {};
  cards.forEach(function(c) {
    if (!byType[c.type]) byType[c.type] = [];
    byType[c.type].push('• ' + c.title + (c.content ? ': ' + c.content : ''));
  });

  var ctx = 'Current story notes for "Life of Bon":\n\n';
  var labels = { character: 'Characters', world: 'World Building', arc: 'Plot & Arcs', quote: 'Key Quotes', idea: 'Ideas' };
  Object.keys(byType).forEach(function(type) {
    ctx += (labels[type] || type) + ':\n' + byType[type].join('\n') + '\n\n';
  });
  return ctx;
}

async function sendChatMessage() {
  var input = document.getElementById('chatInput');
  var msg   = input.value.trim();
  if (!msg) return;

  var key = apiKey || localStorage.getItem('sf_api_key');
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
    messages = messages.concat(chatHistory);

    var res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type':                              'application/json',
        'x-api-key':                                 key,
        'anthropic-version':                         '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model:      'claude-sonnet-4-5-20250929',
        max_tokens: 1024,
        system:     'You are a creative writing assistant helping develop an isekai/anime light novel called "Life of Bon" where the main character Bon gets reincarnated. Be specific, creative, and concise. Help with writing, brainstorming, characters, plot, and dialogue.',
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

    // Keep history trimmed to avoid token overflow
    if (chatHistory.length > 20) chatHistory = chatHistory.slice(-20);

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
// INITIALIZE — runs when the page first loads
// ============================================================
renderCards();
