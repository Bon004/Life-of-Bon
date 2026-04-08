import { describe, expect, it } from 'vitest';
import { escapeHtml, generateId, buildPrompt, buildSyncPrompt, validTypes } from '../story-utils.js';

describe('story-utils', () => {
  it('generateId returns a short string', () => {
    const id = generateId();
    expect(id).toBeTypeOf('string');
    expect(id.length).toBeGreaterThanOrEqual(6);
  });

  it('escapeHtml protects against tags', () => {
    expect(escapeHtml('<b>bold</b>')).toBe('&lt;b&gt;bold&lt;/b&gt;');
  });

  it('buildPrompt includes existing title rules', () => {
    const prompt = buildPrompt(['Bon', 'World']);
    expect(prompt).toContain('Skip anything matching these already-existing titles: Bon, World');
    expect(prompt).toContain('Return only the JSON array, nothing else.');
  });

  it('buildSyncPrompt uses the same structure for sync jobs', () => {
    const syncPrompt = buildSyncPrompt(['Example']);
    expect(syncPrompt).toContain('Skip anything matching these already-existing titles: Example');
    expect(syncPrompt).toContain('- Maximum 15 new cards per file');
    expect(validTypes).toContain('character');
  });
});
