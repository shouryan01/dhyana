# Release 0.9 — User-Defined Types & Typed Relations

**Goal:** let the vault model things beyond the built-in person/place/emotion/tag, and express how entities relate. Pushed out of 0.2 to keep that release small.

## Scope

- **User-defined types:** define a new type (name, icon, color, fields) as a note in `types/`. Fields validated by the same shared schema layer as built-ins. Entity pages and `@`-style suggestion get a trigger for new types only if it fits the trigger rules (see master §4); otherwise create via command.
- **Typed relations:** relations between entities (e.g. Alice → `manager_of` → me), stored in YAML as wikilinks. Relation vocabulary is editable; inverse relations derived by the index, not duplicated in files.
- Relationship timeline per person built on relations.
- Rename of a type or relation updates all files that use it.
- Migration: existing free-text `relationship` property on people stays valid; offer (never force) conversion to a typed relation.

## Not in 0.9

AI-suggested types or relations (any AI classification is labeled AI-derived and arrives with 0.7+ features).

## Exit criteria

- [ ] Define a type, create an entity of it, see it in the index and backlinks.
- [ ] A relation shows on both entities; deleting the index and rebuilding gives identical results.
- [ ] Vault still reads sensibly in Obsidian.

## Reference study

Tolaria (types/relations), SoloMD (typed relations).
