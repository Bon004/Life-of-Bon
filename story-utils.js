export const validTypes = ['character', 'world', 'arc', 'quote', 'idea'];

export function generateId() {
  return Math.random().toString(36).slice(2, 8);
}

export function escapeHtml(str) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  };
  return String(str || '').replace(/[&<>"']/g, function(match) {
    return map[match];
  });
}

export function buildPrompt(existingTitles) {
  return (
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
    'Return only the JSON array, nothing else.'
  );
}

export function buildSyncPrompt(existingTitles) {
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
