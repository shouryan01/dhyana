# Release 0.6 — AI Editing

## Scope
- **Selection menu:** select text → floating menu (rewrite, shorten, expand, fix grammar, custom prompt) scoped strictly to the selection.
- **Surgical edits:** AI returns structured operations (anchor text + replace/insert/delete with context), not whole-document rewrites. Reject proposals whose anchors don't match uniquely.
- **Edit review modes (toggle):**
  - *Review before apply:* proposals shown as ProseMirror decorations — red removed, green added — with per-hunk accept/reject and accept-all/reject-all. Nothing written to disk until accepted.
  - *Review after apply:* edits apply immediately, shown as diff marks you can revert; a Git checkpoint is created first.
- Edits pass through the same validation as UI actions (frontmatter/schema edits cannot violate types).
- Doc-version guard: if the user typed since proposal creation, rebase or invalidate the proposal.
- **Multiple chats/agents:** session list, rename/archive, run several concurrently; per-session context and mode; sessions stored in `.dhyana/` (optionally exportable as markdown).
- Undo integration: AI edits are single undo steps; Git history shows AI-authored commits.

## Exit criteria
- [ ] Accept/reject single hunks without disturbing the rest of the document.
- [ ] Round-trip remains lossless after accepted edits.
- [ ] Killing the app mid-proposal loses no user text.

## Reference study
Paperling (inline accept/reject), ScribeDog (review-before-write), Tiptap/ProseMirror suggestion-mode examples.
