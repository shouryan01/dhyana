# Backlog (post 0.8)

- **Deferred from 0.1:** slash menu, image paste (`assets/`), focus/typewriter mode. Schedule once 0.1 has been used for a week. (Command palette moved into 0.1.)
- Mobile: for now, use Obsidian (or another markdown app) on the synced vault; see `docs/mobile.md`. A Tauri mobile / capture app is a later option.

- **Demo journals:** downloadable sample vault written from a famous perspective (e.g., Dwight Schrute: Jim's pranks, Angela, beets/farm). Shipped as a vault zip with entities, moods, and entries; good for demoing analytics and AI. Generate with an LLM, then curate by hand; avoid presenting it as real.
- Local Whisper dictation; cloud dictation API option.
- ChatGPT GPT / Gemini Gem integrations (needs a public HTTPS relay, conflicts with offline-first; investigate).
- Reranker (if eval demands).
- Scheduled agent recipes (SoloMD style): weekly review, monthly summary.
- Multimodal quick capture (photos, voice memos, screenshots) à la NoteGen.
- Mobile (Tauri mobile) or a companion capture app, if Obsidian proves insufficient.
- Native Google Drive/iCloud API sync.
- Additional themes, custom fonts. (Dhyana light/dark and Basic light/dark shipped in 0.1.)
- Source-peek (raw markdown) for tricky constructs — only if absolutely needed; conflicts with "no source mode" preference.
