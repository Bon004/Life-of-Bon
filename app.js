// ============================================================
// app.js — StoryForge: all the logic
// ============================================================


// ============================================================
// SECTION 1: CARD DATA
// Cards are stored in the browser's localStorage as a JSON string.
// When the page loads we read them back into this 'cards' array.
// ============================================================

let cards = [];

// Try to load saved cards. If none exist, start with an empty array.
try {
  const saved = localStorage.getItem('sf_cards');
  cards = saved ? JSON.parse(saved) : [];
} catch (e) {
  cards = []; // if something went wrong, just start fresh
}

// Load the API key (if the user has saved it before)
let apiKey = localStorage.getItem('sf_api_key') || '';

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

// renderCards: clears all columns and redraws every card from the data
// This is called any time the cards array changes
function renderCards() {
  const columnTypes = ['character', 'world', 'arc', 'quote', 'idea'];

  columnTypes.forEach(function(type) {
    const col = document.getElementById('cards-' + type);
    col.innerHTML = ''; // clear the column

    // Get only the cards that belong to this column
    const colCards = cards.filter(function(c) { return c.type === type; });

    // If column is empty, show a hint
    if (colCards.length === 0) {
      col.innerHTML = '<p class="col-empty">No cards yet.<br>Click "+ Card" to add one.</p>';
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

    // If the API returned an error status, throw it so we handle it below
    if (!response.ok) {
      const err = await response.json().catch(function() { return {}; });
      throw new Error(err.error?.message || 'API error (status ' + response.status + ')');
    }

    // --- Parse the response ---
    const data = await response.json();
    let raw = data.content[0].text.trim();

    // Sometimes Claude wraps JSON in ```json ... ``` — strip those if present
    raw = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();

    // Parse the JSON array
    let newCards;
    try {
      newCards = JSON.parse(raw);
    } catch (e) {
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
// INITIALIZE — runs when the page first loads
// ============================================================
renderCards(); // draw any cards that were saved from last time
