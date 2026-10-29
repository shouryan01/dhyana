# Release 0.5 — AI Foundation

**AI is optional. A single master switch disables all AI code paths, network calls and UI.**

## Scope
- **Provider abstraction (Rust trait):** local OpenAI-compatible endpoint (Ollama/LM Studio), BYO cloud keys (Anthropic, OpenAI, Gemini, Groq, OpenRouter). Keys in OS keychain, never in the vault.
- **Privacy layer:** explicit consent screen per cloud provider; show exactly what context will be sent; per-entry `private: true` excluded from all AI context and cloud embeddings; per-folder allow list; retrieval off by default per conversation.
- **Chat sidebar:** streaming responses, context attachments (current note, selection, specific entries/people), custom assistant instructions, source chips that link to passages.
- **AI tool contract (single definition):** `read_entry`, `list_entries(filters)`, `search`, `get_person`, `list_people`, `propose_edit` (stub until 0.6). All tools call the same Rust validation/index services as the UI.
- **MCP server:** exposes the tool contract so Claude Desktop/Code etc. can use the journal; respects privacy flags and a read-only default; off by default. Runs as a separate local process launched by the client, so it needs its own safe vault/index access. Counts as cloud egress: same consent screen and request log as cloud providers.
- Fast model option for sidebar nudges (e.g. Groq) configured separately from chat model.
- Usage/token display and a request log (local) so you can audit what was sent.

## Not in 0.5
Editing the document (read-only AI), vectors, proactive prompts.

## Exit criteria
- [ ] With AI disabled: zero outbound requests (verify with network monitor).
- [ ] Private entries never appear in any tool result, search snippet, backlink list, aggregate, or person summary visible to AI/MCP.
- [ ] Claude Desktop can query the journal through MCP.

## Reference study
ScribeDog (chat sessions, context, source links), NoteGen (agent tools).
