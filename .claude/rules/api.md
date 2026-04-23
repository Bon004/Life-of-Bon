# Claude API Rules

- Model: `claude-sonnet-4-5-20250929`
- Browser calls require header: `anthropic-dangerous-direct-browser-access: true`
- Always check `stop_reason === 'max_tokens'` on every API response — log a console warning if hit; a truncated response silently returns `[]` with no error
- CHUNK_SIZE target: ~10K chars — sized to stay within the `max_tokens` budget (30K+ chunks exceed token limits and cause silent failures)
