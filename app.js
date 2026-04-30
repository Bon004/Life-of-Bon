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
// SECTION 0: PROJECT BOOTSTRAP
// ─────────────────────────────────────────────────────────────
// Runs before anything else. Establishes which project is active
// and provides projectKey() for all per-project localStorage reads.
// ============================================================

(function() {
  var storedProjects = localStorage.getItem('sf_projects');
  var storedActive   = localStorage.getItem('sf_active_project');
  window._sf_projects       = storedProjects ? JSON.parse(storedProjects) : [];
  window._sf_activeProjectId = storedActive || '';

  // Auto-migrate legacy single-story data → "' + currentProjectName + '" project
  // Old sf_* keys are left in place as a safety net (not deleted).
  if (!window._sf_activeProjectId && localStorage.getItem(projectKey('cards')) !== null) {
    var legacyId = 'proj_lob_' + Date.now();
    window._sf_projects = [{ id: legacyId, name: 'Life of Bon', format: 'novel', brief: '', createdAt: new Date().toISOString() }];
    localStorage.setItem('sf_projects', JSON.stringify(window._sf_projects));
    var legacySuffixes = [
      'cards','positions','connections','arc_order','arc_sequence_map',
      'situation_order','outline','character_profiles','writing_copy','writing_draft',
      'draft_history','writing_split_ratio','word_goal','zoom','batches',
      'dismissed_batches','unsynced_ids','arcs_timeline_h','brainstorm_height',
      'brainstorm_collapsed','summary_expanded','summary','chat_memory',
      'suggestions','synced_files'
    ];
    legacySuffixes.forEach(function(suffix) {
      var v = localStorage.getItem('sf_' + suffix);
      if (v !== null) localStorage.setItem(legacyId + '_' + suffix, v);
    });
    window._sf_activeProjectId = legacyId;
    localStorage.setItem('sf_active_project', legacyId);
  }

  // If no data at all, create a blank default project
  if (!window._sf_activeProjectId || !window._sf_projects.length) {
    var newId = 'proj_' + Date.now();
    window._sf_projects = [{ id: newId, name: 'My Project', format: 'novel', brief: '', createdAt: new Date().toISOString() }];
    localStorage.setItem('sf_projects', JSON.stringify(window._sf_projects));
    window._sf_activeProjectId = newId;
    localStorage.setItem('sf_active_project', newId);
  }

  // Migrate existing projects missing format/brief fields
  var migrated = false;
  window._sf_projects = window._sf_projects.map(function(p) {
    if (!p.format) { p.format = 'novel'; migrated = true; }
    if (p.brief === undefined) { p.brief = ''; migrated = true; }
    return p;
  });
  if (migrated) localStorage.setItem('sf_projects', JSON.stringify(window._sf_projects));

  // Resolve active project — fall back to first if registry is corrupted
  var found = window._sf_projects.find(function(p) { return p.id === window._sf_activeProjectId; });
  if (!found) {
    found = window._sf_projects[0];
    window._sf_activeProjectId = found.id;
    localStorage.setItem('sf_active_project', found.id);
    console.warn('[StoryForge] Active project not found in registry — reset to first project');
  }
  window._sf_activeProject      = found;
  window._sf_currentProjectName  = found.name;
  window._sf_currentProjectFormat = found.format || 'novel';
  window._sf_currentProjectBrief  = found.brief  || '';
})();

var projects              = window._sf_projects;
var activeProjectId       = window._sf_activeProjectId;
var activeProject         = window._sf_activeProject;
var currentProjectName    = window._sf_currentProjectName;
var currentProjectFormat  = window._sf_currentProjectFormat;
var currentProjectBrief   = window._sf_currentProjectBrief;

function projectKey(suffix) {
  if (!activeProjectId) {
    console.error('[StoryForge] projectKey() called with no activeProjectId — data may be lost');
  }
  return activeProjectId + '_' + suffix;
}

// ============================================================
// SECTION 1: CARD DATA
// ─────────────────────────────────────────────────────────────
// What it does: Initializes all persistent state by reading from
// localStorage. This runs once when the page loads.
//
// Reads:  per-project localStorage keys via projectKey()
// Writes: populates cards[], cardPositions{}, connections[],
//         apiKey, mapZoom
// ============================================================

let cards = [];

try {
  const saved = localStorage.getItem(projectKey('cards'));
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

try { cardPositions = JSON.parse(localStorage.getItem(projectKey('positions')) || '{}'); } catch(e) {}
try { connections   = JSON.parse(localStorage.getItem(projectKey('connections')) || '[]'); } catch(e) {}

// Map zoom level (0.1 = very far out, 5.0 = very zoomed in)
var mapZoom = parseFloat(localStorage.getItem(projectKey('zoom')) || '1.0');

// Visual translate applied to mapInner so cards are centered when zoom is too low
// for scroll-centering alone (scroll can't go negative). Reset by centerMapOnCards().
var mapTranslateX = 0, mapTranslateY = 0;

// Selection state for the combine-two-cards flow
var selectedCardsForCombine = [];
var wasDragging = false;

// Track new/edited cards not yet organized on the map
var unsyncedIds = new Set();
try {
  var _savedUnsynced = JSON.parse(localStorage.getItem(projectKey('unsynced_ids')) || '[]');
  unsyncedIds = new Set(_savedUnsynced);
} catch(e) { unsyncedIds = new Set(); }

// Outline tab: persists selected node across re-renders
var selectedOutlineNodeId = null;

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

// Jarvis tool definitions — passed to the Claude API to enable agentic actions.
const JARVIS_TOOLS = [
  {
    name: 'navigate_tab',
    description: 'Switch the visible tab in the StoryForge UI. Use this when the user asks to go to, open, or show a specific section of the app.',
    input_schema: {
      type: 'object',
      properties: {
        tab_name: {
          type: 'string',
          enum: ['home', 'canvas', 'writing', 'characters', 'arcs', 'outline'],
          description: 'The tab to navigate to.'
        }
      },
      required: ['tab_name']
    }
  },
  {
    name: 'create_card',
    description: 'Create a new story card on the canvas. Use this when the user asks to add, create, or save a new character, location, arc, idea, or any story element.',
    input_schema: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          enum: ['character','world','location','faction','arc','event','scene','lore','relationship','theme','quote','idea'],
          description: 'The card type. Pick the most specific type that fits.'
        },
        title: {
          type: 'string',
          description: 'Short, unique title for the card.'
        },
        content: {
          type: 'string',
          description: '2-5 sentences of clear reference material.'
        }
      },
      required: ['type', 'title', 'content']
    }
  },
  {
    name: 'edit_card',
    description: 'Edit an existing story card — update its title, content, or both. Identify the card by its exact id (preferred) or its exact title. You must provide at least one of card_id or card_title, and at least one of new_title or new_content.',
    input_schema: {
      type: 'object',
      properties: {
        card_id: {
          type: 'string',
          description: 'The unique id of the card to edit (preferred over card_title).'
        },
        card_title: {
          type: 'string',
          description: 'The exact current title of the card (fallback if card_id is not known).'
        },
        new_title: {
          type: 'string',
          description: 'Replacement title. Omit to keep current title.'
        },
        new_content: {
          type: 'string',
          description: 'Replacement content. Omit to keep current content.'
        }
      },
      required: []
    }
  },
  {
    name: 'search_cards',
    description: 'Search all story cards by title and content. Returns matching cards as structured data. Use this before edit_card when you do not know a card\'s id, or to answer questions about what story notes exist.',
    input_schema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search term to match against card titles and content (case-insensitive substring match).'
        }
      },
      required: ['query']
    }
  },
  {
    name: 'read_full_context',
    description: 'Returns the complete story context including all card content and character profiles. Use this when you need detailed information about a specific character or arc that was not included in the initial summary.',
    input_schema: {
      type: 'object',
      properties: {},
      required: []
    }
  },
  {
    name: 'write_draft',
    description: 'Write content to the Draft section of the Writing tab. Draft is scratch space for AI-generated output — the user manually promotes content to Working Copy. Use mode "append" to add below existing content (default), or "replace" to clear the draft and write fresh.',
    input_schema: {
      type: 'object',
      properties: {
        content: {
          type: 'string',
          description: 'Plain text to write. Use double line breaks to separate paragraphs. Single line breaks within a paragraph are preserved as line breaks.'
        },
        mode: {
          type: 'string',
          enum: ['append', 'replace'],
          description: 'append (default): add below existing draft content. replace: clear the draft first, then write.'
        }
      },
      required: ['content']
    }
  },
  {
    name: 'create_outline_node',
    description: 'Add a node to the story Outline. Nodes form a hierarchy: act → arc → chapter → scene. Omit parent_id to create a root-level act.',
    input_schema: {
      type: 'object',
      properties: {
        type:      { type: 'string', enum: ['act','arc','chapter','scene'], description: 'The level of this node in the outline hierarchy.' },
        title:     { type: 'string', description: 'Title for this outline node.' },
        parent_id: { type: 'string', description: 'ID of the parent node. Omit for root-level acts.' }
      },
      required: ['type', 'title']
    }
  },
  {
    name: 'edit_outline_node',
    description: 'Update the title, beats (bullet-point notes), or status of an existing outline node.',
    input_schema: {
      type: 'object',
      properties: {
        id:     { type: 'string', description: 'ID of the outline node to edit.' },
        title:  { type: 'string', description: 'New title (omit to keep current).' },
        beats:  { type: 'array', items: { type: 'string' }, description: 'Full replacement beats array (omit to keep current).' },
        status: { type: 'string', enum: ['not_started','drafted','done'], description: 'New status (omit to keep current).' }
      },
      required: ['id']
    }
  },
  {
    name: 'read_outline',
    description: 'Returns the full story outline as a JSON array of nodes with their hierarchy, beats, linked cards, and status.',
    input_schema: { type: 'object', properties: {}, required: [] }
  },
  {
    name: 'link_card_to_node',
    description: 'Attach an existing canvas card to an outline node so they stay connected.',
    input_schema: {
      type: 'object',
      properties: {
        node_id: { type: 'string', description: 'ID of the outline node.' },
        card_id: { type: 'string', description: 'ID of the canvas card to link.' }
      },
      required: ['node_id', 'card_id']
    }
  },
  {
    name: 'unlink_card_from_node',
    description: 'Remove a canvas card link from an outline node.',
    input_schema: {
      type: 'object',
      properties: {
        node_id: { type: 'string', description: 'ID of the outline node.' },
        card_id: { type: 'string', description: 'ID of the canvas card to unlink.' }
      },
      required: ['node_id', 'card_id']
    }
  }
];

// Valid card types accepted by the app. Used for validating AI responses.
// 'world' kept for backwards-compat with existing localStorage cards.
const VALID_CARD_TYPES = [
  'character', 'world', 'location', 'faction',
  'arc', 'event', 'scene',
  'lore', 'relationship', 'theme',
  'quote', 'idea'
];

// Maps every valid type to one of the 5 board columns.
// New types are routed to the column that fits best visually.
const TYPE_TO_COLUMN = {
  character:   'character',
  world:       'world',
  location:    'world',
  faction:     'world',
  lore:        'world',
  arc:         'arc',
  event:       'arc',
  scene:       'arc',
  relationship:'idea',
  theme:       'idea',
  quote:       'quote',
  idea:        'idea'
};

// The 5 physical column IDs that exist in the HTML.
const COLUMN_TYPES = ['character', 'world', 'arc', 'quote', 'idea'];

// Format-based default column labels. Each entry: { label, strip }.
// strip = explicit short form for the vertical strip (never sliced from label).
const FORMAT_COLUMNS = {
  novel:      { character: { label: 'Characters',   strip: 'Char' }, world: { label: 'World Building', strip: 'Wrld' }, arc: { label: 'Plot & Arcs',    strip: 'Plot' }, quote: { label: 'Key Quotes', strip: 'Quot' }, idea: { label: 'Ideas', strip: 'Idea' } },
  biography:  { character: { label: 'People',       strip: 'Pepl' }, world: { label: 'Research',       strip: 'Rsrc' }, arc: { label: 'Structure',      strip: 'Strc' }, quote: { label: 'Key Quotes', strip: 'Quot' }, idea: { label: 'Ideas', strip: 'Idea' } },
  memoir:     { character: { label: 'People',       strip: 'Pepl' }, world: { label: 'Context',        strip: 'Cntx' }, arc: { label: 'Structure',      strip: 'Strc' }, quote: { label: 'Key Quotes', strip: 'Quot' }, idea: { label: 'Ideas', strip: 'Idea' } },
  nonfiction: { character: { label: 'People',       strip: 'Pepl' }, world: { label: 'Research',       strip: 'Rsrc' }, arc: { label: 'Structure',      strip: 'Strc' }, quote: { label: 'Key Quotes', strip: 'Quot' }, idea: { label: 'Ideas', strip: 'Idea' } },
  screenplay: { character: { label: 'Characters',   strip: 'Char' }, world: { label: 'Setting',        strip: 'Set.' }, arc: { label: 'Story & Scenes', strip: 'Scne' }, quote: { label: 'Key Lines',  strip: 'Line' }, idea: { label: 'Ideas', strip: 'Idea' } },
  other:      { character: { label: 'Characters',   strip: 'Char' }, world: { label: 'Setting',        strip: 'Set.' }, arc: { label: 'Structure',      strip: 'Strc' }, quote: { label: 'Key Quotes', strip: 'Quot' }, idea: { label: 'Ideas', strip: 'Idea' } }
};

// H1 — Global card search query (empty = show all)
var cardSearchQuery = '';

// ============================================================
// STATIC STORY DATA — Enneagram, 36 Situations, 8 Sequences
// Used by the Characters tab and Arcs & Timeline tab.
// ============================================================

const ENNEAGRAM_TYPES = [
  { id: 1, name: 'The Reformer',    coreDesire: 'To be good, right, and virtuous',                 coreFear: 'Being corrupt or defective',              keyTraits: ['Principled', 'Responsible', 'Idealistic', 'Self-disciplined'] },
  { id: 2, name: 'The Helper',      coreDesire: 'To be loved and needed',                          coreFear: 'Being unloved or unwanted',                keyTraits: ['Generous', 'Empathetic', 'Warm', 'Relationship-focused'] },
  { id: 3, name: 'The Achiever',    coreDesire: 'To be valuable and admired',                      coreFear: 'Being worthless or a failure',             keyTraits: ['Ambitious', 'Adaptable', 'Driven', 'Image-conscious'] },
  { id: 4, name: 'The Individualist', coreDesire: 'To be authentic and significant',               coreFear: 'Being ordinary or without identity',       keyTraits: ['Creative', 'Introspective', 'Sensitive', 'Melancholic'] },
  { id: 5, name: 'The Investigator', coreDesire: 'To be competent and knowledgeable',              coreFear: 'Being incompetent or helpless',            keyTraits: ['Analytical', 'Observant', 'Independent', 'Curious'] },
  { id: 6, name: 'The Loyalist',    coreDesire: 'To have security and trusted support',            coreFear: 'Being abandoned or without support',       keyTraits: ['Trustworthy', 'Responsible', 'Skeptical', 'Committed'] },
  { id: 7, name: 'The Enthusiast',  coreDesire: 'To be satisfied and experience all possibilities', coreFear: 'Being trapped or deprived',               keyTraits: ['Optimistic', 'Spontaneous', 'Adventurous', 'Scattered'] },
  { id: 8, name: 'The Challenger',  coreDesire: 'To be independent and in control',                coreFear: 'Being controlled or powerless',            keyTraits: ['Dominant', 'Assertive', 'Protective', 'Strong-willed'] },
  { id: 9, name: 'The Peacemaker',  coreDesire: 'To be at peace and in harmony',                   coreFear: 'Being separated or in conflict',           keyTraits: ['Accepting', 'Easygoing', 'Mediating', 'Passive'] }
];

const DRAMATIC_SITUATIONS = [
  { id:  1, name: 'Supplication',                      description: 'A supplicant begs a powerful figure for help or mercy.' },
  { id:  2, name: 'Deliverance',                       description: 'A character is rescued from a dangerous or oppressive situation.' },
  { id:  3, name: 'Crime Pursued by Vengeance',        description: 'A crime is committed and the criminal is hunted down.' },
  { id:  4, name: 'Vengeance Taken for Kin',           description: 'One family member seeks revenge against another.' },
  { id:  5, name: 'Pursuit',                           description: 'One character pursues another across distance or obstacles.' },
  { id:  6, name: 'Disaster',                          description: 'A calamity strikes a character or community, causing widespread suffering.' },
  { id:  7, name: 'Falling Prey to Cruelty',           description: 'An innocent character suffers at the hands of another or through misfortune.' },
  { id:  8, name: 'Revolt',                            description: 'A character rebels against authority, oppression, or an unjust system.' },
  { id:  9, name: 'Daring Enterprise',                 description: 'A character attempts a bold, dangerous, or ambitious undertaking.' },
  { id: 10, name: 'Abduction',                         description: 'A character is kidnapped or taken against their will.' },
  { id: 11, name: 'The Enigma',                        description: 'A character must solve a mystery or discover a hidden secret.' },
  { id: 12, name: 'Obtaining',                         description: 'A character struggles to acquire something desired or necessary.' },
  { id: 13, name: 'Enmity of Kin',                     description: 'Conflict or hatred arises between family members.' },
  { id: 14, name: 'Rivalry of Kin',                    description: 'Siblings or family members compete for power, love, or resources.' },
  { id: 15, name: 'Murderous Adultery',                description: 'A spouse commits murder to enable or as a result of adultery.' },
  { id: 16, name: 'Madness',                           description: 'A character descends into insanity or psychological breakdown.' },
  { id: 17, name: 'Fatal Imprudence',                  description: 'A character\'s recklessness leads to their downfall or death.' },
  { id: 18, name: 'Involuntary Crimes of Love',        description: 'A character commits a crime unwillingly due to passion.' },
  { id: 19, name: 'Slaying of Kin Unrecognized',       description: 'A character kills a family member without knowing their identity.' },
  { id: 20, name: 'Self-Sacrifice for an Ideal',       description: 'A character sacrifices themselves for a principle or greater cause.' },
  { id: 21, name: 'Self-Sacrifice for Kin',            description: 'A character sacrifices themselves for the welfare of family.' },
  { id: 22, name: 'All Sacrificed for Passion',        description: 'A character abandons everything — family, duty, morality — for love or desire.' },
  { id: 23, name: 'Necessity of Sacrificing Loved Ones', description: 'A character must harm a loved one to achieve their goal.' },
  { id: 24, name: 'Rivalry of Superior vs. Inferior',  description: 'Conflict arises between characters of vastly different standing.' },
  { id: 25, name: 'Adultery',                          description: 'Infidelity creates conflict and complications in a relationship.' },
  { id: 26, name: 'Crimes of Love',                    description: 'A character commits a crime motivated by romantic passion or jealousy.' },
  { id: 27, name: 'Discovery of Dishonor of a Loved One', description: 'A character learns that someone they love has done something shameful.' },
  { id: 28, name: 'Obstacles to Love',                 description: 'External or internal forces prevent two characters from being together.' },
  { id: 29, name: 'An Enemy Loved',                    description: 'A character discovers they have fallen in love with their enemy.' },
  { id: 30, name: 'Ambition',                          description: 'A character pursues power or success, often at great cost to others.' },
  { id: 31, name: 'Conflict with a God',               description: 'A character struggles against divine will, fate, or a supernatural force.' },
  { id: 32, name: 'Mistaken Jealousy',                 description: 'Jealousy based on false assumptions causes conflict.' },
  { id: 33, name: 'Erroneous Judgment',                description: 'A character makes a wrong decision with serious consequences.' },
  { id: 34, name: 'Remorse',                           description: 'A character is consumed by guilt and seeks redemption for past wrongs.' },
  { id: 35, name: 'Recovery of a Lost One',            description: 'A character searches for and attempts to recover someone or something lost.' },
  { id: 36, name: 'Loss of Loved Ones',                description: 'A character experiences the death or permanent loss of someone dear.' }
];

const EIGHT_SEQUENCES = [
  { number: 1, act: 'Act 1', name: 'Status Quo & Inciting Incident',  description: 'Introduce the protagonist in their ordinary world. Establish tone and hook. Present the event that kicks off the story.' },
  { number: 2, act: 'Act 1', name: 'Predicament & Lock In',           description: 'The central conflict comes into focus. The protagonist resists or accepts the call until a point of no return locks them in.' },
  { number: 3, act: 'Act 2', name: 'First Obstacle & Raising Stakes', description: 'The protagonist faces initial challenges they cannot escape. Early setback. Stakes escalate for main and subplots.' },
  { number: 4, act: 'Act 2', name: 'Midpoint Revelation',             description: 'Tension peaks at the story\'s midpoint. The protagonist gains a new understanding that shifts their approach or goal.' },
  { number: 5, act: 'Act 2', name: 'Subplot & Rising Action',         description: 'Subplots deepen complications while tension builds. The protagonist pursues conflicting goals, intensifying drama.' },
  { number: 6, act: 'Act 2', name: 'All Is Lost',                     description: 'The biggest obstacle and lowest point. Stakes, tension, and drama peak — readers doubt a positive outcome is possible.' },
  { number: 7, act: 'Act 3', name: 'New Tension & Twist',             description: 'Faster-paced action with a new twist or revelation. The protagonist revises their goal with renewed energy.' },
  { number: 8, act: 'Act 3', name: 'Resolution & Finale',             description: 'The final confrontation. All loose threads are tied up. Character arcs resolved. A new status quo is established.' }
];

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
  localStorage.setItem(projectKey('cards'), JSON.stringify(cards));
}

// generateId: makes a random short ID like "a3f9b2" for each card
function generateId() {
  return Math.random().toString(36).slice(2, 8);
}

// escapeHtml: converts special characters so they're safe to put inside innerHTML
function escapeHtml(str) {
  return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// relativeTime: returns a human-readable relative time string like "2d ago"
function relativeTime(isoStr) {
  if (!isoStr) return '';
  var diff = Date.now() - new Date(isoStr).getTime();
  var mins  = Math.floor(diff / 60000);
  var hours = Math.floor(diff / 3600000);
  var days  = Math.floor(diff / 86400000);
  var weeks = Math.floor(days / 7);
  var months = Math.floor(days / 30);
  if (mins  < 1)   return 'just now';
  if (mins  < 60)  return mins  + 'm ago';
  if (hours < 24)  return hours + 'h ago';
  if (days  < 7)   return days  + 'd ago';
  if (weeks < 5)   return weeks + 'w ago';
  return months + 'mo ago';
}

// placeCaretAtEnd: moves the cursor to the end of a contenteditable element
function placeCaretAtEnd(el) {
  var range = document.createRange();
  var sel   = window.getSelection();
  range.selectNodeContents(el);
  range.collapse(false);
  sel.removeAllRanges();
  sel.addRange(range);
}

// buildExistingCardsContext: returns a compact summary of up to 20 existing cards
// so Claude can detect conflicts or superseded information in new notes.
function buildExistingCardsContext(existingCards) {
  if (!existingCards || existingCards.length === 0) return '';
  var sample = existingCards.slice(-20); // most recent 20
  var lines = sample.map(function(c) {
    return '[' + c.type + '] ' + c.title + ': ' + (c.content || '').slice(0, 90);
  });
  return 'Existing story cards (for conflict detection):\n' + lines.join('\n');
}

// buildPrompt: returns the Claude prompt for the "Organize with AI" button.
// existingTitles — array of strings to skip (duplicate prevention)
// existingCards  — array of card objects to check for conflicts (optional)
function buildPrompt(existingTitles, existingCards) {
  const skipLine = existingTitles && existingTitles.length > 0
    ? 'Skip anything matching these already-existing titles: ' + existingTitles.join(', ') + '.'
    : '';
  const existingContext = buildExistingCardsContext(existingCards);
  return [
    'You are a story editor assistant. Treat the notes below as grounded source material for a story — not something to briefly summarize.',
    '',
    'STEP 1 — Analyze document structure:',
    'Scan the entire input and identify its major sections using headings, labels, and obvious breaks (blank lines, separators, etc.).',
    'Think of it like a story bible: character sections, worldbuilding, arcs, notes, etc.',
    '',
    'STEP 2 — Extract section by section:',
    'Process the notes section by section. For each section, determine what kind of content it contains, then identify each distinct story element and turn it into one card.',
    '',
    'EXTRACTION RULES:',
    '  - Create as many cards as the content actually warrants — there is NO upper limit.',
    '  - Each card must represent ONE clearly distinct story element.',
    '  - Do NOT compress everything into a handful of cards.',
    '  - Do NOT merge unrelated elements just to reduce the card count.',
    '  - Do NOT skip specific details, names, rules, or events.',
    '  - Merge ONLY when two notes clearly describe the exact same element; then combine all details into one richer card.',
    '',
    'Card types — use the most specific type that fits:',
    '  character    — named people or beings',
    '  relationship — dynamics or connections between characters',
    '  location     — specific places, regions, realms',
    '  faction      — groups, organizations, factions, teams',
    '  lore         — world rules, magic systems, cosmology, history',
    '  arc          — narrative arcs or phases of the story',
    '  event        — specific plot events or turning points',
    '  scene        — individual scenes or scene fragments',
    '  theme        — themes, motifs, emotional throughlines',
    '  quote        — near-verbatim memorable dialogue or lines',
    '  idea         — open questions, unresolved canon, future ideas (prefix title with "[Idea]")',
    '  world        — general worldbuilding that does not fit a more specific type',
    '',
    'Return a JSON array. Each object must have these fields:',
    '  "type"           — one of the types listed above',
    '  "title"          — short, specific, unique name or label',
    '  "content"        — 1–2 sentence summary of the card (always required)',
    '  "source_section" — the heading or subsection name in the notes where this card\'s information mainly came from; use "General" if unclear',
    '  "tags"           — array of 2–5 short lowercase labels (e.g. ["protagonist","arc-1","reincarnated"])',
    '  "sections"       — (optional) for character, location, faction, lore, and world cards only: an object with labeled sub-fields.',
    '                     Use short descriptive keys, e.g. { "Background": "...", "Role": "...", "Traits": "..." }.',
    '                     Keep each sub-field value to 1–2 sentences. Omit "sections" entirely for arc, event, scene, theme, quote, idea, relationship cards.',
    '',
    existingContext,
    existingContext ? 'If a new card clearly conflicts with or supersedes an existing card, append "[Note: may supersede: <title>]" at the end of its content field.' : '',
    skipLine,
    'Respond with ONLY the raw JSON array. No commentary, no markdown fences, no explanations.'
  ].filter(Boolean).join('\n');
}

// buildSyncPrompt: same as buildPrompt but used for the Sync Notes batch job
// existingTitles — array of strings to skip
// existingCards  — array of card objects to check for conflicts (optional)
function buildSyncPrompt(existingTitles, existingCards) {
  const skipLine = existingTitles && existingTitles.length > 0
    ? 'Skip anything matching these already-existing titles: ' + existingTitles.join(', ') + '.'
    : '';
  const existingContext = buildExistingCardsContext(existingCards);
  return [
    'You are a story editor assistant. Read the content below and extract story elements.',
    'IMPORTANT: If the content is NOT related to a story, characters, plot, or worldbuilding, return an empty array [].',
    '',
    'EXTRACTION RULES:',
    '  - Create as many cards as the content warrants — there is NO upper limit.',
    '  - Each card must represent ONE clearly distinct story element.',
    '  - Do NOT merge unrelated elements. Merge only when two notes describe the exact same element.',
    '  - Do NOT skip specific details, names, rules, or events.',
    '',
    'Card types — use the most specific type that fits:',
    '  character    — named people or beings',
    '  relationship — dynamics or connections between characters',
    '  location     — specific places, regions, realms',
    '  faction      — groups, organizations, factions, teams',
    '  lore         — world rules, magic systems, cosmology, history',
    '  arc          — narrative arcs or phases of the story',
    '  event        — specific plot events or turning points',
    '  scene        — individual scenes or scene fragments',
    '  theme        — themes, motifs, emotional throughlines',
    '  quote        — near-verbatim memorable dialogue or lines',
    '  idea         — open questions, unresolved canon, future ideas (prefix title with "[Idea]")',
    '  world        — general worldbuilding not covered by more specific types',
    '',
    'Return a JSON array. Each object must have exactly these fields:',
    '  "type"           — one of the types listed above',
    '  "title"          — short, specific, unique name or label',
    '  "content"        — 3–6 sentences of clear reference material as a coherent paragraph',
    '  "source_section" — heading or section name from the notes (use "General" if unclear)',
    '  "tags"           — array of 2–5 short lowercase labels',
    '',
    existingContext,
    existingContext ? 'If a new card clearly conflicts with or supersedes an existing card, append "[Note: may supersede: <title>]" at the end of its content field.' : '',
    skipLine,
    'Respond with ONLY the raw JSON array. No commentary, no markdown fences, no explanations.'
  ].filter(Boolean).join('\n');
}

// addCard: creates a new card object and adds it to the cards array.
// Optional `extra` object is merged in (batchId, source_section, tags, etc.).
function addCard(type, title, content, extra) {
  const now = new Date().toISOString();
  const card = Object.assign({
    id:          generateId(),
    type:        type,
    title:       title || 'Untitled',
    content:     content || '',
    status:      'active',
    createdAt:   now,
    lastModified: now
  }, extra || {});
  cards.push(card);
  saveCards();
  unsyncedIds.add(card.id);
  saveUnsyncedIds();
  renderCards();
  renderHomePage();
}

// deleteCard: removes a card by its id
function deleteCard(id) {
  cards = cards.filter(function(c) { return c.id !== id; });
  saveCards();
  renderCards();
  renderHomePage();
}

// renderCardContent: returns HTML for the editable content area of a card.
// If the card has a `sections` object, renders labeled sub-fields; otherwise falls back to flat content.
function renderCardContent(card) {
  if (card.sections && typeof card.sections === 'object' && Object.keys(card.sections).length > 0) {
    return Object.keys(card.sections).map(function(key) {
      return '<div class="card-section">' +
        '<div class="card-section-label">' + escapeHtml(key) + '</div>' +
        '<div class="card-section-body" contenteditable="true" data-id="' + card.id + '" data-section-key="' + escapeHtml(key) + '">' + escapeHtml(card.sections[key]) + '</div>' +
      '</div>';
    }).join('');
  }
  return '<div class="card-content" contenteditable="true" data-id="' + card.id + '" data-field="content">' + escapeHtml(card.content) + '</div>';
}

// isCardStale: true if a related card (overlapping tags) was modified after this card was created
function isCardStale(card, allCards) {
  if (!card.tags || card.tags.length === 0) return false;
  var cardTime = new Date(card.lastModified || card.createdAt).getTime();
  return allCards.some(function(other) {
    if (other.id === card.id || other.status === 'archived') return false;
    if (!other.tags || other.tags.length === 0) return false;
    var otherTime = new Date(other.lastModified || other.createdAt).getTime();
    if (otherTime <= cardTime) return false;
    return other.tags.some(function(t) { return card.tags.indexOf(t) !== -1; });
  });
}

// renderCards: redraws all cards — both board view and map view (if active)
function renderCards() {
  COLUMN_TYPES.forEach(function(colType) {
    const col = document.getElementById('cards-' + colType);
    col.innerHTML = '';

    // Collect all active cards that map to this column (filtered by search if active)
    var searchLower = cardSearchQuery.trim().toLowerCase();
    const colCards = cards.filter(function(c) {
      if ((TYPE_TO_COLUMN[c.type] || c.type) !== colType || c.status === 'archived') return false;
      if (!searchLower) return true;
      return (c.title  || '').toLowerCase().includes(searchLower) ||
             (c.content || '').toLowerCase().includes(searchLower);
    });

    // Update count badge (active only)
    const countEl = document.getElementById('count-' + colType);
    if (countEl) countEl.textContent = colCards.length;

    var type = colType; // kept for legacy references below

    if (colCards.length === 0) {
      col.innerHTML = '<p class="col-empty">No cards yet — click + to add one.</p>';
      return;
    }

    // Build an HTML element for each card (all are active at this point)
    colCards.forEach(function(card) {
      const el = document.createElement('div');
      el.className = 'story-card';

      // We use contenteditable="true" so clicking a card makes it editable
      var roleChip = '';
      if (card.type === 'character') {
        var profile = characterProfiles[card.id] || {};
        if (profile.role && profile.role !== 'Unknown') {
          roleChip = '<span class="role-chip role-chip-' + profile.role.toLowerCase() + '">' + profile.role + '</span>';
        }
      }
      var tagsHtml = '';
      if (card.tags && card.tags.length > 0) {
        tagsHtml = '<div class="card-tags">' +
          card.tags.map(function(t) { return '<span class="card-tag">' + escapeHtml(t) + '</span>'; }).join('') +
          '</div>';
      }
      var sourceHtml = card.source_section
        ? '<div class="card-source-section">↳ ' + escapeHtml(card.source_section) + '</div>'
        : '';

      var staleBadge = isCardStale(card, cards)
        ? '<span class="card-stale-badge" title="A related card was updated after this one was created">⚠ stale</span>'
        : '';

      el.innerHTML =
        '<input type="checkbox" class="card-checkbox" data-id="' + card.id + '" title="Select card">' +
        '<button class="card-delete" data-id="' + card.id + '" title="Delete">✕</button>' +
        '<div class="card-header-row">' +
          '<span class="card-type-badge card-type-' + card.type + '">' + card.type + '</span>' +
          roleChip +
          staleBadge +
          '<span class="card-timestamp">' + relativeTime(card.createdAt) + '</span>' +
        '</div>' +
        '<div class="card-title" contenteditable="true" data-id="' + card.id + '" data-field="title">' + escapeHtml(card.title) + '</div>' +
        tagsHtml +
        renderCardContent(card) +
        sourceHtml +
        '<button class="card-collapse-btn" title="Collapse card">▲ Collapse</button>';

      // Collapse long content by default (skipped for section-based cards)
      var contentEl = el.querySelector('.card-content');
      if (contentEl) {
        if (card.content && card.content.length > 100) {
          contentEl.classList.add('card-collapsed');
        } else {
          el.classList.add('card-expanded');
        }
      } else {
        el.classList.add('card-expanded');
      }

      col.appendChild(el);
    });
  });

  // Also re-render map if that view is active
  if (viewMode === 'map') renderMap();

  // After rendering, attach event listeners to the new elements

  // Clicking anywhere on a collapsed card expands it (excludes buttons and editable areas)
  document.querySelectorAll('.story-card').forEach(function(cardEl) {
    cardEl.addEventListener('click', function(e) {
      if (e.target.closest('[contenteditable]') || e.target.closest('button')) return;
      var contentEl = cardEl.querySelector('.card-content');
      if (contentEl && contentEl.classList.contains('card-collapsed')) {
        contentEl.classList.remove('card-collapsed');
        contentEl.dataset.userExpanded = '1';
        cardEl.classList.add('card-expanded');
      }
    });
  });

  // Collapse button: shrinks the card back
  document.querySelectorAll('.card-collapse-btn').forEach(function(btn) {
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      var cardEl = btn.closest('.story-card');
      var contentEl = cardEl && cardEl.querySelector('.card-content');
      if (contentEl && contentEl.textContent.length > 100) {
        contentEl.classList.add('card-collapsed');
        delete contentEl.dataset.userExpanded;
        cardEl.classList.remove('card-expanded');
      }
    });
  });

  // Focusin on content: expand while editing; focusout: re-collapse if not user-pinned
  document.querySelectorAll('.card-content[contenteditable]').forEach(function(el) {
    el.addEventListener('focusin', function() {
      el.classList.remove('card-collapsed');
      el.closest('.story-card').classList.add('card-expanded');
    });
    el.addEventListener('focusout', function() {
      if (!el.dataset.userExpanded && el.textContent.length > 100) {
        el.classList.add('card-collapsed');
        el.closest('.story-card').classList.remove('card-expanded');
      }
    });
  });

  // Delete button listeners
  document.querySelectorAll('.card-delete').forEach(function(btn) {
    btn.addEventListener('click', function() {
      deleteCard(btn.getAttribute('data-id'));
    });
  });

  // Inline edit listeners: when you click away from an editable field, save the change
  document.querySelectorAll('[contenteditable="true"]').forEach(function(el) {
    el.addEventListener('blur', function() {
      const id         = el.getAttribute('data-id');
      const field      = el.getAttribute('data-field');
      const sectionKey = el.getAttribute('data-section-key');
      const card       = cards.find(function(c) { return c.id === id; });
      if (!card) return;
      var newVal = el.textContent.trim();
      if (sectionKey) {
        if (!card.sections) card.sections = {};
        if (card.sections[sectionKey] !== newVal) {
          card.sections[sectionKey] = newVal;
          card.lastModified = new Date().toISOString();
          saveCards();
          unsyncedIds.add(id);
          saveUnsyncedIds();
        }
      } else if (field && card[field] !== newVal) {
        card[field] = newVal;
        card.lastModified = new Date().toISOString();
        saveCards();
        unsyncedIds.add(id);
        saveUnsyncedIds();
      }
    });
  });
  renderBatchStrip();
}

// renderBatchStrip: shows the most recent import batch (< 24h old) above the board columns (B2)
function renderBatchStrip() {
  var stripEl = document.getElementById('batchStrip');
  if (!stripEl) return;

  var batches = [];
  try { batches = JSON.parse(localStorage.getItem(projectKey('batches')) || '[]'); } catch(e) {}
  var dismissed = [];
  try { dismissed = JSON.parse(localStorage.getItem(projectKey('dismissed_batches')) || '[]'); } catch(e) {}

  // Find the most recent non-dismissed batch within 24 hours
  var now = Date.now();
  var recent = null;
  for (var i = batches.length - 1; i >= 0; i--) {
    var b = batches[i];
    if (dismissed.indexOf(b.id) !== -1) continue;
    if (now - new Date(b.createdAt).getTime() < 24 * 60 * 60 * 1000) {
      recent = b;
      break;
    }
  }

  if (!recent) { stripEl.classList.add('hidden'); return; }

  var batchCards = cards.filter(function(c) { return c.batchId === recent.id && c.status !== 'archived'; });
  if (batchCards.length === 0) { stripEl.classList.add('hidden'); return; }

  var collapsed = stripEl.classList.contains('batch-collapsed');
  var typeColors = { character: 'var(--color-character)', world: 'var(--color-world)', arc: 'var(--color-arc)', quote: 'var(--color-quote)', idea: 'var(--color-idea)' };

  var miniCards = batchCards.map(function(c) {
    return '<span class="batch-mini-card" style="border-color:' + (typeColors[c.type] || 'var(--border)') + '">' +
      '<span class="batch-mini-type" style="color:' + (typeColors[c.type] || 'var(--text-muted)') + '">' + c.type + '</span>' +
      ' ' + escapeHtml(c.title.length > 28 ? c.title.slice(0, 28) + '…' : c.title) +
    '</span>';
  }).join('');

  var when = relativeTime(recent.createdAt);
  stripEl.innerHTML =
    '<div class="batch-strip-header">' +
      '<span class="batch-strip-title">✦ Latest import · ' + batchCards.length + ' card' + (batchCards.length !== 1 ? 's' : '') + ' · ' + when + '</span>' +
      '<div class="batch-strip-actions">' +
        '<button class="batch-toggle-btn">' + (collapsed ? '▾ Show' : '▴ Hide') + '</button>' +
        '<button class="batch-undo-btn" data-id="' + recent.id + '">↩ Undo import</button>' +
        '<button class="batch-dismiss-btn" data-id="' + recent.id + '">✕</button>' +
      '</div>' +
    '</div>' +
    (collapsed ? '' : '<div class="batch-mini-cards">' + miniCards + '</div>');

  stripEl.classList.remove('hidden');

  stripEl.querySelector('.batch-toggle-btn').addEventListener('click', function() {
    stripEl.classList.toggle('batch-collapsed');
    renderBatchStrip();
  });
  stripEl.querySelector('.batch-undo-btn').addEventListener('click', function() {
    var id = this.getAttribute('data-id');
    if (!confirm('Remove all ' + batchCards.length + ' card(s) from this import?')) return;
    undoLastBatch(id);
  });
  stripEl.querySelector('.batch-dismiss-btn').addEventListener('click', function() {
    var id = this.getAttribute('data-id');
    dismissed.push(id);
    localStorage.setItem(projectKey('dismissed_batches'), JSON.stringify(dismissed));
    stripEl.classList.add('hidden');
  });
}

// undoLastBatch: deletes all active cards from a batch and removes the batch record
function undoLastBatch(batchId) {
  cards = cards.filter(function(c) { return c.batchId !== batchId; });
  saveCards();
  var batches = [];
  try { batches = JSON.parse(localStorage.getItem(projectKey('batches')) || '[]'); } catch(e) {}
  batches = batches.filter(function(b) { return b.id !== batchId; });
  localStorage.setItem(projectKey('batches'), JSON.stringify(batches));
  var dismissed = [];
  try { dismissed = JSON.parse(localStorage.getItem(projectKey('dismissed_batches')) || '[]'); } catch(e) {}
  dismissed = dismissed.filter(function(id) { return id !== batchId; });
  localStorage.setItem(projectKey('dismissed_batches'), JSON.stringify(dismissed));
  renderCards();
  renderHomePage();
}


// ============================================================
// SECTION 3: "+ Card" BUTTONS (manual add)
// ─────────────────────────────────────────────────────────────
// What it does: Attaches click listeners to the + button at
// the top of each board column. Shows an inline form (A3)
// instead of using a browser prompt().
//
// Entry:  .btn-add-card click → inline form → addCard()
// ============================================================

function openQuickAddForm(col, type) {
  // Only one form open at a time
  var existing = document.querySelector('.quick-add-form');
  if (existing) existing.remove();

  var cardsList = col.querySelector('.col-cards');
  var form = document.createElement('div');
  form.className = 'quick-add-form';
  form.innerHTML =
    '<input class="qa-title" placeholder="Title\u2026" />' +
    '<textarea class="qa-content" placeholder="Notes\u2026 (optional)" rows="2"></textarea>' +
    '<div class="qa-actions">' +
      '<button class="qa-add">Add</button>' +
      '<button class="qa-cancel">Cancel</button>' +
    '</div>';

  cardsList.insertBefore(form, cardsList.firstChild);
  form.querySelector('.qa-title').focus();

  function submit() {
    var title   = form.querySelector('.qa-title').value.trim();
    var content = form.querySelector('.qa-content').value.trim();
    if (title) {
      addCard(type, title, content);
    }
    form.remove();
  }

  form.querySelector('.qa-add').addEventListener('click', submit);
  form.querySelector('.qa-cancel').addEventListener('click', function() { form.remove(); });

  form.querySelector('.qa-title').addEventListener('keydown', function(e) {
    if (e.key === 'Enter') { e.preventDefault(); submit(); }
    if (e.key === 'Escape') form.remove();
  });
  form.querySelector('.qa-content').addEventListener('keydown', function(e) {
    if (e.key === 'Escape') form.remove();
  });
}

document.querySelectorAll('.btn-add-card').forEach(function(btn) {
  btn.addEventListener('click', function() {
    const col  = btn.closest('.canvas-col');
    const type = col.getAttribute('data-type');
    openQuickAddForm(col, type);
  });
});

document.querySelectorAll('.col-spotlight-btn, .col-vertical-strip').forEach(function(el) {
  el.addEventListener('click', function() {
    const type = el.closest('.canvas-col').getAttribute('data-type');
    spotlightColumn(type);
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

    // Refresh Characters sidebar when switching to that tab
    if (targetTab === 'characters') renderCharacterSidebar();
    // Refresh Arcs timeline when switching to that tab
    if (targetTab === 'arcs') renderArcsTimeline();
    // Refresh home page stats when switching to home
    if (targetTab === 'home') renderHomePage();
    // Render Outline tab
    if (targetTab === 'outline') renderOutlineTab();
  });
});

// Helper: switch to a tab by name (used by home page nav buttons)
function switchToTab(tabName) {
  var btn = document.querySelector('.tab-btn[data-tab="' + tabName + '"]');
  if (btn) btn.click();
}

// ============================================================
// SECTION 4b: HOME PAGE
// ─────────────────────────────────────────────────────────────
// Renders the home page stats and recent cards strip.
// Called on load and whenever cards change.
// ============================================================

function renderHomePage() {
  var activeCards = cards.filter(function(c) { return c.status !== 'archived'; });
  var charCards   = activeCards.filter(function(c) { return c.type === 'character'; });
  var arcCards    = activeCards.filter(function(c) { return c.type === 'arc'; });

  // Update stat items — set .home-stat-num inside each container
  function setStatNum(id, num) {
    var el = document.getElementById(id);
    if (!el) return;
    var numEl = el.querySelector('.home-stat-num');
    if (numEl) numEl.textContent = num.toLocaleString();
  }
  setStatNum('homeStatCards', activeCards.length);
  setStatNum('homeStatChars', charCards.length);
  setStatNum('homeStatArcs',  arcCards.length);

  // Word count from writing copy (rich editor div — use textContent)
  var writingEl = document.getElementById('writingCopyEditor');
  var wordCount = 0;
  if (writingEl) {
    var text = (writingEl.textContent || '').trim();
    wordCount = text ? text.split(/\s+/).length : 0;
  }
  setStatNum('homeStatWords', wordCount);

  // Nav tile accent colors applied via CSS border-top instead
  document.querySelectorAll('.home-nav-btn[data-color]').forEach(function(btn) {
    btn.style.borderTopColor = btn.getAttribute('data-color');
  });

  // Recent cards grid — last 6 active cards by date
  var recentEl = document.getElementById('homeRecent');
  if (!recentEl) return;
  var recent = activeCards.slice().sort(function(a, b) {
    return new Date(b.createdAt) - new Date(a.createdAt);
  }).slice(0, 6);

  if (recent.length === 0) {
    recentEl.innerHTML = '';
    return;
  }

  var typeColors = {
    character: 'var(--color-character)', world: 'var(--color-world)',
    arc: 'var(--color-arc)', quote: 'var(--color-quote)', idea: 'var(--color-idea)'
  };

  recentEl.innerHTML =
    '<div class="home-recent-label">Recently Added</div>' +
    '<div class="home-recent-cards">' +
    recent.map(function(card) {
      return '<div class="home-recent-card">' +
        '<div class="home-recent-card-type" style="color:' + (typeColors[card.type] || '#666') + '">' + card.type + '</div>' +
        '<div class="home-recent-card-title">' + escapeHtml(card.title) + '</div>' +
        '</div>';
    }).join('') +
    '</div>';

  // Clicking a recent card goes to Story Canvas
  recentEl.querySelectorAll('.home-recent-card').forEach(function(el) {
    el.addEventListener('click', function() { switchToTab('canvas'); });
  });
}

// Wire up the "Get Started" button and home nav buttons
document.getElementById('btnGetStarted').addEventListener('click', function() {
  switchToTab('canvas');
});
document.querySelectorAll('.home-nav-btn').forEach(function(btn) {
  btn.addEventListener('click', function() {
    switchToTab(btn.getAttribute('data-tab'));
  });
});

// ============================================================
// SECTION 4c: ARCHIVE PANEL
// ─────────────────────────────────────────────────────────────
// Collapsible left panel showing all archived cards.
// Cards can be restored from here back to active status.
// ============================================================

var archivePanelOpen = false;

function toggleArchivePanel() {
  archivePanelOpen = !archivePanelOpen;
  var panel   = document.getElementById('archivePanel');
  var overlay = document.getElementById('archiveOverlay');
  var btn     = document.getElementById('archiveBtn');
  if (archivePanelOpen) {
    panel.classList.add('open');
    overlay.classList.remove('hidden');
    btn.classList.add('active');
    renderArchivePanel();
  } else {
    closeArchivePanel();
  }
}

function closeArchivePanel() {
  archivePanelOpen = false;
  document.getElementById('archivePanel').classList.remove('open');
  document.getElementById('archiveOverlay').classList.add('hidden');
  var btn = document.getElementById('archiveBtn');
  if (btn) btn.classList.remove('active');
}

// Renders archive panel contents grouped by type
function renderArchivePanel() {
  var archivedCards = cards.filter(function(c) { return c.status === 'archived'; });
  var countEl = document.getElementById('archiveCount');
  if (countEl) countEl.textContent = archivedCards.length;

  var bodyEl = document.getElementById('archivePanelBody');
  if (!bodyEl) return;

  if (archivedCards.length === 0) {
    bodyEl.innerHTML = '<div class="archive-empty">No archived cards yet.</div>';
    return;
  }

  var typeOrder = ['character', 'world', 'arc', 'quote', 'idea'];
  var typeLabels = { character: 'Characters', world: 'World Building', arc: 'Plot & Arcs', quote: 'Key Quotes', idea: 'Ideas' };
  var html = '';

  typeOrder.forEach(function(type) {
    var group = archivedCards.filter(function(c) { return c.type === type; });
    if (group.length === 0) return;
    html += '<div class="archive-type-group">' +
      '<div class="archive-type-label">' + typeLabels[type] + ' (' + group.length + ')</div>';
    group.forEach(function(card) {
      html += '<div class="archive-card-item" data-type="' + card.type + '" data-id="' + card.id + '">' +
        '<div class="archive-card-info">' +
          '<div class="archive-card-title">' + escapeHtml(card.title) + '</div>' +
          (card.content ? '<div class="archive-card-preview">' + escapeHtml(card.content) + '</div>' : '') +
          (card.archiveSummary
            ? '<div class="archive-card-summary">💡 ' + escapeHtml(card.archiveSummary) + '</div>'
            : '<button class="archive-gen-summary-btn" data-id="' + card.id + '">✦ Why archived?</button>') +
        '</div>' +
        '<button class="archive-restore-btn" data-id="' + card.id + '">♻️</button>' +
      '</div>';
    });
    html += '</div>';
  });

  bodyEl.innerHTML = html;

  // Wire up restore buttons
  bodyEl.querySelectorAll('.archive-restore-btn').forEach(function(btn) {
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      var id = btn.getAttribute('data-id');
      var card = cards.find(function(c) { return c.id === id; });
      if (card) {
        card.status = 'active';
        saveCards();
        renderCards();
        if (viewMode === 'map') renderMap();
        renderArchivePanel();
        renderHomePage();
        showToast('♻️ Card restored');
      }
    });
  });

  // Wire up "Why archived?" summary generation buttons
  bodyEl.querySelectorAll('.archive-gen-summary-btn').forEach(function(btn) {
    btn.addEventListener('click', async function(e) {
      e.stopPropagation();
      var key = getApiKey();
      if (!key) { showToast('Set your API key first'); return; }
      var id = btn.getAttribute('data-id');
      var card = cards.find(function(c) { return c.id === id; });
      if (!card) return;
      btn.textContent = '⏳ Thinking...';
      btn.disabled = true;
      try {
        var summaryPrompt = 'In one concise sentence, explain what story element this card represents and why it might be archived or superseded. Card title: "' + card.title + '". Card content: ' + card.content;
        card.archiveSummary = await callClaudeForCard(key, summaryPrompt, 80);
        saveCards();
        renderArchivePanel();
      } catch (e) {
        showToast('Could not generate summary');
        btn.textContent = '✦ Why archived?';
        btn.disabled = false;
      }
    });
  });
}

// Wire up archive toggle button and close button
document.getElementById('archiveBtn').addEventListener('click', toggleArchivePanel);
document.getElementById('archivePanelClose').addEventListener('click', closeArchivePanel);
document.getElementById('archiveOverlay').addEventListener('click', closeArchivePanel);


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

  // ElevenLabs key — load from localStorage and wire up UI
  const elabsCached = localStorage.getItem('sf_elabs_key') || '';
  if (elabsCached) {
    ELEVENLABS_API_KEY = elabsCached;
    updateElabsKeyStatusUi(elabsCached);
  }
  document.getElementById('saveElabsKey').addEventListener('click', function() {
    const k = document.getElementById('elabsKeyInput').value.trim();
    if (!k) { setModalStatus('⚠️ Paste your ElevenLabs key first.'); return; }
    ELEVENLABS_API_KEY = k;
    localStorage.setItem('sf_elabs_key', k);
    updateElabsKeyStatusUi(k);
    setModalStatus('✅ ElevenLabs key saved!');
  });
  document.getElementById('clearElabsKeyBtn').addEventListener('click', function() {
    ELEVENLABS_API_KEY = '';
    localStorage.removeItem('sf_elabs_key');
    updateElabsKeyStatusUi('');
    setModalStatus('🗑️ ElevenLabs key removed.');
  });
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

function updateElabsKeyStatusUi(key) {
  const chip     = document.getElementById('elabsKeyStatusChip');
  const input    = document.getElementById('elabsKeyInput');
  const clearBtn = document.getElementById('clearElabsKeyBtn');
  if (key) {
    chip.textContent = '✓ active (···' + key.slice(-4) + ')';
    chip.classList.add('has-key');
    input.value = key;
    clearBtn.classList.remove('hidden');
  } else {
    chip.textContent = '— click to set';
    chip.classList.remove('has-key');
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

// splitIntoSections: splits a large text into chunks ≤ maxChunkSize chars.
// Prefers splitting at markdown heading boundaries (# / ## / ###).
// Falls back to paragraph breaks if no headings are found.
function splitIntoSections(text, maxChunkSize) {
  if (text.length <= maxChunkSize) return [text];

  // Split at lines that start with a markdown heading
  const parts = text.split(/(?=\n#{1,3} )/);
  const segments = parts.length > 1 ? parts : text.split(/\n\n+/);

  const batches = [];
  let current = '';
  for (var i = 0; i < segments.length; i++) {
    var seg = segments[i];
    if (current.length > 0 && (current + seg).length > maxChunkSize) {
      batches.push(current.trim());
      current = seg;
    } else {
      current += (current ? '\n\n' : '') + seg;
    }
  }
  if (current.trim()) batches.push(current.trim());

  return batches.length > 0 ? batches : [text.slice(0, maxChunkSize)];
}

// callClaudeForCards: single Claude API call → returns raw parsed card array.
// Throws on network/API errors. Returns [] if Claude returns no valid JSON.
async function callClaudeForCards(key, messageContent) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type':                              'application/json',
      'x-api-key':                                 key,
      'anthropic-version':                         '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true'
    },
    body: JSON.stringify({
      model:      CLAUDE_MODEL,
      max_tokens: 8192,
      messages:   [{ role: 'user', content: messageContent }]
    })
  });

  const data = await response.json();
  if (!response.ok) {
    const errMsg = data?.error?.message || data?.message || 'API error (status ' + response.status + ')';
    throw new Error(errMsg);
  }

  let raw = '';
  if (Array.isArray(data.content) && data.content[0] && typeof data.content[0].text === 'string') {
    raw = data.content[0].text.trim();
  }

  if (data.stop_reason === 'max_tokens') {
    console.warn('[StoryForge] Claude response was truncated (hit max_tokens). JSON may be incomplete for this chunk.');
  }

  if (!raw) {
    console.error('Unexpected Claude response format', data);
    throw new Error('AI returned unexpected response format. Check the browser console for details.');
  }

  raw = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    // Attempt partial recovery: find the last complete card object before truncation
    const lastClose = raw.lastIndexOf('},');
    if (lastClose !== -1) {
      const recovered = raw.slice(0, lastClose + 1) + ']';
      try {
        const partial = JSON.parse('[' + recovered.replace(/^\s*\[/, ''));
        if (Array.isArray(partial) && partial.length > 0) {
          console.warn('[StoryForge] Recovered ' + partial.length + ' cards from truncated response.');
          return partial;
        }
      } catch (_) {}
    }
    console.error('[StoryForge] Failed to parse Claude JSON', raw);
    return [];
  }
}

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

  // --- Show loading state ---
  setModalStatus('⏳ Sending to Claude AI...');
  document.getElementById('organizeBtn').disabled = true;

  // seenTitles tracks all titles we've told Claude to skip (existing + accumulated).
  // Using a Set for O(1) lookup during cross-chunk deduplication.
  const seenTitles = new Set(getExistingTitles());
  let allValidCards = [];

  try {
    if (activeMode !== 'upload' || fileContent.type === 'text') {
      // --- Text path: section-aware chunking ---
      const rawText = activeMode === 'paste' ? pasteText : fileContent.text;
      const CHUNK_SIZE = 10000;
      const sections = splitIntoSections(rawText, CHUNK_SIZE);

      for (var si = 0; si < sections.length; si++) {
        if (sections.length > 1) {
          setModalStatus('⏳ Processing section ' + (si + 1) + ' of ' + sections.length + '...');
        }

        // Rebuild prompt each iteration so seenTitles stays current
        const chunkPrompt = buildPrompt(Array.from(seenTitles), cards);
        const msgContent  = chunkPrompt + '\n\nContent to organize:\n' + sections[si];

        const rawCards = await callClaudeForCards(key, msgContent);

        rawCards.forEach(function(c) {
          if (!c.type || !c.title) return;
          if (!VALID_CARD_TYPES.includes(c.type)) return;
          var titleKey = c.title.toLowerCase();
          if (seenTitles.has(titleKey)) return;
          seenTitles.add(titleKey);
          allValidCards.push(c);
        });
      }

    } else {
      // --- Image path: send as base64, single call ---
      const imagePrompt = buildPrompt(Array.from(seenTitles), cards);
      const msgContent  = [
        {
          type: 'image',
          source: { type: 'base64', media_type: fileContent.mediaType, data: fileContent.base64 }
        },
        { type: 'text', text: imagePrompt + '\n\nPlease read the image above and extract story elements.' }
      ];

      const rawCards = await callClaudeForCards(key, msgContent);
      rawCards.forEach(function(c) {
        if (!c.type || !c.title) return;
        if (!VALID_CARD_TYPES.includes(c.type)) return;
        var titleKey = c.title.toLowerCase();
        if (seenTitles.has(titleKey)) return;
        seenTitles.add(titleKey);
        allValidCards.push(c);
      });
    }

    if (allValidCards.length === 0) {
      setModalStatus('✅ No new cards found (all already exist).');
      return;
    }

    setModalStatus('');
    closeModal();
    showImportPreview(allValidCards);

  } catch (err) {
    setModalStatus('❌ ' + err.message);
  } finally {
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
// STAGED IMPORT PREVIEW (A4)
// ─────────────────────────────────────────────────────────────
// Shows a modal with proposed cards after AI returns, letting
// the user check/uncheck before creation. All confirmed cards
// share a batchId stored in sf_batches.
// ============================================================

function showImportPreview(proposedCards) {
  var modal     = document.getElementById('importPreviewModal');
  var summaryEl = document.getElementById('previewSummary');
  var listEl    = document.getElementById('previewCardList');
  var countEl   = document.getElementById('previewCount');

  // Render summary line
  summaryEl.textContent = 'AI found ' + proposedCards.length + ' card' + (proposedCards.length === 1 ? '' : 's') + '. Uncheck any you don\'t want.';

  // Render card checklist
  listEl.innerHTML = '';
  proposedCards.forEach(function(c, i) {
    var previewTagsHtml = (c.tags && c.tags.length > 0)
      ? '<div class="card-tags preview-tags">' + c.tags.map(function(t) {
          return '<span class="card-tag">' + escapeHtml(t) + '</span>';
        }).join('') + '</div>'
      : '';
    var previewSourceHtml = c.source_section
      ? '<div class="card-source-section">↳ ' + escapeHtml(c.source_section) + '</div>'
      : '';

    var item = document.createElement('div');
    item.className = 'preview-card-item';
    item.innerHTML =
      '<label class="preview-card-check">' +
        '<input type="checkbox" class="preview-cb" data-index="' + i + '" checked />' +
      '</label>' +
      '<div class="preview-card-body">' +
        '<span class="card-type-badge card-type-' + c.type + '">' + c.type + '</span>' +
        '<div class="preview-card-title" contenteditable="true" data-index="' + i + '">' + escapeHtml(c.title) + '</div>' +
        previewTagsHtml +
        '<div class="preview-card-content">' + escapeHtml(c.content || '') + '</div>' +
        previewSourceHtml +
      '</div>';
    listEl.appendChild(item);

    // Keep proposedCards in sync with live edits to title
    item.querySelector('.preview-card-title').addEventListener('input', function(e) {
      proposedCards[i].title = e.target.textContent.trim();
    });
  });

  function updateCount() {
    var checked = listEl.querySelectorAll('.preview-cb:checked').length;
    countEl.textContent = checked + ' of ' + proposedCards.length + ' selected';
  }
  updateCount();
  listEl.addEventListener('change', updateCount);

  modal.classList.remove('hidden');

  function closePreview() {
    modal.classList.add('hidden');
    listEl.innerHTML = '';
  }

  document.getElementById('previewClose').onclick  = closePreview;
  document.getElementById('previewCancel').onclick = closePreview;
  modal.addEventListener('click', function(e) {
    if (e.target === modal) closePreview();
  });

  document.getElementById('previewConfirm').onclick = function() {
    var batchId    = generateId();
    var createdAt  = new Date().toISOString();
    var addedCount = 0;

    listEl.querySelectorAll('.preview-cb:checked').forEach(function(cb) {
      var idx = parseInt(cb.getAttribute('data-index'), 10);
      var c   = proposedCards[idx];
      if (!c || !c.title || !c.type) return;
      addCard(c.type, c.title, c.content || '', {
        batchId:        batchId,
        source_section: c.source_section || undefined,
        tags:           (c.tags && c.tags.length > 0) ? c.tags : undefined
      });
      addedCount++;
    });

    // Save batch metadata
    var batches = [];
    try { batches = JSON.parse(localStorage.getItem(projectKey('batches')) || '[]'); } catch(e) {}
    batches.push({ id: batchId, createdAt: createdAt, cardCount: addedCount });
    localStorage.setItem(projectKey('batches'), JSON.stringify(batches));

    closePreview();
    document.querySelector('[data-tab="canvas"]').click();
    if (addedCount > 0) {
      showToast('Added ' + addedCount + ' card' + (addedCount === 1 ? '' : 's') + ' to your canvas!', 3000);
      setTimeout(generateSummary, 2000);
    }
  };
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
    const synced = JSON.parse(localStorage.getItem(projectKey('synced_files')) || '[]');

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
          { type: 'text',  text: buildSyncPrompt(existingTitlesNow, cards) + '\n\nExtract any story elements from this image.' }
        ];

      } else if (ext === 'pdf') {
        const buffer = await file.arrayBuffer();
        const text   = await extractTextFromPdfBuffer(buffer);
        messageContent = buildSyncPrompt(existingTitlesNow, cards) + '\n\nContent to organize:\n' + text.slice(0, 20000);

      } else if (ext === 'docx') {
        const buffer = await file.arrayBuffer();
        const result = await mammoth.extractRawText({ arrayBuffer: buffer });
        messageContent = buildSyncPrompt(existingTitlesNow, cards) + '\n\nContent to organize:\n' + result.value.slice(0, 20000);

      } else {
        // txt / md — read directly from the File object (no fetch needed)
        const text = await file.text();
        messageContent = buildSyncPrompt(existingTitlesNow, cards) + '\n\nContent to organize:\n' + text.slice(0, 20000);
      }

      btn.textContent = '✨ Organizing ' + name + '...';
      try {
        const added = await processFileWithAi(key, messageContent);
        totalAdded += added;
        // Mark as processed so we skip it next time
        synced.push(fileKey);
        localStorage.setItem(projectKey('synced_files'), JSON.stringify(synced));
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
        max_tokens: 8192,
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
    addCard(c.type, c.title, c.content || '', {
      source_section: c.source_section || undefined,
      tags:           (c.tags && c.tags.length > 0) ? c.tags : undefined
    });
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
  document.getElementById('cardSearchWrap').classList.remove('hidden');
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
  document.getElementById('cardSearchWrap').classList.add('hidden');
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

  localStorage.setItem(projectKey('zoom'), String(mapZoom));

  var mapInner  = document.getElementById('mapInner');
  var mapScaler = document.getElementById('mapScaler');

  // Scale the canvas visually (transform-origin: 0 0 set in CSS).
  // Includes the centering translate set by centerMapOnCards().
  mapInner.style.transform = 'translate(' + mapTranslateX + 'px,' + mapTranslateY + 'px) scale(' + mapZoom + ')';

  // Resize the scaler wrapper so the scroll container knows the full extent.
  // Add one full viewport width/height so that canvas edges are always scrollable
  // to the center of the screen — without this, zoomed-out cards at the far edge
  // fall beyond scrollLeft's max and become unreachable.
  var mapView = document.getElementById('mapView');
  var viewW = (mapView && mapView.clientWidth)  || 1200;
  var viewH = (mapView && mapView.clientHeight) || 800;
  mapScaler.style.width  = Math.max(7000 * mapZoom + viewW,  viewW  * 1.5) + 'px';
  mapScaler.style.height = Math.max(5000 * mapZoom + viewH,  viewH  * 1.5) + 'px';

  // Update zoom label
  var label = document.getElementById('zoomLabel');
  if (label) label.textContent = Math.round(mapZoom * 100) + '%';
}

// Scroll wheel on the map → smooth zoom centered on the cursor position
document.getElementById('mapView').addEventListener('wheel', function(e) {
  e.preventDefault();
  var mapView = document.getElementById('mapView');
  var rect = mapView.getBoundingClientRect();

  // Where is the cursor inside the scroll viewport?
  var mouseX = e.clientX - rect.left;
  var mouseY = e.clientY - rect.top;

  // Which canvas coordinates are currently under the cursor?
  // Subtract mapTranslateX/Y because mapInner may be offset from mapScaler's origin.
  var canvasX = (mapView.scrollLeft + mouseX - mapTranslateX) / mapZoom;
  var canvasY = (mapView.scrollTop  + mouseY - mapTranslateY) / mapZoom;

  // Zoom by a proportional factor (feels smoother than fixed ±0.1 steps)
  var factor = e.deltaY > 0 ? 0.92 : 1.08;
  applyZoom(mapZoom * factor);

  // Re-anchor scroll so the same canvas point stays under the cursor.
  // Add mapTranslateX/Y back because canvas→visual conversion includes the offset.
  mapView.scrollLeft = canvasX * mapZoom + mapTranslateX - mouseX;
  mapView.scrollTop  = canvasY * mapZoom + mapTranslateY - mouseY;
}, { passive: false });

// Zoom + / − / reset buttons — re-center after each change so cards stay in view
document.getElementById('zoomIn').addEventListener('click', function() {
  applyZoom(mapZoom + 0.1);
  centerMapOnCards();
});
document.getElementById('zoomOut').addEventListener('click', function() {
  applyZoom(mapZoom - 0.1);
  centerMapOnCards();
});
document.getElementById('zoomLabel').addEventListener('click', function() {
  applyZoom(1.0); // click the percentage label to reset to 100%
  centerMapOnCards();
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

  cards.filter(function(card) { return card.status !== 'archived'; }).forEach(function(card) {
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

  // Render each active card (archived cards are hidden from the map)
  cards.filter(function(card) { return card.status !== 'archived'; }).forEach(function(card) {
    var pos   = cardPositions[card.id];
    var color = TYPE_COLORS[card.type] || '#94a3b8';

    var el = document.createElement('div');
    el.className  = 'map-card';
    el.dataset.id = card.id;
    el.style.left        = pos.x + 'px';
    el.style.top         = pos.y + 'px';
    // Restore saved card size if the user previously resized it
    if (pos.w) el.style.width  = pos.w + 'px';
    if (pos.h) el.style.height = pos.h + 'px';

    el.innerHTML =
      '<button class="card-tab-btn" data-id="' + card.id + '" title="AI Actions">⋮</button>' +
      '<button class="map-card-quick-delete" data-id="' + card.id + '" title="Delete card">✕</button>' +
      '<div class="card-tab-dropdown" data-id="' + card.id + '"></div>' +
      '<div class="map-card-header">' +
        '<span class="col-dot" style="background:' + color + ';flex-shrink:0"></span>' +
        '<div class="map-card-title" data-id="' + card.id + '" data-field="title">' + escapeHtml(card.title) + '</div>' +
      '</div>' +
      '<div class="map-card-content" data-id="' + card.id + '" data-field="content">' + escapeHtml(card.content) + '</div>' +
      '<div class="map-card-actions">' +
        '<button class="map-action-btn edit"    data-id="' + card.id + '" title="Edit card">✎</button>' +
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
  mapInner.querySelectorAll('.map-action-btn.edit').forEach(function(btn) {
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      // Enter explicit edit mode: make title + content editable
      var cardEl = mapInner.querySelector('.map-card[data-id="' + btn.dataset.id + '"]');
      if (cardEl) {
        enterMapCardEditMode(cardEl);
      }
    });
  });

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

  mapInner.querySelectorAll('.map-card-quick-delete').forEach(function(btn) {
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
      var thisCard = cards.find(function(c) { return c.id === cardId; });
      var isArchived = thisCard && thisCard.status === 'archived';
      dropdown.innerHTML =
        '<div class="dropdown-section">AI Actions</div>' +
        '<button data-action="summarize" data-id="' + cardId + '">📝 Summarize Card</button>' +
        '<button data-action="continue"  data-id="' + cardId + '">✨ Continue Story</button>' +
        '<button data-action="related"   data-id="' + cardId + '">🔗 Find Related Cards</button>' +
        (hasConnections
          ? '<button data-action="sync"    data-id="' + cardId + '">🔀 Sync with Connected</button>'
          : '') +
        '<div class="dropdown-section">Card</div>' +
        (isArchived
          ? '<button data-action="restore" data-id="' + cardId + '">♻️ Restore Card</button>'
          : '<button data-action="archive" data-id="' + cardId + '">📦 Archive Card</button>') +
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

  // No contenteditable on map cards by default — edit mode entered via edit button
  // (see enterMapCardEditMode / exitMapCardEditMode below)

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
      var newX = Math.max(0, Math.min(6700, startLeft + (e.clientX - startX) / mapZoom));
      var newY = Math.max(0, Math.min(4700, startTop  + (e.clientY - startY) / mapZoom));
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
      if (wasDragging) setTimeout(function() { wasDragging = false; }, 150);
    }

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
}

// ── 11b2: MAP CARD EDIT MODE ──────────────────────────────────

// enterMapCardEditMode: make a map card's title + content editable
function enterMapCardEditMode(cardEl) {
  if (cardEl.classList.contains('is-editing')) return; // already editing
  var titleEl   = cardEl.querySelector('.map-card-title');
  var contentEl = cardEl.querySelector('.map-card-content');
  if (!titleEl || !contentEl) return;

  cardEl.classList.add('is-editing');
  titleEl.contentEditable   = 'true';
  contentEl.contentEditable = 'true';

  // Prevent drag while editing
  titleEl.addEventListener('mousedown',   function(e) { e.stopPropagation(); });
  contentEl.addEventListener('mousedown', function(e) { e.stopPropagation(); });

  // Exit edit mode when focus leaves both editables
  function handleBlur() {
    // Wait a tick so we can check if focus moved to the sibling editable
    setTimeout(function() {
      var active = document.activeElement;
      if (active === titleEl || active === contentEl) return; // still editing
      exitMapCardEditMode(cardEl);
    }, 0);
  }
  titleEl.addEventListener('blur',   handleBlur);
  contentEl.addEventListener('blur', handleBlur);

  // Focus title and place cursor at end
  titleEl.focus();
  placeCaretAtEnd(titleEl);
}

// exitMapCardEditMode: save and remove edit mode from a map card
function exitMapCardEditMode(cardEl) {
  if (!cardEl.classList.contains('is-editing')) return;
  var titleEl   = cardEl.querySelector('.map-card-title');
  var contentEl = cardEl.querySelector('.map-card-content');
  var cardId    = cardEl.dataset.id;
  var card      = cards.find(function(c) { return c.id === cardId; });

  if (card) {
    if (titleEl)   card.title   = titleEl.textContent.trim();
    if (contentEl) card.content = contentEl.textContent.trim();
    saveCards();
  }

  if (titleEl)   titleEl.removeAttribute('contenteditable');
  if (contentEl) contentEl.removeAttribute('contenteditable');
  cardEl.classList.remove('is-editing');
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
  localStorage.setItem(projectKey('positions'), JSON.stringify(cardPositions));
}

function saveConnections() {
  localStorage.setItem(projectKey('connections'), JSON.stringify(connections));
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

  if (action === 'archive' || action === 'restore') {
    var target = cards.find(function(c) { return c.id === cardId; });
    if (target) {
      if (action === 'archive' && !target.archiveSummary) {
        try {
          var summaryPrompt = 'In one concise sentence, explain what story element this card represents and why it might be archived or superseded. Card title: "' + target.title + '". Card content: ' + target.content;
          target.archiveSummary = await callClaudeForCard(key, summaryPrompt, 80);
        } catch (e) {
          // silently skip if AI fails — archiving still proceeds
        }
      }
      target.status = action === 'archive' ? 'archived' : 'active';
      saveCards();
      renderCards();
      if (viewMode === 'map') renderMap();
      renderArchivePanel();
      renderHomePage();
      showToast(action === 'archive' ? '📦 Card archived' : '♻️ Card restored');
    }
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
    prompt = 'Based on this story note from "' + currentProjectName + '", suggest 2-3 specific ways the story could continue from here:\n\n' + cardText;

  } else if (action === 'related') {
    // Use compact card list (titles + types only) instead of full content — saves ~2k tokens per tap
    var compactCtx = cards.map(function(c) { return '[' + c.type + '] ' + c.title; }).join('\n');
    prompt = 'Given this story note and the story card index below, which other elements, themes, or characters does it relate to most? Give 2-3 specific connections.\n\nNote:\n' + cardText + '\n\nStory cards:\n' + compactCtx;

  } else if (action === 'sync') {
    if (connectedCards.length === 0) {
      showToast('This card has no connections. Use ⊕ to connect cards first.');
      return;
    }
    prompt = 'These connected story notes are from "' + currentProjectName + '". Reconcile and merge them into a coherent combined description (2-4 sentences):\n\nMain card:\n' + cardText + '\n\nConnected cards:\n' + connText;
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
  localStorage.setItem(projectKey('summary_expanded'), collapsed ? 'false' : 'true');
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
          content: 'Write a 3–5 sentence overview for a ' + currentProjectFormat + ' called "' + currentProjectName + '" based on these notes. Be specific about characters, current arcs, and world details. Max 120 words.\n\n' + storyData
        }]
      })
    });

    var data = await res.json();
    if (!res.ok) throw new Error(data?.error?.message || 'API error');

    var text = (data.content?.[0]?.text || '').trim();
    document.getElementById('summaryText').textContent = text;
    localStorage.setItem(projectKey('summary'), text);

    // Make sure bar is expanded so user sees the new summary
    document.getElementById('summaryBar').classList.remove('collapsed');
    localStorage.setItem(projectKey('summary_expanded'), 'true');

  } catch (err) {
    document.getElementById('summaryText').textContent = 'Could not generate summary — ' + err.message;
  }
}

// Load saved summary and collapsed state on startup
(function() {
  var saved = localStorage.getItem(projectKey('summary'));
  if (saved) document.getElementById('summaryText').textContent = saved;

  var expanded = localStorage.getItem(projectKey('summary_expanded'));
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
initVoiceAndOrb();

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
  document.body.classList.add('chat-open');
  document.getElementById('chatInput').focus();
  // Clear notification dot when chat is opened
  var dot = document.getElementById('chatNotifDot');
  if (dot) dot.classList.add('hidden');
  // Show memory badge if we have a stored memory summary
  var memBadge = document.getElementById('chatMemoryBadge');
  if (memBadge) {
    memBadge.style.display = localStorage.getItem(projectKey('chat_memory')) ? '' : 'none';
  }
  openJarvisOrb();
}

function closeChat() {
  chatIsOpen = false;
  document.getElementById('chatPanel').classList.remove('open');
  document.body.classList.remove('chat-open');
  closeJarvisOrb();
}

// ── CHAT SUB-TABS (Chat | Suggestions) ───────────────────────

var activeChatSubTab = 'chat';

document.getElementById('chatSubTabChat').addEventListener('click', function() {
  switchChatSubTab('chat');
});
document.getElementById('chatSubTabSuggestions').addEventListener('click', function() {
  switchChatSubTab('suggestions');
  renderSuggestions();
});

function switchChatSubTab(tab) {
  activeChatSubTab = tab;
  document.getElementById('chatSubTabChat').classList.toggle('active', tab === 'chat');
  document.getElementById('chatSubTabSuggestions').classList.toggle('active', tab === 'suggestions');
  document.getElementById('chatView').classList.toggle('hidden', tab !== 'chat');
  document.getElementById('suggestionsView').classList.toggle('hidden', tab !== 'suggestions');
}

// ── CANON REVIEW BUTTON ───────────────────────────────────────

var lastMessageWasCanonReview = false;

document.getElementById('canonReviewBtn').addEventListener('click', function() {
  if (!chatIsOpen) openChat();
  switchChatSubTab('chat');
  var reviewPrompt =
    'Please act as my story editor and review all my current story cards. Identify:\n' +
    '1. Any conflicts or contradictions between cards\n' +
    '2. Ideas that may have been superseded by newer or conflicting cards\n' +
    '3. Major gaps in the story (missing character motivations, unexplained world rules, unresolved plot points)\n' +
    '4. Anything that no longer fits the current direction of the story\n\n' +
    'For each issue you find, be specific about which cards are involved.';
  document.getElementById('chatInput').value = reviewPrompt;
  lastMessageWasCanonReview = true;
  sendChatMessage();
});

// ── SUGGESTION MEMORY ─────────────────────────────────────────

var suggestions = JSON.parse(localStorage.getItem(projectKey('suggestions')) || '[]');

function saveSuggestions() {
  localStorage.setItem(projectKey('suggestions'), JSON.stringify(suggestions));
  updateSuggestionsCountBadge();
}

function updateSuggestionsCountBadge() {
  var badge = document.getElementById('suggestionsCountBadge');
  var pending = suggestions.filter(function(s) { return s.status === 'pending'; }).length;
  if (pending > 0) {
    badge.textContent = pending;
    badge.style.display = '';
  } else {
    badge.style.display = 'none';
  }
}

// generateId is already defined globally — reuse it for suggestion IDs

function addSuggestion(text, source) {
  var sug = {
    id:        generateId(),
    source:    source || 'chat',
    text:      text,
    status:    'pending',
    createdAt: new Date().toISOString(),
    notes:     ''
  };
  suggestions.unshift(sug); // newest first
  saveSuggestions();
  renderSuggestions();
  return sug;
}

function renderSuggestions() {
  var list  = document.getElementById('suggestionsList');
  var empty = document.getElementById('suggestionsEmpty');
  if (!list) return;

  if (suggestions.length === 0) {
    empty.style.display = '';
    list.innerHTML = '';
    return;
  }
  empty.style.display = 'none';

  list.innerHTML = suggestions.map(function(s) {
    var date = new Date(s.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    var sourceLabel = s.source === 'canon_review' ? '🔍 Review' : '💬 Chat';
    var statuses = ['pending', 'accepted', 'rejected', 'outdated', 'useful-later'];
    var statusBtns = statuses.map(function(st) {
      return '<button class="suggestion-status-btn' + (s.status === st ? ' active' : '') + '" ' +
             'data-id="' + s.id + '" data-status="' + st + '">' + st + '</button>';
    }).join('');
    var shortText = s.text.length > 300 ? s.text.slice(0, 300) + '…' : s.text;
    return (
      '<div class="suggestion-card" data-id="' + s.id + '">' +
        '<div class="suggestion-card-meta">' +
          '<span class="suggestion-status-badge ' + s.status + '">' + s.status + '</span>' +
          '<span class="suggestion-source-label">' + sourceLabel + '</span>' +
          '<span class="suggestion-date-label">' + date + '</span>' +
        '</div>' +
        '<div class="suggestion-text" id="sugText_' + s.id + '">' + escapeHtml(shortText) + '</div>' +
        (s.text.length > 300 ? '<button class="suggestion-expand-btn" data-id="' + s.id + '">Show full ▾</button>' : '') +
        '<div class="suggestion-actions">' + statusBtns +
          '<button class="suggestion-delete-btn" data-id="' + s.id + '" title="Remove">✕</button>' +
        '</div>' +
      '</div>'
    );
  }).join('');

  // Wire up status buttons
  list.querySelectorAll('.suggestion-status-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var sug = suggestions.find(function(s) { return s.id === btn.dataset.id; });
      if (sug) {
        sug.status = btn.dataset.status;
        saveSuggestions();
        renderSuggestions();
      }
    });
  });

  // Wire up delete buttons
  list.querySelectorAll('.suggestion-delete-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      suggestions = suggestions.filter(function(s) { return s.id !== btn.dataset.id; });
      saveSuggestions();
      renderSuggestions();
    });
  });

  // Wire up expand buttons
  list.querySelectorAll('.suggestion-expand-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var sug = suggestions.find(function(s) { return s.id === btn.dataset.id; });
      if (!sug) return;
      var textEl = document.getElementById('sugText_' + btn.dataset.id);
      if (textEl) textEl.textContent = sug.text;
      btn.remove();
    });
  });
}

// buildSuggestionsContext: injects accepted + pending suggestions into AI system prompt
function buildSuggestionsContext() {
  var relevant = suggestions.filter(function(s) {
    return s.status === 'accepted' || s.status === 'pending';
  });
  if (relevant.length === 0) return '';
  var lines = relevant.slice(0, 8).map(function(s) {
    return '[' + s.status.toUpperCase() + '] ' + s.text.slice(0, 120);
  });
  return 'Previously flagged story review notes:\n' + lines.join('\n');
}

// Initialize badge on load
updateSuggestionsCountBadge();

// buildStoryContext: summarises all cards for Claude's system context.
// Full content for the 15 most recent cards (including createdAt date);
// title + type only for older cards to stay within token budget.
function buildStoryContext() {
  if (cards.length === 0) return 'No story notes added yet.';

  // Count summary so the AI has a sense of scale
  var counts = {};
  cards.forEach(function(c) { counts[c.type] = (counts[c.type] || 0) + 1; });
  var countSummary = Object.keys(counts).map(function(t) {
    return counts[t] + ' ' + t;
  }).join(', ');

  // Sort by createdAt descending — most recent first
  var sorted = cards.slice().sort(function(a, b) {
    return new Date(b.createdAt) - new Date(a.createdAt);
  });
  var recentIds = sorted.slice(0, 15).map(function(c) { return c.id; });

  var byType = {};
  cards.forEach(function(c) {
    if (!byType[c.type]) byType[c.type] = [];
    var isRecent = recentIds.includes(c.id);
    var date = isRecent ? ' [' + new Date(c.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ']' : '';
    var status = (c.status === 'archived') ? ' [ARCHIVED]' : '';
    // Full content for recent cards; title only for older ones (saves tokens)
    byType[c.type].push('• ' + c.title + status + date + (isRecent && c.content ? ': ' + c.content : ''));
  });

  var ctx = 'Story notes for "' + currentProjectName + '" (' + countSummary + '):\n\n';
  var labels = { character: 'Characters', world: 'World Building', arc: 'Plot & Arcs', quote: 'Key Quotes', idea: 'Ideas' };
  Object.keys(byType).forEach(function(type) {
    ctx += (labels[type] || type) + ':\n' + byType[type].join('\n') + '\n\n';
  });
  return ctx;
}

// executeJarvisTool: maps a Claude tool_use call to existing app functions.
// Returns a result string (never throws — errors come back as strings so the loop can continue).
async function executeJarvisTool(name, input) {
  try {
    switch (name) {

      case 'navigate_tab': {
        var validTabs = ['home', 'canvas', 'writing', 'characters', 'arcs', 'outline'];
        if (!validTabs.includes(input.tab_name)) {
          return 'Error: "' + input.tab_name + '" is not a valid tab. Valid values: ' + validTabs.join(', ');
        }
        switchToTab(input.tab_name);
        return 'Navigated to the "' + input.tab_name + '" tab.';
      }

      case 'create_card': {
        if (!VALID_CARD_TYPES.includes(input.type)) {
          return 'Error: "' + input.type + '" is not a valid card type. Valid types: ' + VALID_CARD_TYPES.join(', ');
        }
        if (!input.title || !input.title.trim()) {
          return 'Error: title is required and cannot be empty.';
        }
        var dupTitle = input.title.trim().toLowerCase();
        var duplicate = cards.find(function(c) { return c.title.toLowerCase() === dupTitle; });
        if (duplicate) {
          return 'Error: a card with title "' + input.title + '" already exists (id: ' + duplicate.id + '). Use edit_card to modify it, or choose a different title.';
        }
        addCard(input.type, input.title.trim(), input.content || '');
        return 'Created ' + input.type + ' card: "' + input.title.trim() + '"';
      }

      case 'edit_card': {
        var target = null;
        if (input.card_id) {
          target = cards.find(function(c) { return c.id === input.card_id; });
        }
        if (!target && input.card_title) {
          var q = input.card_title.trim().toLowerCase();
          target = cards.find(function(c) { return c.title.toLowerCase() === q; });
        }
        if (!target) {
          return 'Error: card not found. Use search_cards to find the correct id or title first.';
        }
        if (!input.new_title && !input.new_content) {
          return 'Error: at least one of new_title or new_content must be provided.';
        }
        var oldTitle = target.title;
        if (input.new_title)   target.title   = input.new_title.trim();
        if (input.new_content) target.content = input.new_content;
        target.lastModified = new Date().toISOString();
        saveCards();
        renderCards();
        renderHomePage();
        return 'Updated card "' + oldTitle + '"' +
               (input.new_title   ? ' → title is now "' + target.title + '"' : '') +
               (input.new_content ? '; content updated.' : '.');
      }

      case 'search_cards': {
        if (!input.query || !input.query.trim()) {
          return 'Error: query cannot be empty.';
        }
        var sq = input.query.trim().toLowerCase();
        var matches = cards.filter(function(c) {
          return c.title.toLowerCase().includes(sq) || (c.content || '').toLowerCase().includes(sq);
        }).slice(0, 20);
        if (matches.length === 0) {
          return 'No cards found matching "' + input.query + '".';
        }
        var results = matches.map(function(c) {
          return { id: c.id, type: c.type, title: c.title, status: c.status, preview: (c.content || '').slice(0, 150) };
        });
        return JSON.stringify(results);
      }

      case 'read_full_context': {
        var fullCards = cards.map(function(c) {
          return '[' + c.type + '] ' + c.title + ' (id:' + c.id + ')\n' + (c.content || '(no content)');
        }).join('\n\n');
        var profileLines = [];
        Object.keys(characterProfiles).forEach(function(cardId) {
          var card = cards.find(function(c) { return c.id === cardId; });
          var prof = characterProfiles[cardId];
          profileLines.push(
            (card ? card.title : cardId) + ': role=' + (prof.role || '?') +
            ', enneagram=' + (prof.enneagram || '?') +
            ', goal=' + (prof.goal || '?') +
            ', fear=' + (prof.fear || '?') +
            ', arc=' + (prof.arc || '?')
          );
        });
        var out = 'FULL STORY CARDS:\n\n' + fullCards;
        if (profileLines.length > 0) out += '\n\nCHARACTER PROFILES:\n' + profileLines.join('\n');
        return out.slice(0, 15000);
      }

      case 'write_draft': {
        var draftEditor = document.getElementById('writingDraftEditor');
        if (!draftEditor) return JSON.stringify({ success: false, error: 'Draft editor not found.' });
        var draftMode = input.mode || 'append';
        var draftParagraphs = (input.content || '').split(/\n{2,}/).filter(function(p) { return p.trim(); });
        if (draftMode === 'replace') draftEditor.innerHTML = '';
        draftParagraphs.forEach(function(text) {
          var p = document.createElement('p');
          text.split('\n').forEach(function(line, i) {
            if (i > 0) p.appendChild(document.createElement('br'));
            p.appendChild(document.createTextNode(line));
          });
          draftEditor.appendChild(p);
        });
        localStorage.setItem(projectKey('writing_draft'), draftEditor.innerHTML);
        var draftVerb = draftMode === 'replace' ? 'replaced' : 'appended to';
        var draftCount = draftParagraphs.length;
        return JSON.stringify({
          success: true,
          message: 'Draft ' + draftVerb + ' (' + draftCount + ' paragraph' + (draftCount !== 1 ? 's' : '') + ' written). Content is in Draft — user must promote to Working Copy.'
        });
      }

      case 'create_outline_node': {
        var validNodeTypes = ['act', 'arc', 'chapter', 'scene'];
        if (!validNodeTypes.includes(input.type)) {
          return JSON.stringify({ success: false, error: 'Invalid type. Must be: ' + validNodeTypes.join(', ') });
        }
        if (!input.title || !input.title.trim()) {
          return JSON.stringify({ success: false, error: 'title is required.' });
        }
        var outlineNodes = loadOutline();
        var siblings = outlineNodes.filter(function(n) { return n.parent_id === (input.parent_id || null); });
        var newNode = {
          id: generateId(),
          type: input.type,
          title: input.title.trim(),
          beats: [],
          linked_card_ids: [],
          status: 'not_started',
          parent_id: input.parent_id || null,
          order: siblings.length
        };
        outlineNodes.push(newNode);
        saveOutline(outlineNodes);
        if (document.getElementById('panel-outline') && !document.getElementById('panel-outline').classList.contains('hidden')) {
          renderOutlineTab();
        }
        return JSON.stringify({ success: true, node: newNode });
      }

      case 'edit_outline_node': {
        var outlineNodes = loadOutline();
        var nodeToEdit = outlineNodes.find(function(n) { return n.id === input.id; });
        if (!nodeToEdit) return JSON.stringify({ success: false, error: 'Node not found with id: ' + input.id });
        if (input.title !== undefined) nodeToEdit.title = input.title.trim();
        if (input.beats !== undefined) nodeToEdit.beats = input.beats;
        if (input.status !== undefined) nodeToEdit.status = input.status;
        saveOutline(outlineNodes);
        if (document.getElementById('panel-outline') && !document.getElementById('panel-outline').classList.contains('hidden')) {
          renderOutlineTab();
        }
        return JSON.stringify({ success: true, node: nodeToEdit });
      }

      case 'read_outline': {
        var outlineNodes = loadOutline();
        return JSON.stringify(outlineNodes);
      }

      case 'link_card_to_node': {
        var outlineNodes = loadOutline();
        var nodeToLink = outlineNodes.find(function(n) { return n.id === input.node_id; });
        if (!nodeToLink) return JSON.stringify({ success: false, error: 'Node not found: ' + input.node_id });
        var cardToLink = cards.find(function(c) { return c.id === input.card_id; });
        if (!cardToLink) return JSON.stringify({ success: false, error: 'Card not found: ' + input.card_id });
        if (!nodeToLink.linked_card_ids.includes(input.card_id)) {
          nodeToLink.linked_card_ids.push(input.card_id);
          saveOutline(outlineNodes);
          if (document.getElementById('panel-outline') && !document.getElementById('panel-outline').classList.contains('hidden')) {
            renderOutlineDetail(nodeToLink.id);
          }
        }
        return JSON.stringify({ success: true, message: 'Card "' + cardToLink.title + '" linked to "' + nodeToLink.title + '".' });
      }

      case 'unlink_card_from_node': {
        var outlineNodes = loadOutline();
        var nodeToUnlink = outlineNodes.find(function(n) { return n.id === input.node_id; });
        if (!nodeToUnlink) return JSON.stringify({ success: false, error: 'Node not found: ' + input.node_id });
        var beforeLen = nodeToUnlink.linked_card_ids.length;
        nodeToUnlink.linked_card_ids = nodeToUnlink.linked_card_ids.filter(function(cid) { return cid !== input.card_id; });
        if (nodeToUnlink.linked_card_ids.length === beforeLen) {
          return JSON.stringify({ success: false, error: 'Card ' + input.card_id + ' was not linked to this node.' });
        }
        saveOutline(outlineNodes);
        if (document.getElementById('panel-outline') && !document.getElementById('panel-outline').classList.contains('hidden')) {
          renderOutlineDetail(nodeToUnlink.id);
        }
        return JSON.stringify({ success: true, message: 'Card unlinked from "' + nodeToUnlink.title + '".' });
      }

      default:
        return 'Error: unknown tool "' + name + '".';
    }
  } catch (err) {
    return 'Tool execution error: ' + err.message;
  }
}

// ============================================================
// J3: TIERED CONTEXT INJECTION
// selectRelevantCards(message) → { tier1, tier2, tier3 } card ID arrays
// buildTieredContext(message) → context string injected into system prompt every turn
// ============================================================

var lastCardSelection = null; // { categories, tier1, tier2, tier3 } — smart cache

function selectRelevantCards(message) {
  var msg = message.toLowerCase();
  var activeCards = cards.filter(function(c) { return c.status !== 'archived'; });
  if (activeCards.length === 0) return { tier1: [], tier2: [], tier3: [], categories: new Set() };

  var charTypes  = ['character', 'relationship'];
  var worldTypes = ['world', 'location', 'lore', 'faction'];
  var arcTypes   = ['arc', 'event', 'scene', 'theme', 'idea'];

  // Detect keyword categories (additive OR logic)
  var categories = new Set();
  activeCards.forEach(function(c) {
    if (c.title.length < 3) return;
    if (!msg.includes(c.title.toLowerCase())) return;
    if (charTypes.includes(c.type))  categories.add('character');
    if (worldTypes.includes(c.type)) categories.add('world');
    if (arcTypes.includes(c.type))   categories.add('arc');
    if (c.type === 'quote')          categories.add('quote');
  });
  if (/\b(character|person|protagonist|villain|hero)\b/.test(msg))  categories.add('character');
  if (/\b(world|place|location|city|realm|kingdom)\b/.test(msg))    categories.add('world');
  if (/\b(arc|plot|story|chapter|event|scene)\b/.test(msg))         categories.add('arc');
  if (/\b(quote|said|dialogue|says|told)\b/.test(msg))              categories.add('quote');

  // Smart cache: reuse if category overlap ≥50%
  if (lastCardSelection && lastCardSelection.categories.size > 0 && categories.size > 0) {
    var overlap = 0;
    categories.forEach(function(cat) { if (lastCardSelection.categories.has(cat)) overlap++; });
    var ratio = overlap / Math.max(categories.size, lastCardSelection.categories.size);
    if (ratio >= 0.5) {
      return { tier1: lastCardSelection.tier1, tier2: lastCardSelection.tier2, tier3: lastCardSelection.tier3, categories: categories, cached: true };
    }
  }

  // Tier 1: cards named in the message (up to 3, full content)
  var tier1Cards = activeCards.filter(function(c) {
    return c.title.length >= 3 && msg.includes(c.title.toLowerCase());
  }).slice(0, 3);
  var tier1Set = new Set(tier1Cards.map(function(c) { return c.id; }));

  // Determine matched types from categories
  var matchedTypes = new Set();
  if (categories.has('character')) charTypes.forEach(function(t)  { matchedTypes.add(t); });
  if (categories.has('world'))     worldTypes.forEach(function(t) { matchedTypes.add(t); });
  if (categories.has('arc'))       arcTypes.forEach(function(t)   { matchedTypes.add(t); });
  if (categories.has('quote'))     matchedTypes.add('quote');

  // Connections to Tier 1 cards (bonus score for Tier 2 ranking)
  var connectedToTier1 = new Set();
  connections.forEach(function(conn) {
    if (tier1Set.has(conn.from)) connectedToTier1.add(conn.to);
    if (tier1Set.has(conn.to))   connectedToTier1.add(conn.from);
  });

  var recent14 = Date.now() - 14 * 24 * 60 * 60 * 1000;
  function wordCount(c) { return (c.content || '').split(/\s+/).filter(Boolean).length; }

  // Tier 2+3 candidates: matched types not already in Tier 1
  var candidates = activeCards.filter(function(c) { return matchedTypes.has(c.type) && !tier1Set.has(c.id); });

  // Zero-match fallback: top 5 cards by word count
  if (candidates.length === 0 && categories.size === 0) {
    var fallback = activeCards.slice().sort(function(a, b) { return wordCount(b) - wordCount(a); }).slice(0, 5);
    var result0 = { categories: new Set(), tier1: [], tier2: fallback.map(function(c) { return c.id; }), tier3: [] };
    lastCardSelection = result0;
    return result0;
  }

  candidates.sort(function(a, b) {
    var aS = 0, bS = 0;
    if (new Date(a.lastModified || a.createdAt).getTime() > recent14) aS += 2;
    if (new Date(b.lastModified || b.createdAt).getTime() > recent14) bS += 2;
    aS += Math.min(wordCount(a) / 50, 2);
    bS += Math.min(wordCount(b) / 50, 2);
    if (connectedToTier1.has(a.id)) aS += 3;
    if (connectedToTier1.has(b.id)) bS += 3;
    return bS - aS;
  });

  var result = {
    categories: categories,
    tier1: tier1Cards.map(function(c) { return c.id; }),
    tier2: candidates.slice(0, 7).map(function(c) { return c.id; }),
    tier3: candidates.slice(7, 17).map(function(c) { return c.id; })
  };
  lastCardSelection = result;
  return result;
}

function buildTieredContext(message) {
  if (cards.length === 0) return '';
  var sel = selectRelevantCards(message);

  var counts = {};
  cards.forEach(function(c) { counts[c.type] = (counts[c.type] || 0) + 1; });
  var countSummary = Object.keys(counts).map(function(t) { return counts[t] + ' ' + t; }).join(', ');

  var ctx = 'Project: "' + currentProjectName + '" (' + currentProjectFormat + ')\n' +
    (currentProjectBrief ? currentProjectBrief + '\n\n' : '') +
    'Notes (' + countSummary + '):\n';

  function cardLine(c, truncate) {
    var raw = c.content || '';
    var content = truncate ? raw.slice(0, 200) + (raw.length > 200 ? '…' : '') : raw;
    return '[' + c.type + '] ' + c.title + (content ? ': ' + content : '');
  }

  sel.tier1.forEach(function(id) { var c = cards.find(function(x) { return x.id === id; }); if (c) ctx += cardLine(c, false) + '\n'; });
  sel.tier2.forEach(function(id) { var c = cards.find(function(x) { return x.id === id; }); if (c) ctx += cardLine(c, false) + '\n'; });
  sel.tier3.forEach(function(id) { var c = cards.find(function(x) { return x.id === id; }); if (c) ctx += cardLine(c, true) + '\n'; });

  return ctx.trim();
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

  // Stop any in-progress speech before starting a new exchange
  ttsQueue = []; ttsBusy = false; ttsSentBuf = '';
  if (ttsNextAudio && ttsNextAudio._objectUrl) URL.revokeObjectURL(ttsNextAudio._objectUrl);
  ttsNextText = null; ttsNextAudio = null; ttsNextFetch = null;
  if (currentPuterAudio) { currentPuterAudio.pause(); if (currentPuterAudio._objectUrl) URL.revokeObjectURL(currentPuterAudio._objectUrl); currentPuterAudio = null; }
  if (window.speechSynthesis) window.speechSynthesis.cancel();
  syncPauseButton(false); // dim pause button immediately before reply arrives

  appendChatMsg('user', msg);
  input.value = '';
  input.style.height = 'auto';

  chatHistory.push({ role: 'user', content: msg });

  var typingId = 'typing-' + Date.now();
  appendChatMsg('assistant', '...', typingId);
  document.getElementById('chatSend').disabled = true;

  try {
    // If history is getting long, summarize oldest turns before trimming
    if (chatHistory.length > 10) {
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
          var existing = localStorage.getItem(projectKey('chat_memory')) || '';
          var combined = (existing ? existing + '\n' : '') + memSummary;
          if (combined.length > 3000) combined = combined.slice(-3000);
          localStorage.setItem(projectKey('chat_memory'), combined);
          var memBadge = document.getElementById('chatMemoryBadge');
          if (memBadge) memBadge.style.display = '';
        }
      } catch (_) { /* memory summarization is best-effort */ }
    }

    // Build system prompt, injecting stored memory and saved suggestions if available
    var projectFacts = 'You are helping develop a ' + currentProjectFormat + ' called "' + currentProjectName + '".' +
      (currentProjectBrief ? ' ' + currentProjectBrief : '');
    var assistantBehavior = 'Be specific, creative, and concise. ' + ({
      novel:      'Help with writing, brainstorming, characters, plot, and dialogue.',
      biography:  'Help with structure, research organization, chronology, source integration, and narrative clarity.',
      memoir:     'Help with voice, memory reconstruction, thematic structure, and emotional arc.',
      nonfiction: 'Help with argument structure, research notes, clarity, and chapter organization.',
      screenplay: 'Help with scene writing, dialogue, structure, and character motivation.',
      other:      'Help with writing, brainstorming, structure, and development.'
    }[currentProjectFormat] || 'Help with writing, brainstorming, structure, and development.');
    var baseSystem = projectFacts + ' ' + assistantBehavior + '\n\nYou also have Sage tool capabilities — you can take direct actions in the StoryForge app. You CAN: navigate tabs, create cards, edit cards, search cards, read full story context, write to the story Draft, create/edit/read outline nodes, and link/unlink cards to outline nodes. You CANNOT: write to the Working Copy (user controls that), delete cards, or do anything not listed above. IMPORTANT: Never say an action is done unless the tool returned { "success": true }. If a tool fails, tell the user exactly what failed. When you write to the Draft, always confirm by saying how many paragraphs were written and remind the user the content is in Draft — they promote it to Working Copy themselves.\n\nUse tools ONLY when the user clearly requests an action (e.g. "create a card for...", "go to the characters tab", "write that to the draft"). For questions, brainstorming, or analysis, respond with text only — do not use tools unless asked to do something.\n\nWhen a request is ambiguous (multiple characters/arcs could match, or a required parameter like POV or setting is missing), ask ONE focused follow-up question instead of guessing. Prefer stating an assumption ("Assuming you mean X...") and answering over asking, whenever that produces a useful response. Never ask follow-ups when the user says "just answer", "your best guess", "continue", "more", or "go". In voice mode be stricter: only ask if the answer would be long (>3 sentences) AND the task is generative (writing/drafting, not recalling) AND the two most likely interpretations share less than 30% of their content.';
    var storedMemory = localStorage.getItem(projectKey('chat_memory'));
    var suggestionsCtx = buildSuggestionsContext();
    var systemPrompt = baseSystem;
    if (storedMemory) systemPrompt += '\n\nStory planning memory from earlier in this session:\n' + storedMemory;
    if (suggestionsCtx) systemPrompt += '\n\n' + suggestionsCtx;

    // J3: inject tiered story context into system prompt every turn
    var tieredCtx = buildTieredContext(msg);
    if (tieredCtx) systemPrompt += '\n\nRelevant story notes (auto-selected for this message):\n' + tieredCtx;

    // Cap history sent to API at last 20 turns
    var trimmedHistory = chatHistory.length > 10 ? chatHistory.slice(-10) : chatHistory;
    var messages = trimmedHistory.slice();

    // Remove typing indicator and start Jarvis status
    var typingEl = document.getElementById(typingId);
    if (typingEl) typingEl.remove();
    showJarvisStatus('Sage is thinking...');
    if (orbIsOpen) setOrbState('thinking');

    // Agentic loop: streaming fetch until end_turn or tool limit reached
    var MAX_TOOL_ITERATIONS = 8;
    var iteration   = 0;
    var finalReply  = null;
    var toolsRun    = [];
    var streamingDiv = null; // tracks DOM element when end_turn text was streamed

    while (iteration < MAX_TOOL_ITERATIONS) {
      iteration++;

      // Each iteration gets its own streaming state
      streamingDiv = null;
      var streamingP   = null;
      var streamedText = '';
      var allBlocks    = [];
      var curBlock     = null;
      var stopReason   = null;

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
          max_tokens: 4096,
          system:     systemPrompt,
          tools:      JARVIS_TOOLS,
          messages:   messages,
          stream:     true
        })
      });

      if (!res.ok) {
        var errJson = await res.json();
        var e = new Error((errJson && errJson.error && errJson.error.message) || 'API error');
        e.status = res.status;
        throw e;
      }

      // Process SSE stream
      var reader  = res.body.getReader();
      var decoder = new TextDecoder();
      var sseBuf  = '';
      var chatMsgsEl = document.getElementById('chatMessages');

      streamLoop: while (true) {
        var chunk = await reader.read();
        if (chunk.done) break;
        sseBuf += decoder.decode(chunk.value, { stream: true });
        var lines = sseBuf.split('\n');
        sseBuf = lines.pop(); // hold incomplete line
        for (var li = 0; li < lines.length; li++) {
          var line = lines[li];
          if (!line.startsWith('data: ')) continue;
          var payload = line.slice(6).trim();
          if (!payload || payload === '[DONE]') continue;
          var ev;
          try { ev = JSON.parse(payload); } catch(_) { continue; }

          if (ev.type === 'content_block_start') {
            curBlock = { type: ev.content_block.type, id: ev.content_block.id, name: ev.content_block.name, _text: '', _json: '' };
          } else if (ev.type === 'content_block_delta') {
            if (!curBlock) continue;
            if (ev.delta.type === 'text_delta') {
              curBlock._text += ev.delta.text;
              streamedText   += ev.delta.text;
              flushTTSSentences(ev.delta.text, false);
              // Lazy-create streaming bubble; insert before the status indicator
              if (!streamingDiv) {
                streamingDiv = document.createElement('div');
                streamingDiv.className = 'chat-msg assistant';
                streamingP = document.createElement('p');
                streamingDiv.appendChild(streamingP);
                var statusEl = document.getElementById('jarvisStatus');
                if (statusEl) chatMsgsEl.insertBefore(streamingDiv, statusEl);
                else chatMsgsEl.appendChild(streamingDiv);
              }
              streamingP.textContent = streamedText;
              chatMsgsEl.scrollTop = chatMsgsEl.scrollHeight;
            } else if (ev.delta.type === 'input_json_delta') {
              curBlock._json += ev.delta.partial_json;
            }
          } else if (ev.type === 'content_block_stop') {
            if (curBlock) {
              if (curBlock.type === 'text') {
                allBlocks.push({ type: 'text', text: curBlock._text });
              } else if (curBlock.type === 'tool_use') {
                var inp = {};
                try { inp = JSON.parse(curBlock._json || '{}'); } catch(_) {}
                allBlocks.push({ type: 'tool_use', id: curBlock.id, name: curBlock.name, input: inp });
              }
              curBlock = null;
            }
          } else if (ev.type === 'message_delta') {
            if (ev.delta && ev.delta.stop_reason) stopReason = ev.delta.stop_reason;
          } else if (ev.type === 'error') {
            throw new Error((ev.error && ev.error.message) || 'Stream error');
          }
        }
      }

      if (stopReason === 'end_turn') {
        flushTTSSentences('', true);
        finalReply = streamedText.trim() || 'Done.';
        // streamingDiv stays in DOM — text already rendered
        break;
      }

      if (stopReason === 'tool_use') {
        flushTTSSentences('', true);
        // Remove any partial streamed text (tool-call thinking; not shown to user)
        if (streamingDiv) { streamingDiv.remove(); streamingDiv = null; }

        messages.push({ role: 'assistant', content: allBlocks });

        var toolUseBlocks = allBlocks.filter(function(b) { return b.type === 'tool_use'; });
        var toolResultContents = [];

        for (var ti = 0; ti < toolUseBlocks.length; ti++) {
          var tb = toolUseBlocks[ti];
          updateJarvisStatus('Running: ' + tb.name + '...');
          toolsRun.push(tb.name);
          var toolResult = await executeJarvisTool(tb.name, tb.input);
          toolResultContents.push({
            type:        'tool_result',
            tool_use_id: tb.id,
            content:     typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult)
          });
        }

        messages.push({ role: 'user', content: toolResultContents });
        updateJarvisStatus('Sage is thinking...');
        continue;
      }

      // Unexpected stop reason — bail out
      console.warn('[Sage] Unexpected stop_reason:', stopReason);
      break;
    }

    removeJarvisStatus();

    if (!finalReply && iteration >= MAX_TOOL_ITERATIONS) {
      finalReply = 'Sage hit the action limit. Actions completed: ' + toolsRun.join(', ');
    }

    var reply = finalReply || '';
    if (reply) {
      // Text already in DOM if streamed (end_turn); only append if not (action limit case)
      if (!streamingDiv) appendChatMsg('assistant', reply);
      chatHistory.push({ role: 'assistant', content: reply });
    }

    // If this was a Canon Review, append a "Save Suggestions" button to the message
    if (lastMessageWasCanonReview && reply) {
      lastMessageWasCanonReview = false;
      var msgs = document.getElementById('chatMessages');
      var lastMsg = msgs.lastElementChild;
      if (lastMsg) {
        var saveBtn = document.createElement('button');
        saveBtn.className = 'save-suggestions-btn';
        saveBtn.textContent = '💾 Save to Suggestions';
        var capturedReply = reply;
        saveBtn.addEventListener('click', function() {
          addSuggestion(capturedReply, 'canon_review');
          saveBtn.textContent = '✓ Saved';
          saveBtn.disabled = true;
          showToast('Suggestions saved — open the Suggestions tab to review them.');
          updateSuggestionsCountBadge();
        });
        lastMsg.appendChild(saveBtn);
      }
    }

  } catch (err) {
    removeJarvisStatus();
    if (orbIsOpen) setOrbState('idle');
    ttsQueue = []; ttsBusy = false; ttsSentBuf = '';
    if (ttsNextAudio && ttsNextAudio._objectUrl) URL.revokeObjectURL(ttsNextAudio._objectUrl);
    ttsNextText = null; ttsNextAudio = null; ttsNextFetch = null;
    if (currentPuterAudio) { currentPuterAudio.pause(); if (currentPuterAudio._objectUrl) URL.revokeObjectURL(currentPuterAudio._objectUrl); currentPuterAudio = null; }
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    syncPauseButton(false);
    var isRateLimit = err.status === 429 || /rate.?limit|429/i.test(err.message);
    appendChatMsg('assistant', isRateLimit
      ? '❌ Rate limit hit — too many tokens sent this minute. Wait a moment and try again.'
      : '❌ ' + err.message);
  } finally {
    document.getElementById('chatSend').disabled  = false;
    document.getElementById('chatInput').disabled = false;
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

// Jarvis status indicator — shows an inline pulsing bar while tools are running.
// At most one exists at a time; updateJarvisStatus mutates text in place.
function showJarvisStatus(msg) {
  removeJarvisStatus();
  var msgs = document.getElementById('chatMessages');
  var el = document.createElement('div');
  el.className = 'jarvis-status';
  el.id = 'jarvisStatus';
  var dot = document.createElement('span');
  dot.className = 'jarvis-status-dot';
  var txt = document.createElement('span');
  txt.id = 'jarvisStatusText';
  txt.textContent = msg || 'Sage is working...';
  el.appendChild(dot);
  el.appendChild(txt);
  msgs.appendChild(el);
  msgs.scrollTop = msgs.scrollHeight;
  document.getElementById('chatInput').disabled = true;
  document.getElementById('chatSend').disabled  = true;
}

function updateJarvisStatus(msg) {
  var textEl = document.getElementById('jarvisStatusText');
  if (textEl) textEl.textContent = msg;
  var msgs = document.getElementById('chatMessages');
  if (msgs) msgs.scrollTop = msgs.scrollHeight;
}

function removeJarvisStatus() {
  var el = document.getElementById('jarvisStatus');
  if (el) el.remove();
  document.getElementById('chatInput').disabled = false;
  document.getElementById('chatSend').disabled  = false;
}


// ============================================================
// SECTION 13B: SAGE VOICE — Phase 6 (chat TTS + mic) & Phase 7 (orb)
// ============================================================

var voiceEnabled     = true;
var currentPuterAudio = null; // tracks active Puter.js audio for cancellation
var sageVoice        = null;  // selected Web Speech API fallback voice
var autoSendEnabled  = JSON.parse(localStorage.getItem('sf_voice_autosend') ?? 'true');
var ttsPaused        = false;

// ── Sentence-level TTS streaming queue ───────────────────────
var ttsQueue   = [];    // sentences waiting to be spoken
var ttsBusy    = false; // true while ElevenLabs/Web Speech is active
var ttsSentBuf = '';    // accumulates partial sentence across streaming chunks
var ttsNextText  = null; // text currently being pre-fetched
var ttsNextAudio = null; // resolved audio element for ttsNextText (null while in-flight)
var ttsNextFetch = null; // Promise<audio|null> for the in-flight pre-fetch
var ttsMode      = 'elevenlabs'; // 'elevenlabs' | 'browser' — toggled by ttsModeBtn

var ELEVENLABS_API_KEY  = localStorage.getItem('sf_elabs_key') || '';
var ELEVENLABS_VOICE_ID = 'oL6xVEFZFZWN3ZxjScyK';

async function fetchElevenLabsAudio(text) {
  var res = await fetch('https://api.elevenlabs.io/v1/text-to-speech/' + ELEVENLABS_VOICE_ID + '/stream', {
    method: 'POST',
    headers: { 'xi-api-key': ELEVENLABS_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: text,
      model_id: 'eleven_flash_v2_5',
      voice_settings: { stability: 0.4, similarity_boost: 0.75, style: 0.5, use_speaker_boost: true, speed: 1.1 }
    })
  });
  if (!res.ok) throw new Error('ElevenLabs ' + res.status);
  var blob = await res.blob();
  var url = URL.createObjectURL(blob);
  var audio = new Audio(url);
  audio._objectUrl = url;
  return audio;
}

// flushTTSSentences: called on each streaming text delta and at end-of-response.
// Strips markdown, detects complete sentence boundaries, and enqueues each sentence.
function flushTTSSentences(chunk, force) {
  if (!voiceEnabled && !orbIsOpen) return;

  // Strip markdown before buffering so code blocks don't confuse sentence detection
  var clean = chunk
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`[^`]+`/g, '')
    .replace(/[*_#\[\]]/g, '');
  ttsSentBuf += clean;

  // Find sentence boundaries: punctuation followed by whitespace + capital letter.
  // Taking the full slice from the last cut to the end of the matched punct avoids
  // splitting on abbreviations like "Dr." or decimals like "$4.99" (they won't be
  // followed by space + capital in the middle of a sentence).
  var re = /[.!?]+(?=\s+[A-Z"'])/g;
  var match;
  var lastCut = 0;
  while ((match = re.exec(ttsSentBuf)) !== null) {
    var end = match.index + match[0].length;
    var candidate = ttsSentBuf.slice(lastCut, end).trim();
    if (candidate.length >= 30) {
      enqueueTTS(candidate);
      lastCut = end;
    }
    // If candidate < 30 chars (e.g. "Dr."), don't cut — keep accumulating
  }
  if (lastCut > 0) ttsSentBuf = ttsSentBuf.slice(lastCut);

  if (force) {
    if (ttsSentBuf.trim().length >= 10) enqueueTTS(ttsSentBuf.trim());
    ttsSentBuf = '';
  }
}

// startNextPrefetch: peek at ttsQueue[0] and start an ElevenLabs fetch in background.
// Called right after pressing play on the current sentence so the next is ready to fire instantly.
function startNextPrefetch() {
  if (ttsMode !== 'elevenlabs') return;
  if (ttsQueue.length === 0) return;
  var next = ttsQueue[0];
  if (next === ttsNextText) return; // already fetching or ready
  ttsNextText = next;
  ttsNextAudio = null;
  ttsNextFetch = fetchElevenLabsAudio(next)
    .then(function(a) { if (ttsNextText === next) ttsNextAudio = a; return a; })
    .catch(function() { return null; });
}

// enqueueTTS: clean and add text to the playback queue; start processing if idle.
function enqueueTTS(text) {
  var clean = text
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`[^`]+`/g, '')
    .replace(/[*_#\[\]]/g, '')
    .replace(/[^\w\s.,!?'"();:\-–]/g, ' ')
    .trim()
    .slice(0, 900);
  if (!clean) return;
  ttsQueue.push(clean);
  if (!ttsBusy) {
    processTTSQueue();
  } else if (ttsQueue.length === 1 && !ttsNextFetch) {
    // First item added while another sentence plays and no pre-fetch running — start one now
    startNextPrefetch();
  }
}

// processTTSQueue: play next item using pre-fetched audio when available, chain via callbacks.
async function processTTSQueue() {
  if (ttsQueue.length === 0) {
    ttsBusy = false;
    ttsPaused = false;
    syncPauseButton(false);
    if (orbIsOpen) setOrbState('idle');
    return;
  }
  // Guard 0: auto-clear stale pause state when starting a fresh queue with nothing playing
  if (!currentPuterAudio && ttsQueue.length > 0 && ttsPaused) {
    ttsPaused = false;
    syncPauseButton(false);
  }
  if (!voiceEnabled && !orbIsOpen) { ttsQueue = []; ttsBusy = false; return; }
  ttsBusy = true;
  var text = ttsQueue.shift();

  if (ttsMode === 'elevenlabs') {
    try {
      if (orbIsOpen) setOrbState('speaking');
      var audioPromise;
      if (ttsNextText === text && ttsNextFetch) {
        // Reuse in-flight or already-resolved pre-fetch — may be instant if audio is ready
        audioPromise = ttsNextFetch;
        ttsNextText = null; ttsNextAudio = null; ttsNextFetch = null;
      } else {
        // Pre-fetch miss (first sentence, or queue jumped) — fetch now
        ttsNextText = null; ttsNextAudio = null; ttsNextFetch = null;
        audioPromise = fetchElevenLabsAudio(text).catch(function() { return null; });
      }
      var audio = await audioPromise;
      if (!audio) throw new Error('no audio');
      currentPuterAudio = audio;
      startNextPrefetch(); // begin fetching the sentence after this one while it plays
      // Guard 1: if paused while audio was fetching, store it and wait for resume
      if (ttsPaused) {
        currentPuterAudio = audio; // resume will call .play()
        return;
      }
      audio.onended = function() {
        if (audio._objectUrl) URL.revokeObjectURL(audio._objectUrl);
        currentPuterAudio = null;
        startNextPrefetch(); // belt-and-suspenders: cover sentences enqueued after initial pre-fetch
        ttsBusy = false;
        // Guard 2: don't advance queue if paused between sentences
        if (!ttsPaused) {
          processTTSQueue();
        }
      };
      audio.play();
      setOrbState('speaking');
      syncPauseButton(true);
      return;
    } catch (e) {
      console.warn('[Sage TTS] ElevenLabs failed, falling back to Web Speech:', e);
      if (currentPuterAudio && currentPuterAudio._objectUrl) URL.revokeObjectURL(currentPuterAudio._objectUrl);
      currentPuterAudio = null;
      if (ttsNextAudio && ttsNextAudio._objectUrl) URL.revokeObjectURL(ttsNextAudio._objectUrl);
      ttsNextText = null; ttsNextAudio = null; ttsNextFetch = null;
    }
  }

  // Fallback: Web Speech API (no pre-fetch needed — no network latency)
  if (!window.speechSynthesis) { ttsBusy = false; if (orbIsOpen) setOrbState('idle'); return; }
  var utt = new SpeechSynthesisUtterance(text);
  if (sageVoice) utt.voice = sageVoice;
  var isNatural = sageVoice && sageVoice.name.includes('Natural');
  utt.rate   = isNatural ? 1.0 : 1.05;
  utt.pitch  = isNatural ? 1.0 : 1.15;
  utt.volume = 1;
  utt.onstart = function() { if (orbIsOpen) setOrbState('speaking'); };
  utt.onend   = function() { ttsBusy = false; processTTSQueue(); };
  utt.onerror = function() { ttsBusy = false; if (orbIsOpen) setOrbState('idle'); processTTSQueue(); };
  window.speechSynthesis.speak(utt);
}

// ── Orb state ─────────────────────────────────────────────────
var orbIsOpen     = false;
var orbState      = 'idle';   // 'idle' | 'listening' | 'thinking' | 'speaking'
var orbAnimFrame  = null;
var orbMicStream  = null;
var orbAudioCtx   = null;
var orbAnalyser   = null;
var orbMicVolume  = 0;
var orbRecognition = null;
var orbRotY       = 0;
var orbParticles  = [];
var orbPulseRings = [];
var orbPulseTimer = null;

// Build uniform spherical particle cloud (avoids polar band clustering)
(function initOrbParticles() {
  var N = 340;
  for (var i = 0; i < N; i++) {
    var phi   = Math.acos(1 - 2 * Math.random());
    var theta = Math.random() * Math.PI * 2;
    var sinP  = Math.sin(phi);
    orbParticles.push({
      bx:       sinP * Math.cos(theta),
      by:       Math.cos(phi),
      bz:       sinP * Math.sin(theta),
      ring:     0,
      ringFrac: Math.random(),
      theta:    theta,
      phase:    Math.random() * Math.PI * 2,
      baseSize:  0.55 + Math.random() * 1.6,
      baseAlpha: 0.28 + Math.random() * 0.58,
      hue:       264 + (Math.random() - 0.5) * 22
    });
  }
})();

// openJarvisOrb: start the embedded orb animation when chat opens
function openJarvisOrb() {
  orbIsOpen = true;
  resizeOrbCanvas();
  setOrbState('idle');
  startOrbAnimation();
}

// closeJarvisOrb: stop animation when chat closes
function closeJarvisOrb() {
  orbIsOpen = false;
  clearInterval(orbPulseTimer); orbPulseTimer = null; orbPulseRings = [];
  if (orbAnimFrame) { cancelAnimationFrame(orbAnimFrame); orbAnimFrame = null; }
  stopOrbListening();
  stopOrbMic();
  ttsQueue = []; ttsBusy = false; ttsSentBuf = '';
  if (ttsNextAudio && ttsNextAudio._objectUrl) URL.revokeObjectURL(ttsNextAudio._objectUrl);
  ttsNextText = null; ttsNextAudio = null; ttsNextFetch = null;
  if (currentPuterAudio) { currentPuterAudio.pause(); if (currentPuterAudio._objectUrl) URL.revokeObjectURL(currentPuterAudio._objectUrl); currentPuterAudio = null; }
  if (window.speechSynthesis) window.speechSynthesis.cancel();
}

function setOrbState(state) {
  orbState = state;
  // Pulse ring timer — fire every 700ms in listening state
  clearInterval(orbPulseTimer);
  orbPulseRings = [];
  if (state === 'listening') {
    orbPulseTimer = setInterval(function() {
      orbPulseRings.push({ r: 28, opacity: 0.55 });
    }, 700);
  }
  var labels = { idle: '', listening: '🎤  Listening...', thinking: 'Thinking...', speaking: 'Speaking...', paused: '⏸  Paused' };
  var el = document.getElementById('jarvisOrbStatus');
  if (el) el.textContent = labels[state] || '';
  // Mic button appearance in orb
  var micBtn = document.getElementById('jarvisOrbMicBtn');
  if (micBtn) {
    if (state === 'listening') { micBtn.textContent = '⏹ Stop'; micBtn.classList.add('listening'); }
    else                       { micBtn.textContent = '🎤 Speak'; micBtn.classList.remove('listening'); }
  }
}

function resizeOrbCanvas() {
  var canvas = document.getElementById('jarvisOrbCanvas');
  if (!canvas) return;
  canvas.width  = canvas.offsetWidth  || window.innerWidth;
  canvas.height = canvas.offsetHeight || window.innerHeight;
}

function startOrbAnimation() {
  if (orbAnimFrame) cancelAnimationFrame(orbAnimFrame);
  function loop() {
    if (!orbIsOpen) return;
    orbAnimFrame = requestAnimationFrame(loop);
    renderOrb();
  }
  loop();
}

// renderOrb: draw one frame of the particle sphere
function renderOrb() {
  var canvas = document.getElementById('jarvisOrbCanvas');
  if (!canvas) return;
  var ctx = canvas.getContext('2d');
  var W = canvas.width, H = canvas.height;
  if (!W || !H) return;
  var cx = W / 2, cy = H / 2;
  var R  = Math.min(W, H) * 0.27;
  var time = Date.now() * 0.001;

  ctx.clearRect(0, 0, W, H);

  // Rotation speed by state
  var speeds = { idle: 0.003, listening: 0.009, thinking: 0.055, speaking: 0.012, paused: 0 };
  orbRotY += speeds[orbState] || 0.003;

  // Sample mic volume in listening state
  if (orbState === 'listening' && orbAnalyser) {
    var arr = new Uint8Array(orbAnalyser.frequencyBinCount);
    orbAnalyser.getByteFrequencyData(arr);
    var sum = 0;
    for (var di = 0; di < arr.length; di++) sum += arr[di];
    var raw = (sum / arr.length) / 96;
    orbMicVolume = orbMicVolume * 0.6 + raw * 0.4; // smooth
  } else {
    orbMicVolume = Math.max(0, orbMicVolume - 0.04);
  }

  var cosY = Math.cos(orbRotY), sinY = Math.sin(orbRotY);

  // Project particles
  var projected = orbParticles.map(function(p) {
    // Y-axis rotation
    var x1 = p.bx * cosY + p.bz * sinY;
    var z1 = -p.bx * sinY + p.bz * cosY;
    var y1 = p.by;

    // State-based band wave displacement
    var disp = 1.0;
    if (orbState === 'idle') {
      disp = 1 + 0.025 * Math.sin(time * 0.6 + p.ringFrac * Math.PI * 3 + p.phase * 0.3);
    } else if (orbState === 'listening') {
      var vol = orbMicVolume;
      disp = 1 + vol * 0.5 * (0.5 + 0.5 * Math.sin(time * 5 + p.ringFrac * Math.PI * 6));
      // Extra band spike near equator when loud
      if (vol > 0.5) {
        var eq = 1 - Math.abs(p.ringFrac - 0.5) * 2; // 1 at equator, 0 at poles
        disp += vol * 0.3 * eq;
      }
    } else if (orbState === 'thinking') {
      // Chaotic: each ring gets a different swirl offset
      var chaos = Math.sin(time * 3.5 + p.ringFrac * Math.PI * 8 + p.phase * 3);
      disp = 1 + 0.32 * chaos;
      x1 += 0.18 * Math.cos(time * 2 + p.phase) * Math.abs(chaos);
      y1 += 0.15 * Math.sin(time * 1.7 + p.phase) * Math.abs(chaos);
    } else if (orbState === 'speaking') {
      var wave = Math.sin(time * 6 - p.ringFrac * Math.PI * 7);
      disp = 1 + 0.22 * wave;
    }

    var fx = x1 * disp, fy = y1 * disp, fz = z1 * disp;

    // Perspective projection
    var fov = 480;
    var pz  = fz + 3;
    var sx  = cx + fx * R * fov / (fov + pz * R);
    var sy  = cy + fy * R * fov / (fov + pz * R);

    // Depth: back particles are dimmer and smaller
    var depth  = (fz + 1.5) / 3;         // 0..1
    var alpha  = 0.15 + 0.85 * depth;
    var radius = 0.6 + 2.0 * depth;

    return { sx: sx, sy: sy, fz: fz, p: p };
  });

  // Sort back-to-front (painter's algorithm)
  projected.sort(function(a, b) { return a.fz - b.fz; });

  // Ambient background glow — indigo, alpha varies by state
  var glowAlpha = orbState === 'speaking' ? 0.22 : orbState === 'listening' ? 0.14 : 0.07;
  var bgGlow = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 1.6);
  bgGlow.addColorStop(0, 'hsla(268, 65%, 45%, ' + glowAlpha + ')');
  bgGlow.addColorStop(1, 'transparent');
  ctx.fillStyle = bgGlow;
  ctx.fillRect(0, 0, W, H);

  // Pulse rings (listening state only)
  orbPulseRings = orbPulseRings.filter(function(ring) { return ring.opacity > 0.02; });
  orbPulseRings.forEach(function(ring) {
    ring.r      += 1.8;
    ring.opacity *= 0.963;
    ctx.beginPath();
    ctx.arc(cx, cy, ring.r, 0, Math.PI * 2);
    ctx.strokeStyle = 'hsla(268, 72%, 72%, ' + ring.opacity.toFixed(3) + ')';
    ctx.lineWidth = 1.2;
    ctx.stroke();
  });

  // Draw particles — depth-cued lightness and alpha (HSLA)
  projected.forEach(function(pt) {
    var depth = (pt.fz + 1.5) / 3;                         // 0=back, 1=front
    var lit   = 48 + depth * 28;                            // 48% (dim) → 76% (bright)
    var alpha = pt.p.baseAlpha * (0.1 + depth * 0.9);
    var sz    = pt.p.baseSize  * Math.max(0.18, depth);
    var hue   = pt.p.hue;

    ctx.beginPath();
    ctx.arc(pt.sx, pt.sy, sz, 0, Math.PI * 2);
    ctx.fillStyle = 'hsla(' + hue + ', 58%, ' + lit.toFixed(0) + '%, ' + Math.min(1, alpha).toFixed(3) + ')';
    ctx.fill();
  });
}

// ── Mic / Web Audio ──────────────────────────────────────────
function startOrbMic(onReady) {
  if (orbMicStream) { if (onReady) onReady(); return; }
  navigator.mediaDevices.getUserMedia({ audio: true, video: false })
    .then(function(stream) {
      orbMicStream = stream;
      orbAudioCtx  = new (window.AudioContext || window.webkitAudioContext)();
      var src      = orbAudioCtx.createMediaStreamSource(stream);
      orbAnalyser  = orbAudioCtx.createAnalyser();
      orbAnalyser.fftSize = 256;
      src.connect(orbAnalyser);
      if (onReady) onReady();
    })
    .catch(function(err) {
      console.warn('[Sage] Mic access denied:', err);
      updateOrbTranscript('Microphone access denied. Check browser permissions.');
    });
}

function stopOrbMic() {
  if (orbMicStream) { orbMicStream.getTracks().forEach(function(t) { t.stop(); }); orbMicStream = null; }
  if (orbAudioCtx)  { orbAudioCtx.close(); orbAudioCtx = null; orbAnalyser = null; }
}

// ── Speech recognition (voice → text → Claude) ───────────────
const VOICE_SEND_DELAY_MS = 2500;

function startOrbListening() {
  var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    updateOrbTranscript('Speech recognition requires Chrome or Edge.');
    return;
  }

  var micBtn = document.getElementById('jarvisOrbMicBtn');
  if (micBtn && micBtn.classList.contains('listening')) {
    // User deliberately tapped stop — set flag BEFORE stopping recognition
    if (orbRecognition) {
      orbRecognition._userStopped = true; // propagate to onend via shared ref
      try { orbRecognition.stop(); } catch(_) {}
    }
    setOrbState('idle');
    return;
  }

  startOrbMic(function() {
    if (orbRecognition) { try { orbRecognition.abort(); } catch(_) {} }

    var accumulatedTranscript = '';
    var lastResultIndex = 0;
    var sendTimer = null;
    var hasAlreadySent = false;
    var userStoppedMic = false;

    orbRecognition = new SR();
    orbRecognition.continuous     = true;
    orbRecognition.interimResults = true;
    orbRecognition.lang           = 'en-US';

    orbRecognition.onstart = function() {
      accumulatedTranscript = '';
      lastResultIndex = 0;
      sendTimer = null;
      hasAlreadySent = false;
      userStoppedMic = false;
    };

    orbRecognition.onresult = function(e) {
      var interim = '';
      for (var i = lastResultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) {
          accumulatedTranscript += e.results[i][0].transcript + ' ';
          lastResultIndex = i + 1;
        } else {
          interim = e.results[i][0].transcript;
        }
      }
      updateOrbTranscript(accumulatedTranscript + interim);

      clearTimeout(sendTimer);
      sendTimer = setTimeout(function() {
        var shouldAutoSend = autoSendEnabled; // snapshot at fire time
        hasAlreadySent = true;
        orbRecognition.stop();
        var input = document.getElementById('chatInput');
        if (input) {
          input.value = accumulatedTranscript.trim();
          if (!shouldAutoSend) input.focus();
        }
        if (typeof updateOrbTranscript === 'function') updateOrbTranscript('');
        if (shouldAutoSend) {
          setOrbState('thinking');
          sendChatMessage();
        } else {
          setOrbState('idle');
        }
        accumulatedTranscript = '';
      }, VOICE_SEND_DELAY_MS);
    };

    orbRecognition.onerror = function(e) {
      if (e.error !== 'no-speech') console.warn('[Sage] Recognition error:', e.error);
      clearTimeout(sendTimer);
      setOrbState('idle');
    };

    orbRecognition.onend = function() {
      // Sync userStoppedMic from shared flag set in the stop branch above
      if (orbRecognition && orbRecognition._userStopped) userStoppedMic = true;
      clearTimeout(sendTimer);
      if (!hasAlreadySent && !userStoppedMic && accumulatedTranscript.trim()) {
        var input = document.getElementById('chatInput');
        if (input) input.value = accumulatedTranscript.trim();
        if (autoSendEnabled) {
          sendChatMessage();
        } else {
          if (input) input.focus();
          setOrbState('idle');
        }
      }
      accumulatedTranscript = '';
      hasAlreadySent = false;
      userStoppedMic = false;
      if (orbState === 'listening') setOrbState('idle');
    };

    setOrbState('listening');
    orbRecognition.start();
  });
}

function stopOrbListening() {
  if (orbRecognition) { try { orbRecognition.stop(); } catch(_) {} orbRecognition = null; }
  if (orbState === 'listening') setOrbState('idle');
}

function updateOrbTranscript(text) {
  var el = document.getElementById('jarvisOrbTranscript');
  if (el) el.textContent = text;
}

// ── Text-to-speech output ────────────────────────────────────
// Direct-call shortcut: cancels current audio, then routes through the TTS queue.
function speakSageReply(text) {
  ttsPaused = false;
  syncPauseButton(false);
  ttsQueue = []; ttsBusy = false;
  if (ttsNextAudio && ttsNextAudio._objectUrl) URL.revokeObjectURL(ttsNextAudio._objectUrl);
  ttsNextText = null; ttsNextAudio = null; ttsNextFetch = null;
  if (currentPuterAudio) { currentPuterAudio.pause(); if (currentPuterAudio._objectUrl) URL.revokeObjectURL(currentPuterAudio._objectUrl); currentPuterAudio = null; }
  if (window.speechSynthesis) window.speechSynthesis.cancel();
  enqueueTTS(text);
}

// ── Voice toggle ──────────────────────────────────────────────
function toggleVoice() {
  voiceEnabled = !voiceEnabled;
  if (!voiceEnabled) {
    ttsPaused = false;
    syncPauseButton(false);
    ttsQueue = []; ttsBusy = false;
    if (ttsNextAudio && ttsNextAudio._objectUrl) URL.revokeObjectURL(ttsNextAudio._objectUrl);
    ttsNextText = null; ttsNextAudio = null; ttsNextFetch = null;
    if (currentPuterAudio) { currentPuterAudio.pause(); if (currentPuterAudio._objectUrl) URL.revokeObjectURL(currentPuterAudio._objectUrl); currentPuterAudio = null; }
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    if (orbIsOpen) setOrbState('idle');
  }
  var btn = document.getElementById('chatVoiceToggle');
  if (btn) btn.textContent = voiceEnabled ? '🔊' : '🔇';
}

// ── Chat panel mic (Phase 6): debounced speech → fill input → send ──
function startChatMicInput() {
  var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { showToast('Speech recognition requires Chrome or Edge.'); return; }

  var micBtn = document.getElementById('chatMic');
  if (micBtn && micBtn.classList.contains('listening')) {
    // User deliberately tapped stop — set flag BEFORE stopping recognition
    var userStoppedMic = true; // captured by onend via shared rec ref
    if (orbRecognition) {
      orbRecognition._userStopped = true;
      try { orbRecognition.stop(); } catch(_) {}
      orbRecognition = null;
    }
    if (micBtn) micBtn.classList.remove('listening');
    setOrbState('idle');
    return;
  }

  var accumulatedTranscript = '';
  var lastResultIndex = 0;
  var sendTimer = null;
  var hasAlreadySent = false;
  var userStoppedMic = false;

  var rec = new SR();
  orbRecognition = rec; // reuse slot for abort access
  rec.continuous     = true;
  rec.interimResults = true;
  rec.lang           = 'en-US';
  if (micBtn) micBtn.classList.add('listening');
  setOrbState('listening');

  rec.onstart = function() {
    accumulatedTranscript = '';
    lastResultIndex = 0;
    sendTimer = null;
    hasAlreadySent = false;
    userStoppedMic = false;
  };

  rec.onresult = function(e) {
    var interim = '';
    for (var i = lastResultIndex; i < e.results.length; i++) {
      if (e.results[i].isFinal) {
        accumulatedTranscript += e.results[i][0].transcript + ' ';
        lastResultIndex = i + 1;
      } else {
        interim = e.results[i][0].transcript;
      }
    }
    var input = document.getElementById('chatInput');
    if (input) input.value = accumulatedTranscript + interim;

    clearTimeout(sendTimer);
    sendTimer = setTimeout(function() {
      var shouldAutoSend = autoSendEnabled; // snapshot at fire time
      hasAlreadySent = true;
      rec.stop();
      var input = document.getElementById('chatInput');
      if (input) {
        input.value = accumulatedTranscript.trim();
        if (!shouldAutoSend) input.focus();
      }
      if (micBtn) micBtn.classList.remove('listening');
      if (typeof updateOrbTranscript === 'function') updateOrbTranscript('');
      if (shouldAutoSend) {
        setOrbState('thinking');
        sendChatMessage();
      } else {
        setOrbState('idle');
      }
      accumulatedTranscript = '';
    }, VOICE_SEND_DELAY_MS);
  };

  rec.onerror = function(e) {
    if (e.error !== 'no-speech') console.warn('[Sage] Chat mic error:', e.error);
    clearTimeout(sendTimer);
    if (micBtn) micBtn.classList.remove('listening');
    setOrbState('idle');
  };

  rec.onend = function() {
    // Pick up userStoppedMic from shared flag set in stop branch above
    if (rec._userStopped) userStoppedMic = true;
    clearTimeout(sendTimer);
    if (!hasAlreadySent && !userStoppedMic && accumulatedTranscript.trim()) {
      var input = document.getElementById('chatInput');
      if (input) input.value = accumulatedTranscript.trim();
      if (autoSendEnabled) {
        sendChatMessage();
      } else {
        if (input) input.focus();
        setOrbState('idle');
      }
    }
    accumulatedTranscript = '';
    hasAlreadySent = false;
    userStoppedMic = false;
    if (micBtn) micBtn.classList.remove('listening');
    if (orbState === 'listening') setOrbState('idle');
  };

  rec.start();
}

// ── Wire up voice/orb event listeners (called from the main init block) ──
function initVoiceAndOrb() {
  // Voice toggle button
  var voiceToggle = document.getElementById('chatVoiceToggle');
  if (voiceToggle) voiceToggle.addEventListener('click', toggleVoice);

  // TTS source toggle: 'EL' (ElevenLabs via Puter.js) or '🗣' (Browser Web Speech only)
  var ttsModeBtn = document.getElementById('ttsModeBtn');
  if (ttsModeBtn) {
    ttsModeBtn.addEventListener('click', function() {
      ttsMode = ttsMode === 'elevenlabs' ? 'browser' : 'elevenlabs';
      ttsModeBtn.textContent = ttsMode === 'elevenlabs' ? 'EL' : '🗣';
      ttsModeBtn.title = ttsMode === 'elevenlabs' ? 'TTS source: ElevenLabs' : 'TTS source: Browser voice';
      if (currentPuterAudio) { try { currentPuterAudio.pause(); if (currentPuterAudio._objectUrl) URL.revokeObjectURL(currentPuterAudio._objectUrl); } catch(e){} currentPuterAudio = null; }
      window.speechSynthesis.cancel();
      ttsQueue.length = 0;
      if (ttsNextAudio && ttsNextAudio._objectUrl) URL.revokeObjectURL(ttsNextAudio._objectUrl);
      ttsNextText = null; ttsNextAudio = null; ttsNextFetch = null;
      ttsBusy = false;
    });
  }

  // Chat panel mic button — hide entirely on browsers without SpeechRecognition
  var chatMic = document.getElementById('chatMic');
  if (chatMic) {
    if (!('SpeechRecognition' in window) && !('webkitSpeechRecognition' in window)) {
      chatMic.style.display = 'none';
    } else {
      chatMic.addEventListener('click', startChatMicInput);
    }
  }

  // Auto-send toggle button
  var autoSendBtn = document.getElementById('autoSendBtn');
  if (autoSendBtn) {
    autoSendBtn.addEventListener('click', toggleAutoSend);
    // Sync initial visual state from persisted preference
    if (!autoSendEnabled) autoSendBtn.classList.remove('active');
  }

  // Sage pause button
  var pauseBtn = document.getElementById('sagePauseBtn');
  if (pauseBtn) pauseBtn.addEventListener('click', toggleTTSPause);

  // Resize canvas when window resizes while orb is open
  window.addEventListener('resize', function() {
    if (orbIsOpen) resizeOrbCanvas();
  });

  // Load best available TTS voice asynchronously
  loadSageVoice();
  if (window.speechSynthesis) {
    window.speechSynthesis.onvoiceschanged = loadSageVoice;
  }
}

function loadSageVoice() {
  if (!window.speechSynthesis) return;
  var voices = window.speechSynthesis.getVoices();
  if (!voices.length) return; // not ready yet; onvoiceschanged will re-fire
  var preferred = [
    'Microsoft Aria Online (Natural) - English (United States)',
    'Microsoft Jenny Online (Natural) - English (United States)',
    'Google US English Female',
    'Microsoft Zira - English (United States)'
  ];
  for (var i = 0; i < preferred.length; i++) {
    var v = voices.find(function(x) { return x.name === preferred[i]; });
    if (v) { sageVoice = v; break; }
  }
  if (!sageVoice) {
    sageVoice = voices.find(function(v) {
      return v.lang.startsWith('en') && v.name.toLowerCase().includes('female');
    }) || voices.find(function(v) { return v.lang.startsWith('en'); }) || null;
  }
}

// ── Auto-send toggle ──────────────────────────────────────────
function toggleAutoSend() {
  autoSendEnabled = !autoSendEnabled;
  localStorage.setItem('sf_voice_autosend', autoSendEnabled);
  var btn = document.getElementById('autoSendBtn');
  if (btn) {
    btn.title = autoSendEnabled ? 'Auto-send voice (ON)' : 'Auto-send voice (OFF)';
    btn.classList.toggle('active', autoSendEnabled);
  }
}

// ── Sage pause / resume ───────────────────────────────────────
function syncPauseButton(speaking) {
  var btn = document.getElementById('sagePauseBtn');
  if (!btn) return;
  btn.disabled = !speaking && !ttsPaused;
  btn.textContent = ttsPaused ? '▶' : '⏸';
  btn.title = ttsPaused ? 'Resume Sage' : 'Pause Sage';
}

function toggleTTSPause() {
  if (!ttsBusy && !ttsPaused) return;
  if (!ttsPaused) {
    ttsPaused = true;
    if (ttsMode === 'elevenlabs' && currentPuterAudio) {
      currentPuterAudio.pause(); // HTML Audio pause() preserves currentTime
    } else if (ttsMode === 'browser') {
      window.speechSynthesis.pause(); // NOTE: unreliable on Chrome Android — known browser bug
    }
    setOrbState('paused');
  } else {
    ttsPaused = false;
    if (ttsMode === 'elevenlabs') {
      if (currentPuterAudio) {
        currentPuterAudio.play(); // NOT .resume() — that method doesn't exist on Audio elements
      } else {
        processTTSQueue(); // paused between sentences — advance queue
      }
    } else if (ttsMode === 'browser') {
      window.speechSynthesis.resume();
    }
    setOrbState('speaking');
  }
  syncPauseButton(true);
}

// ============================================================
// SECTION 14: NEW UTILITY & FEATURE FUNCTIONS
// ============================================================

// saveUnsyncedIds: persists unsynced card IDs to localStorage
function saveUnsyncedIds() {
  localStorage.setItem(projectKey('unsynced_ids'), JSON.stringify(Array.from(unsyncedIds)));
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

  // Scroll so that point is in the middle of the visible viewport, accounting for zoom.
  var vpW = mapView.clientWidth;
  var vpH = mapView.clientHeight;

  var desiredScrollLeft = centerX * mapZoom - vpW / 2;
  var desiredScrollTop  = centerY * mapZoom - vpH / 2;

  // If the card cluster is smaller than the viewport (desired scroll is negative),
  // we can't center purely via scroll (scrollLeft can't go negative). Instead, apply
  // a CSS translate offset to mapInner so the cards appear centered despite scroll = 0.
  mapTranslateX = desiredScrollLeft < 0 ? Math.round(-desiredScrollLeft) : 0;
  mapTranslateY = desiredScrollTop  < 0 ? Math.round(-desiredScrollTop)  : 0;

  var mapInner = document.getElementById('mapInner');
  if (mapInner) {
    mapInner.style.transform = 'translate(' + mapTranslateX + 'px,' + mapTranslateY + 'px) scale(' + mapZoom + ')';
  }

  mapView.scrollLeft = Math.max(0, desiredScrollLeft);
  mapView.scrollTop  = Math.max(0, desiredScrollTop);
}

// ── 14a: MAP PANNING ─────────────────────────────────────────

// makeMapPannable: enables click+drag anywhere in the map viewport to pan.
// The listener lives on mapView (the scroll container) rather than mapInner so
// that panning works even when the cursor is in the empty space beyond mapInner's
// visual extent (which shrinks when zoomed out).
function makeMapPannable() {
  var mapView = document.getElementById('mapView');
  if (!mapView) return;

  // Remove previous listener before re-attaching (renderMap is called multiple times)
  if (mapView._panHandler) {
    mapView.removeEventListener('mousedown', mapView._panHandler);
  }

  mapView._panHandler = function(e) {
    // Only pan on left-button clicks that aren't on a card, button, or interactive element
    if (e.button !== 0) return;
    if (e.target.closest('.map-card')) return;
    if (connectingFrom) return;
    // Clicking empty canvas also clears card selection
    hideCombinePanel();

    var startScrollLeft = mapView.scrollLeft;
    var startScrollTop  = mapView.scrollTop;
    var startX = e.clientX;
    var startY = e.clientY;

    mapView.style.cursor = 'grabbing';
    e.preventDefault();

    function onMove(e) {
      mapView.scrollLeft = startScrollLeft - (e.clientX - startX);
      mapView.scrollTop  = startScrollTop  - (e.clientY - startY);
    }
    function onUp() {
      mapView.style.cursor = '';
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  mapView.addEventListener('mousedown', mapView._panHandler);
}

// ── 14b: AUTO-ORGANIZE MAP ───────────────────────────────────

// autoOrganizeMap: arranges all cards in columns by type, auto-connects within each column
// Column math: colX = START_X + colIndex * (CARD_W + COL_GAP)
//   e.g. character at 200, world at 530, arc at 860, quote at 1190, idea at 1520
function autoOrganizeMap() {
  var TYPE_ORDER = COLUMN_TYPES; // character → world → arc → quote → idea (5 physical columns)
  var CARD_W     = 210; // card width
  var COL_GAP    = 120; // gap between columns (total column stride = 330px)
  var START_X    = 200; // left offset — cards always within scroll range (no negatives)
  var START_Y    = 200; // top offset — gives breathing room above the first card
  var ROW_GAP    = 200; // vertical gap between cards in a column

  // Remove old auto-connections (manually created connections are preserved)
  connections = connections.filter(function(c) { return !c.auto; });

  TYPE_ORDER.forEach(function(colType, colIndex) {
    var colCards = cards
      .filter(function(c) { return (TYPE_TO_COLUMN[c.type] || c.type) === colType; })
      .sort(function(a, b) { return new Date(a.createdAt) - new Date(b.createdAt); });
    var type = colType;

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
// SECTION 15: WRITING TAB
// ─────────────────────────────────────────────────────────────
// What it does: A split-pane writing workspace. The left pane
// is the official "Working Copy", the right pane is a "Draft"
// for AI-generated content and exploration. Both auto-save.
//
// AI actions: Generate Draft, Continue Writing, Improve This,
//             Check Story Consistency
//
// localStorage keys:
//   sf_writing_copy  — working copy content
//   sf_writing_draft — draft content
// ============================================================

var writingDraftVisible = false;

function countWords(text) {
  var trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

function updateWritingWordCounts() {
  var copyEl  = document.getElementById('writingCopyEditor');
  var draftEl = document.getElementById('writingDraftEditor');
  var copyWcEl  = document.getElementById('copyWc');
  var draftWcEl = document.getElementById('draftWc');
  if (copyEl && copyWcEl)   copyWcEl.textContent  = countWords(copyEl.textContent)  + ' words';
  if (draftEl && draftWcEl) draftWcEl.textContent = countWords(draftEl.textContent) + ' words';

  var goal = parseInt(localStorage.getItem(projectKey('word_goal')) || '0', 10);
  var goalDisplay = document.getElementById('wordGoalDisplay');
  var barWrap = document.getElementById('wordGoalBarWrap');
  var bar = document.getElementById('wordGoalBar');
  if (goal > 0 && copyEl && goalDisplay && barWrap && bar) {
    var count = countWords(copyEl.textContent);
    var pct = Math.min(100, Math.round(count / goal * 100));
    goalDisplay.textContent = count + ' / ' + goal + ' words';
    goalDisplay.classList.remove('hidden');
    barWrap.classList.remove('hidden');
    bar.style.width = pct + '%';
  } else if (goalDisplay && barWrap) {
    goalDisplay.classList.add('hidden');
    barWrap.classList.add('hidden');
  }
}

function toggleWritingDraft() {
  writingDraftVisible = !writingDraftVisible;
  var draftPane    = document.getElementById('writingDraftPane');
  var resizeHandle = document.getElementById('writingResizeHandle');
  var toggleBtn    = document.getElementById('draftToggleBtn');
  if (writingDraftVisible) {
    draftPane.classList.remove('hidden');
    if (resizeHandle) resizeHandle.classList.remove('hidden');
    toggleBtn.textContent = 'Hide Draft ◀';
    toggleBtn.classList.add('active');
    applyWritingSplitRatio();
  } else {
    draftPane.classList.add('hidden');
    if (resizeHandle) resizeHandle.classList.add('hidden');
    toggleBtn.textContent = 'Show Draft ▶';
    toggleBtn.classList.remove('active');
    // Remove fixed flex-basis so copy pane expands fully
    var copyPane = document.getElementById('writingCopyPane');
    if (copyPane) copyPane.style.flexBasis = '';
  }
}

function applyWritingSplitRatio() {
  var ratio = parseFloat(localStorage.getItem(projectKey('writing_split_ratio')) || '0.62');
  var copyPane  = document.getElementById('writingCopyPane');
  var draftPane = document.getElementById('writingDraftPane');
  if (copyPane)  copyPane.style.flexBasis  = (ratio * 100) + '%';
  if (draftPane) draftPane.style.flexBasis = ((1 - ratio) * 100) + '%';
}

// Auto-save writing content on every input
(function() {
  var copyEditor  = document.getElementById('writingCopyEditor'); // contenteditable div
  var draftEditor = document.getElementById('writingDraftEditor'); // contenteditable div

  // Load saved content — both editors store HTML
  copyEditor.innerHTML  = localStorage.getItem(projectKey('writing_copy'))  || '';
  draftEditor.innerHTML = localStorage.getItem(projectKey('writing_draft')) || '';

  // E1: Word goal — restore persisted goal value
  var goalInput = document.getElementById('wordGoalInput');
  if (goalInput) {
    var savedGoal = localStorage.getItem(projectKey('word_goal'));
    if (savedGoal) goalInput.value = savedGoal;
    goalInput.addEventListener('change', function() {
      var v = parseInt(goalInput.value, 10);
      if (v > 0) {
        localStorage.setItem(projectKey('word_goal'), String(v));
      } else {
        localStorage.removeItem(projectKey('word_goal'));
        goalInput.value = '';
      }
      updateWritingWordCounts();
    });
  }

  updateWritingWordCounts();

  // Draft history: push a snapshot after 3 minutes of inactivity in the copy editor
  var historySnapshotTimer = null;
  function pushDraftSnapshot() {
    var content = copyEditor.innerHTML;
    if (!content || !copyEditor.textContent.trim()) return;
    var history = [];
    try { history = JSON.parse(localStorage.getItem(projectKey('draft_history')) || '[]'); } catch(e) {}
    // Skip if identical to the last snapshot
    if (history.length > 0 && history[history.length - 1].content === content) return;
    history.push({ savedAt: new Date().toISOString(), content: content });
    if (history.length > 10) history = history.slice(history.length - 10);
    localStorage.setItem(projectKey('draft_history'), JSON.stringify(history));
  }

  // Auto-save on input — store innerHTML (preserves formatting)
  copyEditor.addEventListener('input', function() {
    localStorage.setItem(projectKey('writing_copy'), copyEditor.innerHTML);
    updateWritingWordCounts();
    renderHomePage(); // keep word count on home page in sync
    // Schedule a history snapshot after 3 min of inactivity
    clearTimeout(historySnapshotTimer);
    historySnapshotTimer = setTimeout(pushDraftSnapshot, 3 * 60 * 1000);
  });
  draftEditor.addEventListener('input', function() {
    localStorage.setItem(projectKey('writing_draft'), draftEditor.innerHTML);
    updateWritingWordCounts();
  });

  // ── Formatting toolbar wiring ──────────────────────────────
  // mousedown (not click) prevents editor from losing focus before execCommand
  document.querySelectorAll('.fmt-btn').forEach(function(btn) {
    btn.addEventListener('mousedown', function(e) {
      e.preventDefault(); // keep focus in editor
      var cmd = btn.getAttribute('data-cmd');
      var val = btn.getAttribute('data-val') || null;
      document.execCommand(cmd, false, val);
      // Re-focus whichever editor was last active
      var active = document.activeElement;
      if (active !== copyEditor && active !== draftEditor) copyEditor.focus();
    });
  });

  // Font size selector
  var fontSizeSelect = document.getElementById('fontSizeSelect');
  if (fontSizeSelect) {
    fontSizeSelect.addEventListener('change', function() {
      var val = fontSizeSelect.value;
      if (val) {
        copyEditor.focus();
        document.execCommand('fontSize', false, val);
      }
      fontSizeSelect.value = '';
    });
  }

  // Draft toggle button
  document.getElementById('draftToggleBtn').addEventListener('click', toggleWritingDraft);

  // ── Draft History panel (5c) ───────────────────────────────
  function renderDraftHistoryPanel() {
    var panel = document.getElementById('draftHistoryPanel');
    var listEl = document.getElementById('draftHistoryList');
    if (!panel || !listEl) return;
    var history = [];
    try { history = JSON.parse(localStorage.getItem(projectKey('draft_history')) || '[]'); } catch(e) {}
    if (history.length === 0) {
      listEl.innerHTML = '<div class="draft-history-empty">No snapshots yet. Snapshots are saved automatically after a pause in typing.</div>';
      return;
    }
    listEl.innerHTML = '';
    // Show newest first
    for (var i = history.length - 1; i >= 0; i--) {
      (function(entry) {
        var item = document.createElement('div');
        item.className = 'draft-history-item';
        var d = new Date(entry.savedAt);
        var label = d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        var words = (entry.content.replace(/<[^>]+>/g, ' ').match(/\S+/g) || []).length;
        item.innerHTML =
          '<div class="draft-history-meta">' +
            '<span class="draft-history-date">' + label + '</span>' +
            '<span class="draft-history-words">' + words + ' words</span>' +
          '</div>' +
          '<div class="draft-history-preview">' + escapeHtml(entry.content.replace(/<[^>]+>/g, ' ').slice(0, 80)) + '…</div>' +
          '<button class="draft-history-restore-btn">Restore</button>';
        item.querySelector('.draft-history-restore-btn').addEventListener('click', function() {
          if (confirm('Restore this snapshot? Your current working copy will be replaced.')) {
            copyEditor.innerHTML = entry.content;
            localStorage.setItem(projectKey('writing_copy'), entry.content);
            updateWritingWordCounts();
            renderHomePage();
            document.getElementById('draftHistoryPanel').classList.add('hidden');
            showToast('⏱ Snapshot restored');
          }
        });
        listEl.appendChild(item);
      })(history[i]);
    }
  }

  document.getElementById('historyBtn').addEventListener('click', function() {
    var panel = document.getElementById('draftHistoryPanel');
    panel.classList.toggle('hidden');
    if (!panel.classList.contains('hidden')) renderDraftHistoryPanel();
  });
  document.getElementById('draftHistoryClose').addEventListener('click', function() {
    document.getElementById('draftHistoryPanel').classList.add('hidden');
  });

  // Promote draft → working copy
  document.getElementById('promoteBtn').addEventListener('click', function() {
    var draft = draftEditor.innerHTML;
    if (!draftEditor.textContent.trim()) return;
    if (confirm('Replace Working Copy with Draft content?')) {
      copyEditor.innerHTML = draft;
      localStorage.setItem(projectKey('writing_copy'), copyEditor.innerHTML);
      updateWritingWordCounts();
    }
  });

  // ── Resize handle ──────────────────────────────────────────
  var resizeHandle = document.getElementById('writingResizeHandle');
  var writingPanes = document.getElementById('writingPanes');
  if (resizeHandle && writingPanes) {
    resizeHandle.addEventListener('mousedown', function(e) {
      e.preventDefault();
      resizeHandle.classList.add('dragging');
      var startX     = e.clientX;
      var totalW     = writingPanes.offsetWidth;
      var copyPane   = document.getElementById('writingCopyPane');
      var draftPane  = document.getElementById('writingDraftPane');
      var startRatio = parseFloat(localStorage.getItem(projectKey('writing_split_ratio')) || '0.62');
      var startCopyW = totalW * startRatio;

      function onMove(e) {
        var newCopyW = startCopyW + (e.clientX - startX);
        var ratio    = Math.min(0.85, Math.max(0.15, newCopyW / totalW));
        if (copyPane)  copyPane.style.flexBasis  = (ratio * 100) + '%';
        if (draftPane) draftPane.style.flexBasis = ((1 - ratio) * 100) + '%';
        localStorage.setItem(projectKey('writing_split_ratio'), String(ratio));
      }
      function onUp() {
        resizeHandle.classList.remove('dragging');
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup',   onUp);
      }
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup',   onUp);
    });
  }

  // Close AI result panel
  document.getElementById('closeAiResult').addEventListener('click', function() {
    document.getElementById('writingAiResult').classList.add('hidden');
  });

  // AI dropdown toggle
  var aiBtn      = document.getElementById('writingAiBtn');
  var aiDropdown = document.getElementById('writingAiDropdown');
  aiBtn.addEventListener('click', function(e) {
    e.stopPropagation();
    aiDropdown.classList.toggle('hidden');
  });
  document.addEventListener('click', function() {
    aiDropdown.classList.add('hidden');
  });

  // AI action buttons
  aiDropdown.addEventListener('click', function(e) {
    var btn = e.target.closest('[data-action]');
    if (!btn) return;
    aiDropdown.classList.add('hidden');
    handleWritingAiAction(btn.getAttribute('data-action'));
  });
})();

async function handleWritingAiAction(action) {
  var key = apiKey || localStorage.getItem('sf_api_key') || '';
  if (!key) { showToast('⚠️ Set your API key first.'); return; }

  // copyEditor is now a contenteditable div — use textContent for plain text sent to AI
  var copyContent  = (document.getElementById('writingCopyEditor').textContent || '').trim();
  var draftEditor  = document.getElementById('writingDraftEditor');
  var aiResultEl   = document.getElementById('writingAiResult');
  var aiResultBody = document.getElementById('writingAiResultBody');
  var aiBtn        = document.getElementById('writingAiBtn');

  // Ensure draft pane is visible for actions that write to it
  var writesToDraft = ['generate', 'continue', 'improve'];
  if (writesToDraft.includes(action) && !writingDraftVisible) toggleWritingDraft();

  aiBtn.textContent = '⏳';
  aiBtn.disabled = true;

  var storyCtx = buildStoryContext();
  var prompt;

  if (action === 'generate') {
    prompt = 'You are a creative writer working on a ' + currentProjectFormat + '. Using the notes below, write a compelling opening for "' + currentProjectName + '" — approximately 600–1000 words. Stay faithful to the established characters, world, and tone. Write in a vivid, immersive style.\n\n' + storyCtx;
  } else if (action === 'continue') {
    if (!copyContent) { showToast('Add some text to your Working Copy first.'); aiBtn.textContent = 'AI ▾'; aiBtn.disabled = false; return; }
    prompt = 'Continue the story from where this passage ends. Write approximately 300 more words in the same style and voice. Keep it consistent with the story notes.\n\nStory notes:\n' + storyCtx + '\n\nPassage so far:\n' + copyContent.slice(-1500);
  } else if (action === 'improve') {
    if (!copyContent) { showToast('Add some text to your Working Copy first.'); aiBtn.textContent = 'AI ▾'; aiBtn.disabled = false; return; }
    prompt = 'Rewrite the following passage to improve its pacing, clarity, and prose quality. Preserve all plot points, character moments, and key details. Return only the rewritten text, no commentary.\n\n' + copyContent.slice(-2000);
  } else if (action === 'consistency') {
    if (!copyContent) { showToast('Add some text to your Working Copy first.'); aiBtn.textContent = 'AI ▾'; aiBtn.disabled = false; return; }
    prompt = 'Review this story passage against the story notes and identify any contradictions, inconsistencies, or details that conflict with established canon. List each issue clearly.\n\nStory notes:\n' + storyCtx + '\n\nPassage:\n' + copyContent.slice(-2000);
  }

  try {
    var response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: 1500,
        messages: [{ role: 'user', content: prompt }]
      })
    });
    var data = await response.json();
    var result = (data.content?.[0]?.text || '').trim();

    if (writesToDraft.includes(action)) {
      // Set as plain text (preserving line breaks) into the rich editor div
      draftEditor.textContent = result;
      localStorage.setItem(projectKey('writing_draft'), draftEditor.innerHTML);
      updateWritingWordCounts();
      showToast('Draft updated!');
    } else {
      // Consistency check → show in result panel
      aiResultBody.textContent = result;
      aiResultEl.classList.remove('hidden');
    }
  } catch(err) {
    showToast('❌ ' + err.message);
  }

  aiBtn.textContent = 'AI ▾';
  aiBtn.disabled = false;
}


// ============================================================
// SECTION 16: CHARACTERS TAB
// ─────────────────────────────────────────────────────────────
// What it does: Displays character cards from the canvas as a
// profile sheet with Enneagram type, role, goal, fear, arc.
// AI can generate a profile from the card's story context.
//
// localStorage key:
//   sf_character_profiles — { [cardId]: { role, enneagram, goal, fear, arc, notes } }
// ============================================================

var characterProfiles = {};
var selectedCharacterId = null;

try {
  characterProfiles = JSON.parse(localStorage.getItem(projectKey('character_profiles')) || '{}');
} catch(e) { characterProfiles = {}; }

function saveCharacterProfiles() {
  localStorage.setItem(projectKey('character_profiles'), JSON.stringify(characterProfiles));
}

// groupCharactersByName: groups character cards that share the same root name.
// "Bon", "Bon - Child", "Young Bon" all map to root "bon".
// Returns an array of groups: [{ rootName, cards[] }] sorted by group size desc.
function groupCharactersByName(characterCards) {
  // Extract the shortest meaningful token from a title
  function rootName(title) {
    return title.toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')   // strip punctuation
      .trim()
      .split(/\s+/)
      .filter(function(w) { return w.length > 1; }) // skip single letters
      [0] || title.toLowerCase();     // fallback: first word
  }

  var groups = {}; // rootName → card[]
  characterCards.forEach(function(card) {
    var root = rootName(card.title);
    if (!groups[root]) groups[root] = [];
    groups[root].push(card);
  });

  // Convert to array; single-card groups stay as groups for uniform rendering
  return Object.keys(groups).map(function(root) {
    return { rootName: root, cards: groups[root] };
  }).sort(function(a, b) {
    // Groups with more cards first, then alphabetical
    if (b.cards.length !== a.cards.length) return b.cards.length - a.cards.length;
    return a.rootName.localeCompare(b.rootName);
  });
}

function renderCharacterSidebar() {
  var characterCards = cards.filter(function(c) { return c.type === 'character' && c.status !== 'archived'; });
  var listEl = document.getElementById('charList');
  var countEl = document.getElementById('charCount');
  if (!listEl) return;

  countEl.textContent = characterCards.length;
  listEl.innerHTML = '';

  if (characterCards.length === 0) {
    listEl.innerHTML = '<div style="padding:12px 14px;font-size:12px;color:var(--text-light)">No character cards yet.</div>';
    return;
  }

  var groups = groupCharactersByName(characterCards);

  // Auto-select first character if nothing is selected yet
  if (!selectedCharacterId && characterCards.length > 0) {
    selectedCharacterId = characterCards[0].id;
    // Defer rendering profile until after sidebar is built
    setTimeout(function() { renderCharacterProfile(selectedCharacterId); }, 0);
  }

  groups.forEach(function(group) {
    if (group.cards.length === 1) {
      // Single card — render as before
      var card = group.cards[0];
      var item = document.createElement('div');
      item.className = 'char-list-item' + (card.id === selectedCharacterId ? ' active' : '');
      item.innerHTML = '<span class="char-list-dot"></span>' + escapeHtml(card.title);
      item.addEventListener('click', function() { selectCharacter(card.id); });
      listEl.appendChild(item);
    } else {
      // Multi-card group — render a header + nested items
      var groupHeader = document.createElement('div');
      groupHeader.className = 'char-group-header';
      // Capitalize root name for display
      var displayName = group.rootName.charAt(0).toUpperCase() + group.rootName.slice(1);
      var anyActive = group.cards.some(function(c) { return c.id === selectedCharacterId; });
      groupHeader.innerHTML =
        '<span class="char-list-dot"></span>' +
        '<span class="char-group-name">' + escapeHtml(displayName) + '</span>' +
        '<span class="char-group-badge">' + group.cards.length + '</span>';
      if (anyActive) groupHeader.classList.add('active');
      listEl.appendChild(groupHeader);

      // Nested cards under the group
      group.cards.forEach(function(card) {
        var item = document.createElement('div');
        item.className = 'char-list-item char-list-item-nested' + (card.id === selectedCharacterId ? ' active' : '');
        item.innerHTML = '<span class="char-list-dot" style="width:5px;height:5px;margin-left:14px"></span>' + escapeHtml(card.title);
        item.addEventListener('click', function() { selectCharacter(card.id); });
        listEl.appendChild(item);
      });
    }
  });
}

function selectCharacter(cardId) {
  selectedCharacterId = cardId;
  renderCharacterSidebar();
  renderCharacterProfile(cardId);
}

function renderCharacterProfile(cardId) {
  var card = cards.find(function(c) { return c.id === cardId; });
  var emptyState = document.getElementById('charEmptyState');
  var profileEl  = document.getElementById('charProfile');
  if (!card) { emptyState.classList.remove('hidden'); profileEl.classList.add('hidden'); return; }

  emptyState.classList.add('hidden');
  profileEl.classList.remove('hidden');

  var profile = characterProfiles[cardId] || {};

  profileEl.innerHTML =
    '<div class="char-profile-header">' +
      '<div>' +
        '<div class="char-profile-name">' + escapeHtml(card.title) + '</div>' +
        '<div class="char-profile-summary">' + escapeHtml(card.content || '') + '</div>' +
      '</div>' +
      '<button class="btn-gen-profile" id="genProfileBtn">✦ Generate Profile</button>' +
    '</div>' +

    '<div class="char-section-title">Role & Identity</div>' +

    '<div class="char-field-group">' +
      '<label class="char-field-label">Role in Story</label>' +
      '<select class="char-field-select" data-field="role">' +
        '<option value="">— select —</option>' +
        ['Protagonist','Antagonist','Supporting','Mentor','Unknown'].map(function(r) {
          return '<option value="' + r + '"' + (profile.role === r ? ' selected' : '') + '>' + r + '</option>';
        }).join('') +
      '</select>' +
    '</div>' +

    '<div class="char-field-group">' +
      '<label class="char-field-label">Enneagram Type</label>' +
      '<select class="char-field-select" data-field="enneagram" id="enneagramSelect">' +
        '<option value="">— select —</option>' +
        ENNEAGRAM_TYPES.map(function(t) {
          return '<option value="' + t.id + '"' + (String(profile.enneagram) === String(t.id) ? ' selected' : '') + '>' + t.id + ' · ' + t.name + '</option>';
        }).join('') +
      '</select>' +
      '<div class="enneagram-info hidden" id="enneagramInfo"></div>' +
    '</div>' +

    '<div class="char-section-title">Psychology</div>' +

    '<div class="char-field-group">' +
      '<label class="char-field-label">Core Goal</label>' +
      '<textarea class="char-field-textarea" data-field="goal" rows="2">' + escapeHtml(profile.goal || '') + '</textarea>' +
    '</div>' +
    '<div class="char-field-group">' +
      '<label class="char-field-label">Core Fear</label>' +
      '<textarea class="char-field-textarea" data-field="fear" rows="2">' + escapeHtml(profile.fear || '') + '</textarea>' +
    '</div>' +
    '<div class="char-field-group">' +
      '<label class="char-field-label">Character Arc</label>' +
      '<textarea class="char-field-textarea" data-field="arc" rows="3">' + escapeHtml(profile.arc || '') + '</textarea>' +
    '</div>' +
    '<div class="char-field-group">' +
      '<label class="char-field-label">Notes</label>' +
      '<textarea class="char-field-textarea" data-field="notes" rows="3">' + escapeHtml(profile.notes || '') + '</textarea>' +
    '</div>';

  // Related cards section — show sibling cards that share the same root name
  var allCharCards = cards.filter(function(c) { return c.type === 'character' && c.status !== 'archived'; });
  var groups = groupCharactersByName(allCharCards);
  var myGroup = groups.find(function(g) { return g.cards.some(function(c) { return c.id === cardId; }); });
  var siblings = myGroup ? myGroup.cards.filter(function(c) { return c.id !== cardId; }) : [];

  if (siblings.length > 0) {
    profileEl.innerHTML +=
      '<div class="char-section-title">Related Cards (' + siblings.length + ')</div>' +
      '<div class="char-related-cards">' +
      siblings.map(function(sib) {
        return '<div class="char-related-card" data-id="' + sib.id + '">' +
          '<div class="char-related-title">' + escapeHtml(sib.title) + '</div>' +
          '<div class="char-related-content">' + escapeHtml(sib.content || '') + '</div>' +
        '</div>';
      }).join('') +
      '</div>';

    // Clicking a related card opens it
    profileEl.querySelectorAll('.char-related-card').forEach(function(el) {
      el.addEventListener('click', function() { selectCharacter(el.getAttribute('data-id')); });
    });
  }

  // Connections: other cards that mention this character's name
  var firstName = card.title.split(/[\s\-–]/)[0].toLowerCase();
  if (firstName.length > 2) {
    var mentioned = cards.filter(function(c) {
      if (c.id === cardId || c.status === 'archived') return false;
      return (c.title + ' ' + (c.content || '')).toLowerCase().indexOf(firstName) !== -1;
    });
    if (mentioned.length > 0) {
      profileEl.innerHTML +=
        '<div class="char-section-title">Mentioned In (' + mentioned.length + ')</div>' +
        '<div class="char-connections">' +
        mentioned.slice(0, 12).map(function(c) {
          return '<span class="char-connection-chip char-connection-' + c.type + '" data-id="' + c.id + '">' + escapeHtml(c.title) + '</span>';
        }).join('') +
        '</div>';
    }
  }

  // Show enneagram info if type already selected
  if (profile.enneagram) showEnneagramInfo(profile.enneagram);

  // Save on change for all fields
  profileEl.querySelectorAll('[data-field]').forEach(function(el) {
    el.addEventListener('change', function() { saveProfileField(cardId, el.getAttribute('data-field'), el.value); });
    if (el.tagName === 'TEXTAREA') el.addEventListener('input', function() { saveProfileField(cardId, el.getAttribute('data-field'), el.value); });
  });

  // Enneagram info card
  document.getElementById('enneagramSelect').addEventListener('change', function() {
    saveProfileField(cardId, 'enneagram', this.value);
    showEnneagramInfo(this.value);
  });

  // Generate profile button
  document.getElementById('genProfileBtn').addEventListener('click', function() {
    generateCharacterProfile(cardId);
  });
}

function saveProfileField(cardId, field, value) {
  if (!characterProfiles[cardId]) characterProfiles[cardId] = {};
  characterProfiles[cardId][field] = value;
  saveCharacterProfiles();
  // Re-render board cards so role chip stays in sync when role changes
  if (field === 'role') renderCards();
}

function showEnneagramInfo(typeId) {
  var infoEl = document.getElementById('enneagramInfo');
  if (!infoEl) return;
  var type = ENNEAGRAM_TYPES.find(function(t) { return String(t.id) === String(typeId); });
  if (!type) { infoEl.classList.add('hidden'); return; }

  infoEl.classList.remove('hidden');
  infoEl.innerHTML =
    '<div class="enneagram-info-name">' + type.id + ' · ' + type.name + '</div>' +
    '<div class="enneagram-info-row"><span class="enneagram-info-row-label">Core Desire:</span><span class="enneagram-info-row-val">' + escapeHtml(type.coreDesire) + '</span></div>' +
    '<div class="enneagram-info-row"><span class="enneagram-info-row-label">Core Fear:</span><span class="enneagram-info-row-val">' + escapeHtml(type.coreFear) + '</span></div>' +
    '<div class="enneagram-traits">' +
      type.keyTraits.map(function(t) { return '<span class="enneagram-trait">' + escapeHtml(t) + '</span>'; }).join('') +
    '</div>';
}

async function generateCharacterProfile(cardId) {
  var key = apiKey || localStorage.getItem('sf_api_key') || '';
  if (!key) { showToast('⚠️ Set your API key first.'); return; }

  var card = cards.find(function(c) { return c.id === cardId; });
  if (!card) return;

  var btn = document.getElementById('genProfileBtn');
  btn.textContent = '⏳ Generating…';
  btn.disabled = true;

  var existing = characterProfiles[cardId] || {};
  var storyCtx = buildStoryContext();

  var prompt =
    'Based on this character and story context, suggest values for any EMPTY fields below. ' +
    'Return ONLY a valid JSON object with keys: "role", "enneagram" (number 1–9), "goal", "fear", "arc". ' +
    'Only include keys for fields that are currently empty (do not overwrite existing content). ' +
    'Empty fields: ' + Object.keys({role:1,enneagram:1,goal:1,fear:1,arc:1}).filter(function(k) { return !existing[k]; }).join(', ') + '\n\n' +
    'Character: ' + card.title + '\n' + card.content + '\n\n' +
    'Story context:\n' + storyCtx;

  try {
    var response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({ model: CLAUDE_MODEL, max_tokens: 400, messages: [{ role: 'user', content: prompt }] })
    });
    var data = await response.json();
    var raw = (data.content?.[0]?.text || '').trim();
    raw = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();
    var suggestions = JSON.parse(raw);

    if (!characterProfiles[cardId]) characterProfiles[cardId] = {};
    Object.keys(suggestions).forEach(function(k) {
      if (!characterProfiles[cardId][k]) {
        characterProfiles[cardId][k] = suggestions[k];
      }
    });
    saveCharacterProfiles();
    renderCharacterProfile(cardId);
    showToast('Profile generated!');
  } catch(err) {
    showToast('❌ ' + err.message);
  }
}

// Hook into tab switching to render the character sidebar when Characters tab opens
(function() {
  var tabBtns = document.querySelectorAll('.tab-btn');
  tabBtns.forEach(function(btn) {
    btn.addEventListener('click', function() {
      var tab = btn.getAttribute('data-tab');
      if (tab === 'characters') {
        renderCharacterSidebar();
        if (selectedCharacterId) renderCharacterProfile(selectedCharacterId);
      }
      if (tab === 'arcs') {
        renderArcsTab();
      }
    });
  });
})();


// ============================================================
// BOARD SELECTION MODE
// ─────────────────────────────────────────────────────────────
(function() {
  var boardView     = document.getElementById('boardView');
  var toggleBtn     = document.getElementById('boardSelectToggle');
  var actionsBar    = document.getElementById('boardSelectActions');
  var countEl       = document.getElementById('boardSelectCount');
  var cancelBtn     = document.getElementById('boardSelectCancel');
  var archiveBtn    = document.getElementById('boardBatchArchive');
  var mergeBtn      = document.getElementById('boardBatchMerge');
  var deleteBtn     = document.getElementById('boardBatchDelete');

  var selectionMode = false;
  var selectedIds   = new Set();

  function enterSelectionMode() {
    selectionMode = true;
    selectedIds.clear();
    boardView.classList.add('selection-mode');
    toggleBtn.classList.add('active');
    actionsBar.classList.remove('hidden');
    updateCount();
  }

  function exitSelectionMode() {
    selectionMode = false;
    selectedIds.clear();
    boardView.classList.remove('selection-mode');
    toggleBtn.classList.remove('active');
    actionsBar.classList.add('hidden');
    // Uncheck all checkboxes
    document.querySelectorAll('.card-checkbox').forEach(function(cb) { cb.checked = false; });
  }

  function updateCount() {
    var n = selectedIds.size;
    countEl.textContent = n + ' selected';
    archiveBtn.disabled = n === 0;
    mergeBtn.disabled   = n < 2;
    deleteBtn.disabled  = n === 0;
  }

  toggleBtn.addEventListener('click', function() {
    if (selectionMode) exitSelectionMode();
    else enterSelectionMode();
  });

  cancelBtn.addEventListener('click', exitSelectionMode);

  // Handle checkbox clicks (delegated — works after each renderCards)
  document.addEventListener('change', function(e) {
    if (!e.target.classList.contains('card-checkbox')) return;
    var id = e.target.getAttribute('data-id');
    if (e.target.checked) selectedIds.add(id);
    else selectedIds.delete(id);
    // Update card highlight
    var card = e.target.closest('.story-card');
    if (card) card.classList.toggle('card-selected-board', e.target.checked);
    updateCount();
  });

  // Batch Archive
  archiveBtn.addEventListener('click', function() {
    if (selectedIds.size === 0) return;
    var n = selectedIds.size;
    selectedIds.forEach(function(id) {
      var card = cards.find(function(c) { return c.id === id; });
      if (card) card.status = 'archived';
    });
    saveCards();
    renderCards();
    exitSelectionMode();
    showToast(n + ' card(s) archived.');
  });

  // Batch Delete
  deleteBtn.addEventListener('click', function() {
    if (selectedIds.size === 0) return;
    var n = selectedIds.size;
    if (!confirm('Delete ' + n + ' card(s)? This cannot be undone.')) return;
    var idsToDelete = Array.from(selectedIds);
    cards = cards.filter(function(c) { return idsToDelete.indexOf(c.id) === -1; });
    saveCards();
    renderCards();
    exitSelectionMode();
    showToast(n + ' card(s) deleted.');
  });

  // Batch Merge: combine selected cards into the first one, archive the rest
  mergeBtn.addEventListener('click', function() {
    if (selectedIds.size < 2) return;
    var idsArr = Array.from(selectedIds);
    var primary = cards.find(function(c) { return c.id === idsArr[0]; });
    if (!primary) return;
    var others = idsArr.slice(1).map(function(id) { return cards.find(function(c) { return c.id === id; }); }).filter(Boolean);
    // Merge: append other cards' titles+content to primary content
    var merged = primary.content + '\n\n' +
      others.map(function(c) { return '--- ' + c.title + ' ---\n' + c.content; }).join('\n\n');
    primary.content = merged.trim();
    // Archive the rest
    others.forEach(function(c) { c.status = 'archived'; });
    saveCards();
    renderCards();
    exitSelectionMode();
    showToast('Merged ' + idsArr.length + ' cards into "' + primary.title + '".');
  });

  // Escape key exits selection mode
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && selectionMode) exitSelectionMode();
  });
})();

// ============================================================
// SECTION 17: ARCS & TIMELINE TAB
// ─────────────────────────────────────────────────────────────
// What it does: Shows arc cards as a horizontal timeline strip.
// Offers a 36 Dramatic Situations grid and 8-Sequence structure
// as brainstorming tools. AI "Generate 3 Ideas" button suggests
// next story directions based on current arcs + story context.
//
// localStorage key:
//   sf_arc_sequence_map — { [sequenceNumber]: [arcCardId, ...] }
// ============================================================

var arcSequenceMap = {};
var selectedSituationId = null;

// User-defined arc order for the timeline strip (array of arc card IDs)
var arcOrder = [];
try { arcOrder = JSON.parse(localStorage.getItem(projectKey('arc_order')) || '[]'); } catch(e) { arcOrder = []; }
function saveArcOrder() { localStorage.setItem(projectKey('arc_order'), JSON.stringify(arcOrder)); }

// User-defined situation display order (array of situation IDs 1–36)
var situationOrder = [];
try { situationOrder = JSON.parse(localStorage.getItem(projectKey('situation_order')) || '[]'); } catch(e) { situationOrder = []; }
function saveSituationOrder() { localStorage.setItem(projectKey('situation_order'), JSON.stringify(situationOrder)); }

try {
  arcSequenceMap = JSON.parse(localStorage.getItem(projectKey('arc_sequence_map')) || '{}');
} catch(e) { arcSequenceMap = {}; }

function saveArcSequenceMap() {
  localStorage.setItem(projectKey('arc_sequence_map'), JSON.stringify(arcSequenceMap));
}

var brainstormControlsInitialized = false;
function renderArcsTab() {
  renderArcsTimeline();
  renderDramaticSituations();
  renderEightSequences();
  if (!brainstormControlsInitialized) {
    initBrainstormControls();
    brainstormControlsInitialized = true;
  }
}

function initBrainstormControls() {
  var section = document.getElementById('brainstormSection');
  var collapseBtn = document.getElementById('brainstormCollapseBtn');
  var resizeHandle = document.getElementById('brainstormResizeHandle');

  // Timeline resize handle
  var timelineSection = document.getElementById('arcsTimelineSection');
  var timelineResizeHandle = document.getElementById('arcsTimelineResizeHandle');
  var savedTimelineH = localStorage.getItem(projectKey('arcs_timeline_h'));
  if (savedTimelineH && timelineSection) {
    timelineSection.style.height = savedTimelineH + 'px';
  }
  if (timelineResizeHandle && timelineSection) {
    var tlStartY, tlStartH;
    timelineResizeHandle.addEventListener('mousedown', function(e) {
      e.preventDefault();
      tlStartY = e.clientY;
      tlStartH = timelineSection.offsetHeight;
      timelineResizeHandle.classList.add('resizing');
      function onMove(e) {
        var newH = Math.max(80, Math.min(600, tlStartH + (e.clientY - tlStartY)));
        timelineSection.style.height = newH + 'px';
      }
      function onUp() {
        timelineResizeHandle.classList.remove('resizing');
        localStorage.setItem(projectKey('arcs_timeline_h'), timelineSection.offsetHeight);
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      }
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  }

  // Restore collapsed state from localStorage
  if (localStorage.getItem(projectKey('brainstorm_collapsed')) === '1' && section) {
    section.classList.add('collapsed');
    if (collapseBtn) collapseBtn.textContent = '▶';
  }

  // Restore saved height
  var savedH = localStorage.getItem(projectKey('brainstorm_height'));
  if (savedH && section && !section.classList.contains('collapsed')) {
    section.style.height = savedH + 'px';
    section.style.flex = 'none';
  }

  if (collapseBtn && section) {
    collapseBtn.addEventListener('click', function() {
      var isCollapsed = section.classList.toggle('collapsed');
      collapseBtn.textContent = isCollapsed ? '▶' : '▼';
      localStorage.setItem(projectKey('brainstorm_collapsed'), isCollapsed ? '1' : '0');
      if (!isCollapsed) {
        var savedH = localStorage.getItem(projectKey('brainstorm_height'));
        if (savedH) { section.style.height = savedH + 'px'; section.style.flex = 'none'; }
        else { section.style.height = ''; section.style.flex = ''; }
      }
    });
  }

  if (resizeHandle && section) {
    var startY, startH;
    resizeHandle.addEventListener('mousedown', function(e) {
      e.preventDefault();
      startY = e.clientY;
      startH = section.offsetHeight;
      resizeHandle.classList.add('resizing');
      function onMove(e) {
        var newH = Math.max(80, startH + (e.clientY - startY));
        section.style.height = newH + 'px';
        section.style.flex = 'none';
        section.classList.remove('collapsed');
        collapseBtn && (collapseBtn.textContent = '▼');
      }
      function onUp() {
        resizeHandle.classList.remove('resizing');
        localStorage.setItem(projectKey('brainstorm_height'), section.offsetHeight);
        localStorage.setItem(projectKey('brainstorm_collapsed'), '0');
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      }
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  }
}

// ============================================================
// OUTLINE TAB
// ─────────────────────────────────────────────────────────────
// Hierarchical story outliner: Act → Arc → Chapter → Scene.
// Each node has title, beats (bullet notes), linked card IDs,
// and a status. Persisted to sf_outline in localStorage.
// ============================================================

function loadOutline() {
  try { return JSON.parse(localStorage.getItem(projectKey('outline')) || '[]'); } catch(e) { return []; }
}

function saveOutline(nodes) {
  localStorage.setItem(projectKey('outline'), JSON.stringify(nodes));
}

function makeOutlineNode(type, title, parentId, order) {
  return {
    id: generateId(),
    type: type,
    title: title,
    beats: [],
    linked_card_ids: [],
    status: 'not_started',
    parent_id: parentId || null,
    order: order || 0
  };
}

function renderOutlineTab() {
  renderOutlineTree();
  if (selectedOutlineNodeId) {
    renderOutlineDetail(selectedOutlineNodeId);
  } else {
    var detail = document.getElementById('outlineDetail');
    if (detail) detail.innerHTML = '<div class="outline-detail-empty">Select a node from the outline to see its details.</div>';
  }
}

function renderOutlineTree() {
  var treeEl = document.getElementById('outlineTree');
  if (!treeEl) return;
  var nodes = loadOutline();
  var acts = nodes.filter(function(n) { return n.parent_id === null; })
                  .sort(function(a,b) { return a.order - b.order; });

  treeEl.innerHTML = '';

  // Header
  var header = document.createElement('div');
  header.className = 'outline-tree-header';
  var h3 = document.createElement('h3');
  h3.textContent = 'Story Outline';
  header.appendChild(h3);
  treeEl.appendChild(header);

  if (acts.length === 0) {
    var emptyEl = document.createElement('div');
    emptyEl.className = 'outline-empty-state';
    var p = document.createElement('p');
    p.textContent = 'No acts yet. Start by adding your first act.';
    var btn = document.createElement('button');
    btn.className = 'outline-empty-cta';
    btn.textContent = '＋ Add Act';
    btn.addEventListener('click', function() { outlineAddNode('act', null); });
    emptyEl.appendChild(p);
    emptyEl.appendChild(btn);
    treeEl.appendChild(emptyEl);
    return;
  }

  var list = document.createElement('div');
  list.className = 'outline-tree-list';
  acts.forEach(function(act) {
    outlineRenderNode(list, act, nodes, 0);
  });
  treeEl.appendChild(list);

  // Add Act button at the bottom
  var addActRow = document.createElement('div');
  addActRow.style.padding = '8px 16px 4px';
  var addActBtn = document.createElement('button');
  addActBtn.className = 'outline-add-act-btn';
  addActBtn.textContent = '＋ Add Act';
  addActBtn.addEventListener('click', function() { outlineAddNode('act', null); });
  addActRow.appendChild(addActBtn);
  treeEl.appendChild(addActRow);
}

function outlineRenderNode(container, node, allNodes, depth) {
  var children = allNodes.filter(function(n) { return n.parent_id === node.id; })
                         .sort(function(a,b) { return a.order - b.order; });
  var hasChildren = children.length > 0;

  var el = document.createElement('div');
  el.className = 'outline-node' + (node.id === selectedOutlineNodeId ? ' selected' : '');
  el.setAttribute('data-type', node.type);
  el.setAttribute('data-indent', depth);
  el.setAttribute('data-id', node.id);

  // Status dot
  var dot = document.createElement('span');
  dot.className = 'outline-status-dot ' + node.status;
  el.appendChild(dot);

  // Toggle arrow (only if has children)
  var toggle = document.createElement('span');
  toggle.className = 'outline-node-toggle';
  toggle.textContent = hasChildren ? '▾' : '';
  el.appendChild(toggle);

  // Title
  var title = document.createElement('span');
  title.className = 'outline-node-title';
  title.textContent = node.title;
  el.appendChild(title);

  // Add child button
  var childType = { act: 'arc', arc: 'chapter', chapter: 'scene', scene: null }[node.type];
  if (childType) {
    var addBtn = document.createElement('button');
    addBtn.className = 'outline-node-add-child';
    addBtn.title = 'Add ' + childType;
    addBtn.textContent = '＋';
    addBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      outlineAddNode(childType, node.id);
    });
    el.appendChild(addBtn);
  }

  el.addEventListener('click', function() {
    selectedOutlineNodeId = node.id;
    renderOutlineTab();
  });

  container.appendChild(el);

  // Render children
  children.forEach(function(child) {
    outlineRenderNode(container, child, allNodes, depth + 1);
  });
}

function outlineAddNode(type, parentId) {
  var title = type.charAt(0).toUpperCase() + type.slice(1) + ' ' + (Date.now() % 10000);
  var nodes = loadOutline();
  var siblings = nodes.filter(function(n) { return n.parent_id === (parentId || null); });
  var node = makeOutlineNode(type, title, parentId, siblings.length);
  nodes.push(node);
  saveOutline(nodes);
  selectedOutlineNodeId = node.id;
  renderOutlineTab();
}

function renderOutlineDetail(nodeId) {
  var detail = document.getElementById('outlineDetail');
  if (!detail) return;
  var nodes = loadOutline();
  var node = nodes.find(function(n) { return n.id === nodeId; });
  if (!node) {
    detail.innerHTML = '<div class="outline-detail-empty">Node not found.</div>';
    return;
  }

  detail.innerHTML = '';

  // Title section
  var titleSection = document.createElement('div');
  titleSection.className = 'outline-detail-section';
  var titleLabel = document.createElement('div');
  titleLabel.className = 'outline-detail-label';
  titleLabel.textContent = node.type.charAt(0).toUpperCase() + node.type.slice(1) + ' Title';
  var titleInput = document.createElement('input');
  titleInput.className = 'outline-title-input';
  titleInput.type = 'text';
  titleInput.value = node.title;
  titleInput.addEventListener('blur', function() {
    var fresh = loadOutline();
    var n = fresh.find(function(x) { return x.id === nodeId; });
    if (n && titleInput.value.trim()) {
      n.title = titleInput.value.trim();
      saveOutline(fresh);
      renderOutlineTree();
    }
  });
  titleSection.appendChild(titleLabel);
  titleSection.appendChild(titleInput);
  detail.appendChild(titleSection);

  // Status section
  var statusSection = document.createElement('div');
  statusSection.className = 'outline-detail-section';
  var statusLabel = document.createElement('div');
  statusLabel.className = 'outline-detail-label';
  statusLabel.textContent = 'Status';
  var statusSelect = document.createElement('select');
  statusSelect.className = 'outline-status-select';
  [['not_started','Not Started'],['drafted','Drafted'],['done','Done']].forEach(function(opt) {
    var o = document.createElement('option');
    o.value = opt[0];
    o.textContent = opt[1];
    if (node.status === opt[0]) o.selected = true;
    statusSelect.appendChild(o);
  });
  statusSelect.addEventListener('change', function() {
    var fresh = loadOutline();
    var n = fresh.find(function(x) { return x.id === nodeId; });
    if (n) { n.status = statusSelect.value; saveOutline(fresh); renderOutlineTree(); }
  });
  statusSection.appendChild(statusLabel);
  statusSection.appendChild(statusSelect);
  detail.appendChild(statusSection);

  // Beats section
  var beatsSection = document.createElement('div');
  beatsSection.className = 'outline-detail-section';
  var beatsLabel = document.createElement('div');
  beatsLabel.className = 'outline-detail-label';
  beatsLabel.textContent = 'Beats';
  beatsSection.appendChild(beatsLabel);

  var beatsList = document.createElement('div');
  beatsList.className = 'outline-beats-list';

  function renderBeats() {
    beatsList.innerHTML = '';
    var fresh = loadOutline();
    var n = fresh.find(function(x) { return x.id === nodeId; });
    var beats = (n && n.beats) ? n.beats : [];
    beats.forEach(function(beat, idx) {
      var row = document.createElement('div');
      row.className = 'outline-beat-row';
      var inp = document.createElement('input');
      inp.className = 'outline-beat-input';
      inp.type = 'text';
      inp.value = beat;
      inp.addEventListener('blur', function() {
        var f = loadOutline();
        var nd = f.find(function(x) { return x.id === nodeId; });
        if (nd) { nd.beats[idx] = inp.value; saveOutline(f); }
      });
      var rm = document.createElement('button');
      rm.className = 'outline-beat-remove';
      rm.textContent = '×';
      rm.title = 'Remove beat';
      rm.addEventListener('click', function() {
        var f = loadOutline();
        var nd = f.find(function(x) { return x.id === nodeId; });
        if (nd) { nd.beats.splice(idx, 1); saveOutline(f); renderBeats(); }
      });
      row.appendChild(inp);
      row.appendChild(rm);
      beatsList.appendChild(row);
    });
  }
  renderBeats();

  var addBeatBtn = document.createElement('button');
  addBeatBtn.className = 'outline-add-beat-btn';
  addBeatBtn.textContent = '＋ Add beat';
  addBeatBtn.addEventListener('click', function() {
    var f = loadOutline();
    var nd = f.find(function(x) { return x.id === nodeId; });
    if (nd) { nd.beats.push(''); saveOutline(f); renderBeats(); }
  });

  beatsSection.appendChild(beatsList);
  beatsSection.appendChild(addBeatBtn);
  detail.appendChild(beatsSection);

  // Linked Cards section
  var cardsSection = document.createElement('div');
  cardsSection.className = 'outline-detail-section';
  var cardsLabel = document.createElement('div');
  cardsLabel.className = 'outline-detail-label';
  cardsLabel.textContent = 'Linked Cards';
  cardsSection.appendChild(cardsLabel);

  var chipsList = document.createElement('div');
  chipsList.className = 'outline-linked-cards-list';

  function renderLinkedCards() {
    chipsList.innerHTML = '';
    var fresh = loadOutline();
    var n = fresh.find(function(x) { return x.id === nodeId; });
    var ids = (n && n.linked_card_ids) ? n.linked_card_ids : [];
    ids.forEach(function(cid) {
      var card = cards.find(function(c) { return c.id === cid; });
      if (!card) return;
      var chip = document.createElement('div');
      chip.className = 'outline-card-chip';
      chip.setAttribute('data-type', card.type);
      var typeSpan = document.createElement('span');
      typeSpan.className = 'outline-card-chip-type';
      typeSpan.textContent = card.type;
      var titleSpan = document.createElement('span');
      titleSpan.textContent = card.title;
      var unlinkBtn = document.createElement('button');
      unlinkBtn.className = 'outline-card-chip-unlink';
      unlinkBtn.title = 'Unlink';
      unlinkBtn.textContent = '×';
      unlinkBtn.addEventListener('click', function() {
        var f = loadOutline();
        var nd = f.find(function(x) { return x.id === nodeId; });
        if (nd) {
          nd.linked_card_ids = nd.linked_card_ids.filter(function(id) { return id !== cid; });
          saveOutline(f);
          renderLinkedCards();
        }
      });
      chip.appendChild(typeSpan);
      chip.appendChild(titleSpan);
      chip.appendChild(unlinkBtn);
      chipsList.appendChild(chip);
    });
  }
  renderLinkedCards();
  cardsSection.appendChild(chipsList);

  // Card search + link row
  var linkRow = document.createElement('div');
  linkRow.className = 'outline-link-card-row';
  var linkInput = document.createElement('input');
  linkInput.className = 'outline-link-card-input';
  linkInput.type = 'text';
  linkInput.placeholder = 'Search cards to link...';
  var linkBtn = document.createElement('button');
  linkBtn.className = 'outline-link-card-btn';
  linkBtn.textContent = 'Search';
  var linkResults = document.createElement('div');
  linkResults.className = 'outline-link-results';

  function runCardSearch() {
    var q = linkInput.value.trim().toLowerCase();
    linkResults.innerHTML = '';
    linkResults.style.display = 'none';
    if (!q) return;
    var matches = cards.filter(function(c) {
      return (c.title.toLowerCase().includes(q) || (c.content || '').toLowerCase().includes(q)) && c.status !== 'archived';
    }).slice(0, 8);
    if (matches.length === 0) {
      linkResults.style.display = 'block';
      var none = document.createElement('div');
      none.className = 'outline-link-result-item';
      none.textContent = 'No cards found.';
      none.style.color = 'var(--text-muted)';
      linkResults.appendChild(none);
      return;
    }
    linkResults.style.display = 'block';
    matches.forEach(function(card) {
      var item = document.createElement('div');
      item.className = 'outline-link-result-item';
      var typeSpan = document.createElement('span');
      typeSpan.className = 'outline-card-chip-type';
      typeSpan.setAttribute('style', 'color: var(--color-' + (card.type === 'character' ? 'character' : card.type === 'arc' || card.type === 'scene' ? 'arc' : card.type === 'quote' ? 'quote' : card.type === 'idea' || card.type === 'theme' || card.type === 'relationship' ? 'idea' : 'world') + ')');
      typeSpan.textContent = card.type;
      var titleSpan = document.createElement('span');
      titleSpan.textContent = card.title;
      item.appendChild(typeSpan);
      item.appendChild(titleSpan);
      item.addEventListener('click', function() {
        var f = loadOutline();
        var nd = f.find(function(x) { return x.id === nodeId; });
        if (nd && !nd.linked_card_ids.includes(card.id)) {
          nd.linked_card_ids.push(card.id);
          saveOutline(f);
          renderLinkedCards();
        }
        linkInput.value = '';
        linkResults.style.display = 'none';
      });
      linkResults.appendChild(item);
    });
  }

  linkBtn.addEventListener('click', runCardSearch);
  linkInput.addEventListener('keydown', function(e) { if (e.key === 'Enter') runCardSearch(); });
  linkInput.addEventListener('input', function() { if (!linkInput.value.trim()) { linkResults.style.display = 'none'; } });

  linkRow.appendChild(linkInput);
  linkRow.appendChild(linkBtn);
  cardsSection.appendChild(linkRow);
  cardsSection.appendChild(linkResults);
  detail.appendChild(cardsSection);

  // Delete node button
  var deleteSection = document.createElement('div');
  deleteSection.className = 'outline-detail-section';
  deleteSection.style.marginTop = '32px';
  var deleteBtn = document.createElement('button');
  deleteBtn.className = 'outline-delete-node-btn';
  deleteBtn.textContent = 'Delete this ' + node.type;
  deleteBtn.addEventListener('click', function() {
    if (!confirm('Delete "' + node.title + '" and all its children?')) return;
    var f = loadOutline();
    function collectIds(id) {
      var ids = [id];
      f.filter(function(n) { return n.parent_id === id; }).forEach(function(child) {
        ids = ids.concat(collectIds(child.id));
      });
      return ids;
    }
    var toRemove = collectIds(nodeId);
    f = f.filter(function(n) { return !toRemove.includes(n.id); });
    saveOutline(f);
    selectedOutlineNodeId = null;
    renderOutlineTab();
  });
  deleteSection.appendChild(deleteBtn);
  detail.appendChild(deleteSection);
}

function renderArcsTimeline() {
  var allArcCards = cards.filter(function(c) { return c.type === 'arc' && c.status !== 'archived'; });
  var strip   = document.getElementById('arcsTimeline');
  var emptyEl = document.getElementById('arcTimelineEmpty');
  var countEl = document.getElementById('arcCount');
  if (!strip) return;

  countEl.textContent = allArcCards.length + (allArcCards.length === 1 ? ' arc' : ' arcs');

  // Clear non-empty elements
  Array.from(strip.children).forEach(function(child) {
    if (!child.classList.contains('arc-timeline-empty')) child.remove();
  });

  if (allArcCards.length === 0) {
    emptyEl.style.display = 'flex';
    return;
  }
  emptyEl.style.display = 'none';

  // Sort arc cards by user-defined arcOrder; any unlisted cards append at end
  var arcIds = allArcCards.map(function(c) { return c.id; });
  var orderedIds = arcOrder.filter(function(id) { return arcIds.includes(id); });
  arcIds.forEach(function(id) { if (!orderedIds.includes(id)) orderedIds.push(id); });
  var arcCards = orderedIds.map(function(id) { return allArcCards.find(function(c) { return c.id === id; }); }).filter(Boolean);

  arcCards.forEach(function(card, i) {
    var node = document.createElement('div');
    node.className = 'arc-node';
    node.dataset.id = card.id;

    node.innerHTML =
      '<div class="arc-node-toolbar">' +
        '<button class="arc-node-move" data-dir="left" data-id="' + card.id + '" title="Move left">‹</button>' +
        '<button class="arc-node-edit" data-id="' + card.id + '" title="Edit">✎</button>' +
        '<button class="arc-node-move" data-dir="right" data-id="' + card.id + '" title="Move right">›</button>' +
      '</div>' +
      '<div class="arc-node-num">Arc ' + (i + 1) + '</div>' +
      '<div class="arc-node-title" data-id="' + card.id + '">' + escapeHtml(card.title) + '</div>' +
      '<div class="arc-node-excerpt" data-id="' + card.id + '">' + escapeHtml((card.content || '').slice(0, 80)) + '</div>';

    strip.appendChild(node);
  });

  // Move left/right buttons
  strip.querySelectorAll('.arc-node-move').forEach(function(btn) {
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      var id  = btn.getAttribute('data-id');
      var dir = btn.getAttribute('data-dir');
      var allIds = allArcCards.map(function(c) { return c.id; });
      var order  = arcOrder.filter(function(x) { return allIds.includes(x); });
      allIds.forEach(function(x) { if (!order.includes(x)) order.push(x); });
      var idx = order.indexOf(id);
      if (idx < 0) return;
      var newIdx = dir === 'left' ? idx - 1 : idx + 1;
      if (newIdx < 0 || newIdx >= order.length) return;
      order.splice(idx, 1);
      order.splice(newIdx, 0, id);
      arcOrder = order;
      saveArcOrder();
      renderArcsTimeline();
    });
  });

  // Edit button — makes title and excerpt contenteditable temporarily
  strip.querySelectorAll('.arc-node-edit').forEach(function(btn) {
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      var id   = btn.getAttribute('data-id');
      var node = strip.querySelector('.arc-node[data-id="' + id + '"]');
      var titleEl   = node.querySelector('.arc-node-title');
      var excerptEl = node.querySelector('.arc-node-excerpt');
      var card = cards.find(function(c) { return c.id === id; });
      if (!card || titleEl.contentEditable === 'true') return; // already editing

      // Switch to edit mode
      titleEl.contentEditable = 'true';
      excerptEl.contentEditable = 'true';
      titleEl.style.outline = '1px solid var(--accent)';
      excerptEl.style.outline = '1px solid var(--border)';
      excerptEl.style.webkitLineClamp = 'unset'; // show full text while editing
      titleEl.focus();
      btn.textContent = '✓';

      function saveEdit() {
        var newTitle   = titleEl.textContent.trim();
        var newContent = excerptEl.textContent.trim();
        if (newTitle) card.title = newTitle;
        if (newContent) card.content = newContent;
        saveCards();
        titleEl.contentEditable = 'false';
        excerptEl.contentEditable = 'false';
        titleEl.style.outline = '';
        excerptEl.style.outline = '';
        excerptEl.style.webkitLineClamp = '';
        btn.textContent = '✎';
        renderArcsTimeline(); // re-render to sync changes
      }

      btn.onclick = function(ev) { ev.stopPropagation(); saveEdit(); };
      titleEl.addEventListener('blur', saveEdit, { once: true });
    });
  });
}

function renderDramaticSituations() {
  var container = document.getElementById('brainstormSituations');
  if (!container) return;
  // Always re-render (so reordering is reflected)
  container.innerHTML = '';

  // Build ordered list of situations
  var allIds = DRAMATIC_SITUATIONS.map(function(s) { return s.id; });
  var order  = situationOrder.filter(function(id) { return allIds.includes(id); });
  allIds.forEach(function(id) { if (!order.includes(id)) order.push(id); });
  var orderedSits = order.map(function(id) { return DRAMATIC_SITUATIONS.find(function(s) { return s.id === id; }); }).filter(Boolean);

  var grid = document.createElement('div');
  grid.className = 'situations-grid';

  orderedSits.forEach(function(sit) {
    var card = document.createElement('div');
    card.className = 'situation-card' + (selectedSituationId === sit.id ? ' selected' : '');
    card.dataset.sitId = sit.id;
    card.innerHTML =
      '<div class="sit-reorder">' +
        '<button class="sit-move-btn" data-dir="up" data-id="' + sit.id + '" title="Move up">▲</button>' +
        '<button class="sit-move-btn" data-dir="down" data-id="' + sit.id + '" title="Move down">▼</button>' +
      '</div>' +
      '<div class="situation-num">' + sit.id + '</div>' +
      '<div class="situation-name">' + escapeHtml(sit.name) + '</div>';

    card.addEventListener('click', function(e) {
      if (e.target.closest('.sit-reorder')) return; // don't select when clicking move btns
      toggleSituation(sit.id);
    });
    grid.appendChild(card);
  });

  container.appendChild(grid);

  // Wire up move buttons
  grid.querySelectorAll('.sit-move-btn').forEach(function(btn) {
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      var id  = Number(btn.getAttribute('data-id'));
      var dir = btn.getAttribute('data-dir');
      var order2 = situationOrder.filter(function(x) { return allIds.includes(x); });
      allIds.forEach(function(x) { if (!order2.includes(x)) order2.push(x); });
      var idx = order2.indexOf(id);
      if (idx < 0) return;
      var newIdx = dir === 'up' ? idx - 1 : idx + 1;
      if (newIdx < 0 || newIdx >= order2.length) return;
      order2.splice(idx, 1);
      order2.splice(newIdx, 0, id);
      situationOrder = order2;
      saveSituationOrder();
      renderDramaticSituations();
    });
  });

  // Detail card (shows expanded description for selected situation)
  var detail = document.createElement('div');
  detail.className = 'situation-detail' + (selectedSituationId ? '' : ' hidden');
  detail.id = 'situationDetail';
  if (selectedSituationId) {
    var sit = DRAMATIC_SITUATIONS.find(function(s) { return s.id === selectedSituationId; });
    if (sit) {
      detail.innerHTML =
        '<div class="situation-detail-text"><strong>' + sit.id + '. ' + escapeHtml(sit.name) + '</strong> — ' + escapeHtml(sit.description) + '</div>' +
        '<button class="btn-use-situation" id="useSituationBtn">Use in Ideas →</button>';
    }
  }
  container.appendChild(detail);

  if (selectedSituationId) {
    var usBtn = document.getElementById('useSituationBtn');
    if (usBtn) {
      var sit = DRAMATIC_SITUATIONS.find(function(s) { return s.id === selectedSituationId; });
      if (sit) usBtn.addEventListener('click', function() { setSelectedSituationInGenerator(sit); });
    }
  }
}

function toggleSituation(id) {
  var allCards = document.querySelectorAll('.situation-card');
  var detail   = document.getElementById('situationDetail');
  var sit = DRAMATIC_SITUATIONS.find(function(s) { return s.id === id; });

  if (selectedSituationId === id) {
    // Deselect
    selectedSituationId = null;
    allCards.forEach(function(c) { c.classList.remove('selected'); });
    detail.classList.add('hidden');
    clearSelectedSituation();
    return;
  }

  selectedSituationId = id;
  allCards.forEach(function(c) {
    c.classList.toggle('selected', Number(c.dataset.sitId) === id);
  });

  detail.classList.remove('hidden');
  detail.innerHTML =
    '<div class="situation-detail-text"><strong>' + sit.id + '. ' + escapeHtml(sit.name) + '</strong> — ' + escapeHtml(sit.description) + '</div>' +
    '<button class="btn-use-situation" id="useSituationBtn">Use in Ideas →</button>';

  document.getElementById('useSituationBtn').addEventListener('click', function() {
    setSelectedSituationInGenerator(sit);
  });
}

function setSelectedSituationInGenerator(sit) {
  var badge = document.getElementById('ideasSelectedSituation');
  badge.classList.remove('hidden');
  badge.innerHTML =
    '<span>Using: <strong>' + sit.id + '. ' + escapeHtml(sit.name) + '</strong></span>' +
    '<button class="btn-clear-situation" id="clearSituationBtn">✕</button>';
  document.getElementById('clearSituationBtn').addEventListener('click', clearSelectedSituation);
}

function clearSelectedSituation() {
  selectedSituationId = null;
  var badge = document.getElementById('ideasSelectedSituation');
  if (badge) badge.classList.add('hidden');
  document.querySelectorAll('.situation-card').forEach(function(c) { c.classList.remove('selected'); });
  var detail = document.getElementById('situationDetail');
  if (detail) detail.classList.add('hidden');
}

function renderEightSequences() {
  var container = document.getElementById('brainstormSequences');
  if (!container || container.children.length > 0) return; // already rendered

  // Map arcs button at top
  var mapWrap = document.createElement('div');
  mapWrap.className = 'sequence-map-btn-wrap';
  mapWrap.innerHTML = '<button class="btn-map-arcs-sequences" id="mapArcsSequencesBtn">✦ Map My Arcs to Sequences</button>';
  container.appendChild(mapWrap);

  var list = document.createElement('div');
  list.className = 'sequence-list';
  list.id = 'sequenceList';

  EIGHT_SEQUENCES.forEach(function(seq) {
    var row = document.createElement('div');
    row.className = 'sequence-row';
    row.id = 'seq-row-' + seq.number;

    var mappedArcIds = arcSequenceMap[seq.number] || [];
    var mappedArcCards = mappedArcIds.map(function(id) { return cards.find(function(c) { return c.id === id; }); }).filter(Boolean);
    var chipsHtml = mappedArcCards.length
      ? mappedArcCards.map(function(c) { return '<span class="sequence-arc-chip">' + escapeHtml(c.title) + '</span>'; }).join('')
      : '<span style="font-size:11px;color:var(--text-light)">No arcs mapped</span>';

    row.innerHTML =
      '<div class="sequence-row-header">' +
        '<span class="sequence-num">Seq ' + seq.number + '</span>' +
        '<span class="sequence-act-badge">' + seq.act + '</span>' +
        '<span class="sequence-name">' + escapeHtml(seq.name) + '</span>' +
      '</div>' +
      '<div class="sequence-desc">' + escapeHtml(seq.description) + '</div>' +
      '<div class="sequence-mapped-arcs">' + chipsHtml + '</div>';

    list.appendChild(row);
  });

  container.appendChild(list);

  document.getElementById('mapArcsSequencesBtn').addEventListener('click', mapArcsToSequences);
}

function refreshSequenceList() {
  var container = document.getElementById('brainstormSequences');
  if (!container) return;
  // Clear and re-render
  while (container.firstChild) container.removeChild(container.firstChild);
  renderEightSequences();
}

async function mapArcsToSequences() {
  var key = apiKey || localStorage.getItem('sf_api_key') || '';
  if (!key) { showToast('⚠️ Set your API key first.'); return; }

  var arcCards = cards.filter(function(c) { return c.type === 'arc' && c.status !== 'archived'; });
  if (arcCards.length === 0) { showToast('No arc cards found.'); return; }

  var btn = document.getElementById('mapArcsSequencesBtn');
  btn.textContent = '⏳ Mapping…';
  btn.disabled = true;

  var arcList = arcCards.map(function(c) { return '[' + c.id + '] ' + c.title + ' — ' + (c.content || ''); }).join('\n');
  var seqList = EIGHT_SEQUENCES.map(function(s) { return s.number + '. ' + s.name + ' (' + s.act + ')'; }).join('\n');

  var prompt =
    'Map each story arc to the most fitting 8-sequence slot.\n' +
    'Return ONLY a JSON object where keys are sequence numbers (1–8) and values are arrays of arc IDs.\n' +
    'Only include sequences that have matching arcs. Arc IDs must match exactly.\n\n' +
    'Sequences:\n' + seqList + '\n\nArcs:\n' + arcList;

  try {
    var response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({ model: CLAUDE_MODEL, max_tokens: 400, messages: [{ role: 'user', content: prompt }] })
    });
    var data = await response.json();
    var raw = (data.content?.[0]?.text || '').trim();
    raw = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();
    var mapping = JSON.parse(raw);
    arcSequenceMap = {};
    Object.keys(mapping).forEach(function(k) {
      if (Array.isArray(mapping[k])) arcSequenceMap[k] = mapping[k];
    });
    saveArcSequenceMap();
    refreshSequenceList();
    showToast('Arcs mapped to sequences!');
  } catch(err) {
    showToast('❌ ' + err.message);
  }
  btn.textContent = '✦ Map My Arcs to Sequences';
  btn.disabled = false;
}

// Brainstorm subtab switching
document.getElementById('panel-arcs').addEventListener('click', function(e) {
  var tabBtn = e.target.closest('.brainstorm-tab');
  if (!tabBtn) return;
  var targetTab = tabBtn.getAttribute('data-btab');
  document.querySelectorAll('.brainstorm-tab').forEach(function(b) { b.classList.remove('active'); });
  tabBtn.classList.add('active');
  document.getElementById('brainstormSituations').classList.toggle('hidden', targetTab !== 'situations');
  document.getElementById('brainstormSequences').classList.toggle('hidden', targetTab !== 'sequences');
});

// Map arcs button (bottom ideas section)
document.getElementById('mapArcsBtn').addEventListener('click', mapArcsToSequences);

// Ideas generator
document.getElementById('generateIdeasBtn').addEventListener('click', generateStoryIdeas);

async function generateStoryIdeas() {
  var key = apiKey || localStorage.getItem('sf_api_key') || '';
  if (!key) { showToast('⚠️ Set your API key first.'); return; }

  var btn       = document.getElementById('generateIdeasBtn');
  var resultEl  = document.getElementById('ideasResult');
  var contextNote = document.getElementById('ideasContext').value.trim();
  var sit = selectedSituationId ? DRAMATIC_SITUATIONS.find(function(s) { return s.id === selectedSituationId; }) : null;

  btn.textContent = '⏳ Generating…';
  btn.disabled = true;
  resultEl.classList.add('hidden');

  var storyCtx = buildStoryContext();
  var arcCards = cards.filter(function(c) { return c.type === 'arc' && c.status !== 'archived'; });
  var arcSummary = arcCards.length
    ? 'Current arcs:\n' + arcCards.map(function(c) { return '- ' + c.title + ': ' + (c.content || ''); }).join('\n')
    : 'No arc cards yet.';

  var sitNote = sit ? '\n\nFocus the ideas around this dramatic situation: ' + sit.id + '. ' + sit.name + ' — ' + sit.description : '';
  var directionNote = contextNote ? '\n\nUser direction: ' + contextNote : '';

  var prompt =
    'You are a story development assistant for a ' + currentProjectFormat + ' called "' + currentProjectName + '".\n' +
    'Based on the story so far, generate exactly 3 distinct "What if..." story ideas for what could happen next.\n' +
    'Each idea should be 2–3 sentences. Number them 1, 2, 3. Make them varied and interesting.\n\n' +
    storyCtx + '\n\n' + arcSummary + sitNote + directionNote;

  try {
    var response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({ model: CLAUDE_MODEL, max_tokens: 600, messages: [{ role: 'user', content: prompt }] })
    });
    var data = await response.json();
    var result = (data.content?.[0]?.text || '').trim();
    resultEl.textContent = result;
    resultEl.classList.remove('hidden');
  } catch(err) {
    showToast('❌ ' + err.message);
  }
  btn.textContent = 'Generate 3 Ideas ▶';
  btn.disabled = false;
}


// ============================================================
// SECTION 0b: PROJECT MANAGEMENT
// ─────────────────────────────────────────────────────────────
// Project switcher UI, create/switch/rename functions.
// ============================================================

function createProject(name, format, brief) {
  var trimmed = (name || '').trim();
  if (!trimmed) return;
  if (projects.some(function(p) { return p.name.toLowerCase() === trimmed.toLowerCase(); })) return;
  var id  = 'proj_' + Date.now();
  var fmt = format || 'novel';
  var brf = (brief || '').trim();
  projects.push({ id: id, name: trimmed, format: fmt, brief: brf, createdAt: new Date().toISOString() });
  localStorage.setItem('sf_projects', JSON.stringify(projects));

  // Save format-based default column labels for new project
  var defaultLabels = FORMAT_COLUMNS[fmt] || FORMAT_COLUMNS['other'];
  localStorage.setItem(id + '_column_labels', JSON.stringify(defaultLabels));

  switchProject(id);
}

function switchProject(id) {
  if (id === activeProjectId) {
    document.getElementById('projectDropdown').hidden = true;
    return;
  }
  localStorage.setItem('sf_active_project', id);
  location.reload();
}

function renameProject(id, newName) {
  var proj = projects.find(function(p) { return p.id === id; });
  if (proj && newName.trim()) {
    proj.name = newName.trim();
    localStorage.setItem('sf_projects', JSON.stringify(projects));
    if (id === activeProjectId) {
      document.getElementById('projectSwitcherName').textContent = proj.name;
    }
  }
}

function promptCreateProject() {
  document.getElementById('projectDropdown').hidden = true;
  openNewProjectModal(null);
}

function openNewProjectModal(projectId) {
  var modal    = document.getElementById('newProjectModal');
  var overlay  = document.getElementById('newProjectModalOverlay');
  var titleIn  = document.getElementById('newProjectTitle');
  var formatIn = document.getElementById('newProjectFormat');
  var briefIn  = document.getElementById('newProjectBrief');
  var saveBtn  = document.getElementById('newProjectSave');
  var errEl    = document.getElementById('newProjectError');

  var editing = projectId ? projects.find(function(p) { return p.id === projectId; }) : null;
  document.getElementById('newProjectModalHeading').textContent = editing ? 'Edit Project' : 'New Project';
  saveBtn.textContent = editing ? 'Save Changes' : 'Create Project';

  if (editing) {
    titleIn.value  = editing.name;
    formatIn.value = editing.format || 'novel';
    briefIn.value  = editing.brief  || '';
  } else {
    titleIn.value  = '';
    formatIn.value = 'novel';
    briefIn.value  = '';
  }
  errEl.textContent = '';
  errEl.classList.add('hidden');

  modal.classList.remove('hidden');
  overlay.classList.remove('hidden');
  titleIn.focus();
  titleIn.addEventListener('input', function() {
    errEl.textContent = '';
    errEl.classList.add('hidden');
  });

  function close() {
    modal.classList.add('hidden');
    overlay.classList.add('hidden');
    saveBtn.removeEventListener('click', onSave);
    overlay.removeEventListener('click', close);
  }

  function onSave() {
    console.log('[modal] onSave fired, name:', titleIn.value.trim());
    var name   = titleIn.value.trim();
    var format = formatIn.value;
    var brief  = briefIn.value.trim();
    if (!name) { errEl.textContent = 'Title is required.'; errEl.classList.remove('hidden'); titleIn.focus(); return; }
    if (!editing && projects.some(function(p) { return p.name.toLowerCase() === name.toLowerCase(); })) {
      errEl.textContent = 'A project with that name already exists.'; errEl.classList.remove('hidden'); titleIn.select(); return;
    }

    if (editing) {
      if (projects.some(function(p) { return p.id !== editing.id && p.name.toLowerCase() === name.toLowerCase(); })) {
        errEl.textContent = 'A project with that name already exists.'; errEl.classList.remove('hidden'); return;
      }
      editing.name   = name;
      editing.format = format;
      editing.brief  = brief;
      localStorage.setItem('sf_projects', JSON.stringify(projects));
      close();
      location.reload();
    } else {
      close();
      createProject(name, format, brief);
    }
  }

  saveBtn.addEventListener('click', onSave);
  overlay.addEventListener('click', close);
  titleIn.addEventListener('keydown', function(e) { if (e.key === 'Enter') onSave(); });

  var sageBtn = document.getElementById('newProjectPlanWithSage');
  if (sageBtn) {
    sageBtn.onclick = function() {
      console.log('[modal] Plan with Sage clicked');
      var draft = (titleIn && titleIn.value || '').trim();
      close();
      openChat();
      var inp = document.getElementById('chatInput');
      if (inp) {
        inp.value = draft
          ? 'I want to start planning a new project called "' + draft + '". Help me think through the concept, format, and themes.'
          : 'I want to start planning a new project. Help me think through the concept, format, and themes.';
        inp.style.height = 'auto';
        inp.style.height = Math.min(inp.scrollHeight, 110) + 'px';
        inp.focus();
      }
    };
  }
}

function renderProjectDropdown() {
  var dd = document.getElementById('projectDropdown');
  dd.innerHTML = projects.map(function(p) {
    var cls = p.id === activeProjectId ? ' class="active"' : '';
    return '<div class="project-dd-row">' +
      '<button' + cls + ' data-id="' + p.id + '">' + escapeHtml(p.name) + '</button>' +
      '<button class="project-edit-btn" data-edit-id="' + p.id + '" title="Edit project">⚙</button>' +
      '</div>';
  }).join('') + '<hr><button class="new-project-btn" id="newProjectBtn">+ New Project</button>';
  dd.querySelectorAll('[data-id]').forEach(function(btn) {
    btn.addEventListener('click', function() { switchProject(this.dataset.id); });
  });
  dd.querySelectorAll('[data-edit-id]').forEach(function(btn) {
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      document.getElementById('projectDropdown').hidden = true;
      openNewProjectModal(this.dataset.editId);
    });
  });
  document.getElementById('newProjectBtn').addEventListener('click', promptCreateProject);
}

// ─────────────────────────────────────────────────────────────
// COLUMN LABEL SYSTEM — format-based defaults + per-project overrides
// ─────────────────────────────────────────────────────────────

function applyColumnLabels(labels) {
  COLUMN_TYPES.forEach(function(colType) {
    var entry  = labels[colType];
    if (!entry) return;
    var header = document.querySelector('.canvas-col[data-type="' + colType + '"] .col-label');
    var strip  = document.querySelector('.canvas-col[data-type="' + colType + '"] .col-vs-label');
    if (header) header.textContent = entry.label;
    if (strip)  strip.textContent  = entry.strip;
  });
}

function loadAndApplyColumnLabels() {
  var key     = activeProjectId + '_column_labels';
  var stored  = localStorage.getItem(key);
  var labels  = stored ? JSON.parse(stored) : (FORMAT_COLUMNS[currentProjectFormat] || FORMAT_COLUMNS['other']);
  applyColumnLabels(labels);
  initColumnRename(labels, key);
}

function initColumnRename(labels, storageKey) {
  COLUMN_TYPES.forEach(function(colType) {
    var headerLeft = document.querySelector('.canvas-col[data-type="' + colType + '"] .col-header-left');
    if (!headerLeft) return;

    var pencil = document.createElement('button');
    pencil.className   = 'col-rename-btn';
    pencil.title       = 'Rename column';
    pencil.textContent = '✎';
    headerLeft.appendChild(pencil);

    function startRename() {
      var labelEl = headerLeft.querySelector('.col-label');
      if (!labelEl || headerLeft.querySelector('.col-rename-input')) return;
      var current = labels[colType] ? labels[colType].label : labelEl.textContent;
      var input   = document.createElement('input');
      input.className   = 'col-rename-input';
      input.value       = current;
      input.style.cssText = 'font-size:inherit;font-weight:inherit;width:8rem;border:none;border-bottom:1px solid var(--accent);background:transparent;color:inherit;outline:none;';
      labelEl.replaceWith(input);
      input.focus();
      input.select();

      function commit() {
        var newLabel = input.value.trim() || current;
        var restored = document.createElement('span');
        restored.className   = 'col-label';
        restored.textContent = newLabel;
        input.replaceWith(restored);
        if (!labels[colType]) labels[colType] = { label: newLabel, strip: newLabel.slice(0, 4) };
        labels[colType].label = newLabel;
        var stripEl = document.querySelector('.canvas-col[data-type="' + colType + '"] .col-vs-label');
        if (stripEl) stripEl.textContent = labels[colType].strip;
        localStorage.setItem(storageKey, JSON.stringify(labels));
        restored.addEventListener('dblclick', startRename);
      }
      input.addEventListener('blur',   commit);
      input.addEventListener('keydown', function(e) { if (e.key === 'Enter') { e.preventDefault(); input.blur(); } if (e.key === 'Escape') { input.value = current; input.blur(); } });
    }

    pencil.addEventListener('click', startRename);
    var labelEl = headerLeft.querySelector('.col-label');
    if (labelEl) labelEl.addEventListener('dblclick', startRename);
  });
}

// Wire the project switcher button
(function() {
  var nameEl = document.getElementById('projectSwitcherName');
  if (nameEl) nameEl.textContent = currentProjectName;

  // Update home project name and page title
  var homeName = document.querySelector('.home-project-name');
  if (homeName) homeName.textContent = currentProjectName;
  document.title = 'StoryForge — ' + currentProjectName;

  // Set Sage intro message driven by project name + brief
  var sageIntro = document.getElementById('sageIntroMsg');
  if (sageIntro) {
    var briefSnippet = '';
    if (currentProjectBrief) {
      var m = currentProjectBrief.match(/^[^.!?]+[.!?]/);
      briefSnippet = ' ' + (m ? m[0] : currentProjectBrief.slice(0, 120));
    }
    sageIntro.querySelector('p').textContent = 'Hi! I\'m here to help with "' + currentProjectName + '".' + briefSnippet + ' Ask me anything.';
  }

  var btn = document.getElementById('projectSwitcherBtn');
  if (!btn) return;
  btn.addEventListener('click', function(e) {
    e.stopPropagation();
    var dd = document.getElementById('projectDropdown');
    dd.hidden = !dd.hidden;
    if (!dd.hidden) renderProjectDropdown();
  });
  document.addEventListener('click', function() {
    var dd = document.getElementById('projectDropdown');
    if (dd) dd.hidden = true;
  });

  // Apply format-based column labels for the active project
  loadAndApplyColumnLabels();
})();

// ============================================================
// SECTION 14: EXPORT / IMPORT DATA (Backup & Restore)
// ─────────────────────────────────────────────────────────────
// Export: reads localStorage into a downloadable JSON file.
//         Pure read — never modifies any stored data.
// Import: reads a backup JSON and either merges (adds new items
//         only, never overwrites) or replaces all data.
//         No API key required — no network calls at all.
// ============================================================

// Per-project key suffixes included in a backup (no sf_ prefix, no project ID prefix).
// Export writes these under backup.data.<suffix>.
// Import reads from backup.data.<suffix> (v2) or backup.sf_<suffix> (v1 legacy).
const BACKUP_SUFFIXES = [
  'cards', 'positions', 'connections', 'character_profiles',
  'arc_sequence_map', 'arc_order', 'situation_order',
  'writing_copy', 'writing_draft', 'suggestions', 'outline',
];

// Returns backup data for a given suffix, supporting v1 (flat sf_*) and v2 (data obj) formats
function getBackupData(backup, suffix) {
  if (backup.version === 2 && backup.data) return backup.data[suffix];
  return backup['sf_' + suffix]; // v1 legacy
}

// ── Backup modal open / close ──────────────────────────────
const backupModal     = document.getElementById('backupModal');
const openBackupBtn   = document.getElementById('openBackupModal');
const closeBackupBtn  = document.getElementById('closeBackupModal');

openBackupBtn.addEventListener('click', function() {
  backupModal.classList.remove('hidden');
  setBackupStatus('', '');
});
closeBackupBtn.addEventListener('click', function() {
  backupModal.classList.add('hidden');
});
backupModal.addEventListener('click', function(e) {
  if (e.target === backupModal) backupModal.classList.add('hidden');
});

function setBackupStatus(msg, type) {
  // type: '' | 'ok' | 'err'
  var el = document.getElementById('backupStatus');
  if (!msg) { el.classList.add('hidden'); el.textContent = ''; return; }
  el.classList.remove('hidden');
  el.className = 'backup-status backup-status-' + (type || 'ok');
  el.textContent = msg;
}

// ── Export ─────────────────────────────────────────────────
document.getElementById('exportBtn').addEventListener('click', function() {
  var backup = {
    version: 2,
    type: 'project',
    project: { id: activeProjectId, name: currentProjectName, createdAt: activeProject.createdAt },
    exportedAt: new Date().toISOString(),
    data: {}
  };

  for (var i = 0; i < BACKUP_SUFFIXES.length; i++) {
    var suffix = BACKUP_SUFFIXES[i];
    var raw = localStorage.getItem(projectKey(suffix));
    if (raw !== null) {
      if (suffix === 'writing_copy' || suffix === 'writing_draft') {
        backup.data[suffix] = raw;
      } else {
        try { backup.data[suffix] = JSON.parse(raw); } catch(e) { backup.data[suffix] = raw; }
      }
    }
  }

  var json = JSON.stringify(backup, null, 2);
  var blob = new Blob([json], { type: 'application/json' });
  var url  = URL.createObjectURL(blob);
  var a    = document.createElement('a');
  var date = new Date().toISOString().slice(0, 10);
  var safeName = currentProjectName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  a.href     = url;
  a.download = 'storyforge-' + safeName + '-' + date + '.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  setBackupStatus('Backup downloaded.', 'ok');
});

// ── Import ─────────────────────────────────────────────────
document.getElementById('importFileInput').addEventListener('change', function(e) {
  var file = e.target.files[0];
  if (!file) return;

  // Validate file type
  if (!file.name.endsWith('.json')) {
    setBackupStatus('Error: please select a .json file.', 'err');
    e.target.value = '';
    return;
  }

  var reader = new FileReader();
  reader.onload = function(ev) {
    var backup;
    try {
      backup = JSON.parse(ev.target.result);
    } catch(err) {
      setBackupStatus('Error: could not read file — invalid JSON.', 'err');
      return;
    }

    // Detect format: v2 has version:2 + data obj; v1 has flat sf_* keys
    var _isV2 = backup.version === 2 && backup.type === 'project' && backup.data;
    var _cardsArr = _isV2 ? backup.data.cards : backup.sf_cards;
    if (!backup || !Array.isArray(_cardsArr)) {
      setBackupStatus("Error: this doesn't look like a StoryForge backup file.", 'err');
      return;
    }

    var mode = document.querySelector('input[name="importMode"]:checked').value;

    if (mode === 'replace') {
      var count = _cardsArr.length;
      if (!confirm('Replace all current data with this backup?\n\nThis will load ' + count + ' cards and overwrite all your current cards, connections, and character profiles.\n\nClick OK to continue.')) {
        e.target.value = '';
        return;
      }
      applyReplace(backup);
    } else {
      applyMerge(backup);
    }

    // Reset file input so the same file can be chosen again
    e.target.value = '';
  };
  reader.readAsText(file);
});

// writing_copy and writing_draft are raw HTML strings; everything else is JSON.
// Suffix is stored under the active project's namespaced key.
function setBackupValue(suffix, value) {
  var key = projectKey(suffix);
  if (suffix === 'writing_copy' || suffix === 'writing_draft') {
    localStorage.setItem(key, typeof value === 'string' ? value : '');
  } else {
    localStorage.setItem(key, JSON.stringify(value));
  }
}

function applyReplace(backup) {
  for (var i = 0; i < BACKUP_SUFFIXES.length; i++) {
    var suffix = BACKUP_SUFFIXES[i];
    var value = getBackupData(backup, suffix);
    if (value !== undefined) setBackupValue(suffix, value);
  }
  setBackupStatus('Restored from backup. Reloading…', 'ok');
  setTimeout(function() { location.reload(); }, 1200);
}

function applyMerge(backup) {
  var added = 0, skipped = 0;

  // cards — merge by id
  var existingCards = cards.slice();
  var existingIds   = new Set(existingCards.map(function(c) { return c.id; }));
  var newCards      = (getBackupData(backup, 'cards') || []).filter(function(c) {
    if (existingIds.has(c.id)) { skipped++; return false; }
    added++;
    return true;
  });
  if (newCards.length > 0) {
    var merged = existingCards.concat(newCards);
    localStorage.setItem(projectKey('cards'), JSON.stringify(merged));
    cards = merged;
  }

  // positions — add missing
  var pos = {};
  try { pos = JSON.parse(localStorage.getItem(projectKey('positions')) || '{}'); } catch(e) {}
  var bPos = getBackupData(backup, 'positions') || {};
  Object.keys(bPos).forEach(function(id) { if (!pos[id]) pos[id] = bPos[id]; });
  localStorage.setItem(projectKey('positions'), JSON.stringify(pos));

  // connections — merge by id
  var existingConns = [];
  try { existingConns = JSON.parse(localStorage.getItem(projectKey('connections')) || '[]'); } catch(e) {}
  var existingConnIds = new Set(existingConns.map(function(c) { return c.id; }));
  var newConns = (getBackupData(backup, 'connections') || []).filter(function(c) {
    return c.id && !existingConnIds.has(c.id);
  });
  if (newConns.length > 0) {
    localStorage.setItem(projectKey('connections'), JSON.stringify(existingConns.concat(newConns)));
  }

  // character_profiles — add missing
  var charProfs = {};
  try { charProfs = JSON.parse(localStorage.getItem(projectKey('character_profiles')) || '{}'); } catch(e) {}
  var bCharProfs = getBackupData(backup, 'character_profiles') || {};
  Object.keys(bCharProfs).forEach(function(id) { if (!charProfs[id]) charProfs[id] = bCharProfs[id]; });
  localStorage.setItem(projectKey('character_profiles'), JSON.stringify(charProfs));

  // arc_sequence_map — add missing slots
  var seqMap = {};
  try { seqMap = JSON.parse(localStorage.getItem(projectKey('arc_sequence_map')) || '{}'); } catch(e) {}
  var bSeqMap = getBackupData(backup, 'arc_sequence_map') || {};
  Object.keys(bSeqMap).forEach(function(slot) { if (!seqMap[slot]) seqMap[slot] = bSeqMap[slot]; });
  localStorage.setItem(projectKey('arc_sequence_map'), JSON.stringify(seqMap));

  // arc_order — append missing IDs
  var arcOrd = [];
  try { arcOrd = JSON.parse(localStorage.getItem(projectKey('arc_order')) || '[]'); } catch(e) {}
  var arcOrdSet = new Set(arcOrd);
  (getBackupData(backup, 'arc_order') || []).forEach(function(id) { if (!arcOrdSet.has(id)) arcOrd.push(id); });
  localStorage.setItem(projectKey('arc_order'), JSON.stringify(arcOrd));

  // situation_order — append missing indices
  var sitOrd = [];
  try { sitOrd = JSON.parse(localStorage.getItem(projectKey('situation_order')) || '[]'); } catch(e) {}
  var sitOrdSet = new Set(sitOrd);
  (getBackupData(backup, 'situation_order') || []).forEach(function(n) { if (!sitOrdSet.has(n)) sitOrd.push(n); });
  localStorage.setItem(projectKey('situation_order'), JSON.stringify(sitOrd));

  // suggestions — merge by id
  var existingSug = [];
  try { existingSug = JSON.parse(localStorage.getItem(projectKey('suggestions')) || '[]'); } catch(e) {}
  var existingSugIds = new Set(existingSug.map(function(s) { return s.id; }));
  var newSug = (getBackupData(backup, 'suggestions') || []).filter(function(s) {
    return s.id && !existingSugIds.has(s.id);
  });
  if (newSug.length > 0) {
    localStorage.setItem(projectKey('suggestions'), JSON.stringify(existingSug.concat(newSug)));
  }

  // writing_copy and writing_draft — only if current slot is empty
  if (!localStorage.getItem(projectKey('writing_copy')) && getBackupData(backup, 'writing_copy')) {
    setBackupValue('writing_copy', getBackupData(backup, 'writing_copy'));
  }
  if (!localStorage.getItem(projectKey('writing_draft')) && getBackupData(backup, 'writing_draft')) {
    setBackupValue('writing_draft', getBackupData(backup, 'writing_draft'));
  }

  // outline — restore if not present
  if (!localStorage.getItem(projectKey('outline')) && getBackupData(backup, 'outline')) {
    localStorage.setItem(projectKey('outline'), JSON.stringify(getBackupData(backup, 'outline')));
  }

  var msg = added + ' card' + (added !== 1 ? 's' : '') + ' added';
  if (skipped > 0) msg += ', ' + skipped + ' skipped (already exist)';
  msg += '. Reloading…';
  setBackupStatus(msg, 'ok');
  setTimeout(function() { location.reload(); }, 1400);
}


// ============================================================
// E2 — Export .txt / .md
// ============================================================
function getActiveWritingPane() {
  var copy  = document.getElementById('writingCopyEditor');
  var draft = document.getElementById('writingDraftEditor');
  if (draft && document.activeElement === draft) return draft;
  return copy;
}

function exportWritingAs(format) {
  var el = getActiveWritingPane();
  if (!el) return;
  var html = el.innerHTML;
  var text;
  if (format === 'txt') {
    text = html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<\/div>/gi, '\n')
      .replace(/<\/h[1-6]>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&nbsp;/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  } else {
    text = html
      .replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, '# $1\n')
      .replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, '## $1\n')
      .replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, '### $1\n')
      .replace(/<(?:b|strong)[^>]*>([\s\S]*?)<\/(?:b|strong)>/gi, '**$1**')
      .replace(/<(?:em|i)[^>]*>([\s\S]*?)<\/(?:em|i)>/gi, '*$1*')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<\/div>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&nbsp;/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }
  var date = new Date().toISOString().slice(0, 10);
  var filename = 'storyforge-' + format + '-' + date + '.' + format;
  var blob = new Blob([text], { type: 'text/plain' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

// ============================================================
// F1 — Column Spotlight Mode
// ============================================================
var spotlitColumn = null;

function spotlightColumn(type) {
  var cols = document.querySelectorAll('.canvas-col');
  if (spotlitColumn === type) {
    spotlitColumn = null;
    cols.forEach(function(c) { c.classList.remove('spotlit', 'collapsed'); });
    return;
  }
  spotlitColumn = type;
  cols.forEach(function(c) {
    if (c.dataset.type === type) {
      c.classList.add('spotlit');
      c.classList.remove('collapsed');
    } else {
      c.classList.add('collapsed');
      c.classList.remove('spotlit');
    }
  });
}

// ============================================================
// E3 — Find & Replace
// ============================================================
var frPanelVisible = false;
var frCurrentMatch = -1;

function toggleFindReplace() {
  var panel = document.getElementById('find-replace-panel');
  if (!panel) return;
  frPanelVisible = !frPanelVisible;
  panel.style.display = frPanelVisible ? 'block' : 'none';
  if (frPanelVisible) {
    var fi = document.getElementById('fr-find');
    if (fi) { fi.value = ''; fi.focus(); }
    document.getElementById('fr-match-count').textContent = '';
    frCurrentMatch = -1;
  } else {
    var copy  = document.getElementById('writingCopyEditor');
    var draft = document.getElementById('writingDraftEditor');
    if (copy)  { frClearHighlights(copy);  localStorage.setItem(projectKey('writing_copy'),  copy.innerHTML); }
    if (draft) { frClearHighlights(draft); localStorage.setItem(projectKey('writing_draft'), draft.innerHTML); }
  }
}

function frEscapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function frGetPane() {
  var copy  = document.getElementById('writingCopyEditor');
  var draft = document.getElementById('writingDraftEditor');
  if (draft && document.activeElement === draft) return draft;
  return copy;
}

function frHighlightMatches() {
  var term = (document.getElementById('fr-find') || {}).value || '';
  var countEl = document.getElementById('fr-match-count');
  if (!term) { if (countEl) countEl.textContent = ''; return 0; }
  var pane = frGetPane();
  if (!pane) return 0;
  var plain = pane.innerHTML.replace(/<mark class="fr-hl"[^>]*>([\s\S]*?)<\/mark>/gi, '$1');
  var re = new RegExp(frEscapeRegex(term), 'gi');
  var count = (plain.match(re) || []).length;
  pane.innerHTML = plain.replace(re, function(m) { return '<mark class="fr-hl">' + m + '</mark>'; });
  if (countEl) countEl.textContent = count ? count + ' match' + (count !== 1 ? 'es' : '') : 'no matches';
  if (pane.id === 'writingCopyEditor') localStorage.setItem(projectKey('writing_copy'), pane.innerHTML);
  else localStorage.setItem(projectKey('writing_draft'), pane.innerHTML);
  return count;
}

function frClearHighlights(pane) {
  pane.innerHTML = pane.innerHTML.replace(/<mark class="fr-hl[^"]*"[^>]*>([\s\S]*?)<\/mark>/gi, '$1');
}

function frNavigateMatch(dir) {
  var marks = document.querySelectorAll('.fr-hl');
  if (!marks.length) return;
  marks.forEach(function(m) { m.classList.remove('fr-hl-active'); });
  frCurrentMatch = ((frCurrentMatch + dir) % marks.length + marks.length) % marks.length;
  var active = marks[frCurrentMatch];
  active.classList.add('fr-hl-active');
  active.scrollIntoView({ block: 'center', behavior: 'smooth' });
}

function frReplaceNext() {
  var term    = (document.getElementById('fr-find')    || {}).value || '';
  var replace = (document.getElementById('fr-replace') || {}).value || '';
  if (!term) return;
  var pane = frGetPane();
  if (!pane) return;
  var html = pane.innerHTML.replace(/<mark class="fr-hl[^"]*"[^>]*>([\s\S]*?)<\/mark>/gi, '$1');
  var re = new RegExp(frEscapeRegex(term), 'gi');
  var target = Math.max(0, frCurrentMatch);
  var idx = 0;
  pane.innerHTML = html.replace(re, function(m) { return (idx++ === target) ? replace : m; });
  if (pane.id === 'writingCopyEditor') localStorage.setItem(projectKey('writing_copy'), pane.innerHTML);
  else localStorage.setItem(projectKey('writing_draft'), pane.innerHTML);
  frCurrentMatch = target - 1;
  frHighlightMatches();
  frNavigateMatch(1);
}

function frReplaceAll() {
  var term    = (document.getElementById('fr-find')    || {}).value || '';
  var replace = (document.getElementById('fr-replace') || {}).value || '';
  if (!term) return;
  var pane = frGetPane();
  if (!pane) return;
  var html = pane.innerHTML;
  html = html.replace(/<mark class="fr-hl"[^>]*>([\s\S]*?)<\/mark>/gi, '$1');
  var re = new RegExp(frEscapeRegex(term), 'gi');
  pane.innerHTML = html.replace(re, replace);
  document.getElementById('fr-match-count').textContent = 'Replaced all';
  if (pane.id === 'writingCopyEditor') localStorage.setItem(projectKey('writing_copy'), pane.innerHTML);
  else localStorage.setItem(projectKey('writing_draft'), pane.innerHTML);
  updateWritingWordCounts();
}

document.addEventListener('keydown', function(e) {
  if (e.ctrlKey && e.key === 'h') {
    var panel = document.getElementById('find-replace-panel');
    if (panel) { e.preventDefault(); toggleFindReplace(); }
  }
  if (e.key === 'Escape') {
    if (frPanelVisible) toggleFindReplace();
    if (document.body.classList.contains('distraction-free')) toggleDistractFree();
    if (spotlitColumn) spotlightColumn(spotlitColumn);
  }
});

(function() {
  var fi = document.getElementById('fr-find');
  if (fi) {
    fi.addEventListener('input', function() { frCurrentMatch = -1; frHighlightMatches(); });
    fi.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        frNavigateMatch(e.shiftKey ? -1 : 1);
      }
    });
  }
})();

// ============================================================
// E4 — Distraction-Free Mode
// ============================================================
function toggleDistractFree() {
  document.body.classList.toggle('distraction-free');
}

document.addEventListener('keydown', function(e) {
  if (e.key === 'F11' && document.querySelector('.tab-btn[data-tab="writing"].active')) {
    e.preventDefault();
    toggleDistractFree();
  }
});

// Writing tab button wiring (inline onclick removed — app.js is a module)
document.getElementById('exportTxtBtn').addEventListener('click', function() { exportWritingAs('txt'); });
document.getElementById('exportMdBtn').addEventListener('click', function() { exportWritingAs('md'); });
document.getElementById('focusModeBtn').addEventListener('click', toggleDistractFree);
document.getElementById('df-exit-btn').addEventListener('click', toggleDistractFree);
document.getElementById('frCloseBtn').addEventListener('click', toggleFindReplace);
document.getElementById('frReplaceNextBtn').addEventListener('click', frReplaceNext);
document.getElementById('frReplaceAllBtn').addEventListener('click', frReplaceAll);

// ============================================================
// H1 — Global Card Search
// ============================================================
(function() {
  var input = document.getElementById('cardSearchInput');
  var clearBtn = document.getElementById('cardSearchClear');
  var wrap = document.getElementById('cardSearchWrap');
  if (!input) return;

  input.addEventListener('input', function() {
    cardSearchQuery = input.value;
    var hasQuery = cardSearchQuery.trim().length > 0;
    clearBtn.classList.toggle('hidden', !hasQuery);
    wrap.classList.toggle('has-query', hasQuery);
    renderCards();
  });

  clearBtn.addEventListener('click', function() {
    input.value = '';
    cardSearchQuery = '';
    clearBtn.classList.add('hidden');
    wrap.classList.remove('has-query');
    input.focus();
    renderCards();
  });
})();

// ============================================================
// INITIALIZE — runs when the page first loads
// ============================================================
renderCards();
renderHomePage();
renderArchivePanel();
initApiKeyUx(); // async: loads key from file → localStorage → shows banner if missing

// ============================================================
// SPRINT K: AMBIENT PARTICLE SYSTEM
// ≤25 indigo particles drifting upward, paused when tab is hidden
// ============================================================
(function initParticles() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  var canvas = document.getElementById('particleCanvas');
  if (!canvas) return;
  var ctx = canvas.getContext('2d');
  var COUNT = 22;
  var particles = [];

  function resize() {
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  window.addEventListener('resize', resize);
  resize();

  for (var i = 0; i < COUNT; i++) {
    particles.push({
      x:     Math.random() * window.innerWidth,
      y:     Math.random() * window.innerHeight,
      r:     0.8 + Math.random() * 1.8,
      speed: 0.18 + Math.random() * 0.32,
      drift: (Math.random() - 0.5) * 0.25,
      alpha: 0.06 + Math.random() * 0.14
    });
  }

  function draw() {
    if (document.hidden) { requestAnimationFrame(draw); return; }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (var i = 0; i < particles.length; i++) {
      var p = particles[i];
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(129,140,248,' + p.alpha.toFixed(3) + ')';
      ctx.fill();
      p.y -= p.speed;
      p.x += p.drift;
      if (p.y < -8)                  { p.y = canvas.height + 8; p.x = Math.random() * canvas.width; }
      if (p.x < -8)                  p.x = canvas.width + 8;
      if (p.x > canvas.width + 8)    p.x = -8;
    }
    requestAnimationFrame(draw);
  }
  draw();
}());
