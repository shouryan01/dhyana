# Release 0.7 — Retrieval & Companion

## Retrieval (staged)
1. **Metadata + FTS retrieval tool** (already exists since 0.4) wired into chat as the first-line retrieval.
2. **Local embeddings:** bundled small model (ONNX/candle), chunk by section/paragraph, store in sqlite-vec in app data (not in the vault); purge vectors when a file becomes `private`; incremental re-embed on change; honor `private` flag.
3. **Hybrid ranking:** metadata filters first, then FTS + vector fusion (RRF).
4. **Reranker:** only if evaluation shows quality problems. Build a small eval set of real questions first.
- Source-linked answers open the exact passage.

## Companion
- **Proactive prompts sidebar** (fast model), predictable triggers only:
  - blank today's entry → one starter question
  - after mood check-in → one relevant follow-up
  - person mentioned with a notable history → prompt based on past sentiment (e.g., positive about Alice, negative about manager)
  - weekly review offer
  - user-requested reflection
- Dismissal is remembered; no per-keystroke inference; throttle and cache.
- **Person summaries:** AI generates a summary block in a person file inside marked comment delimiters; user approves/edits/regenerates; labeled AI-derived.
- **Confirmed memory (Kuku idea):** "Remember that you prefer reflective questions?" → proposal → accept/reject → stored as a visible markdown note.
- AI-derived topics added to analytics, visually distinguished.

## Exit criteria
- [ ] Eval set: retrieval answers cite correct entries on >80% of your questions.
- [ ] No prompt shown twice after dismissal.
- [ ] Reindex of 3 years completes in acceptable time on your machine.

## Reference study
NoteGen (retrieval), ScribeDog (folder permissions, source UX), Kuku (reviewable memory), SoloMD (recipes/triggers).
