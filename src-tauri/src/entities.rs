//! Entity notes (people, places, emotions, tags): create, edit, rename, and the seeded defaults.
//!
//! Files are the truth. Every operation changes files first, then asks the index to re-read just
//! those files. Names follow master plan §4a.

use std::fs;
use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::frontmatter;
use crate::index::{EntitySummary, Index, IndexError, Mention};
use crate::links;
use crate::names::{self, Kind, NameError};
use crate::vault::{self, StagedWrite, VaultError};
use crate::yaml;

#[derive(Debug, thiserror::Error)]
pub enum EntityError {
    #[error("{0}")]
    Name(#[from] NameError),
    #[error("\"{name}\" already exists ({path})")]
    Exists { name: String, path: String },
    #[error("\"{alias}\" is already an alias of {other}")]
    AliasTaken { alias: String, other: String },
    #[error("\"{0}\" is not a date (use YYYY-MM-DD)")]
    BadDate(String),
    #[error("not an editable entity: {0}")]
    NotEntity(String),
    #[error("{0} notes can't be renamed here yet")]
    CantRename(&'static str),
    #[error("{0}")]
    Vault(#[from] VaultError),
    #[error("{0}")]
    Index(#[from] IndexError),
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
}

type Result<T> = std::result::Result<T, EntityError>;

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct EntityDetail {
    #[serde(flatten)]
    pub summary: EntitySummary,
    pub relationship: Option<String>,
    pub birthday: Option<String>,
    /// The note's free text (everything after the frontmatter).
    pub notes: String,
    pub backlinks: Vec<Mention>,
}

/// Fields to change; `None` leaves a field alone, an empty string clears it.
#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct EntityPatch {
    pub title: Option<String>,
    pub aliases: Option<Vec<String>>,
    pub relationship: Option<String>,
    pub birthday: Option<String>,
    pub notes: Option<String>,
}

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct RenameResult {
    pub entity: EntitySummary,
    /// How many other notes had links rewritten.
    pub updated_notes: usize,
}

const MENTION_LIMIT: usize = 200;

/// The indexed entity at `rel`. Because the path must be in the index, callers can never reach
/// outside the entity folders with a crafted path.
fn entity_at(idx: &Index, rel: &str) -> Result<(EntitySummary, Kind)> {
    let summary = idx
        .summary(rel)?
        .ok_or_else(|| EntityError::NotEntity(rel.to_string()))?;
    match Kind::parse(&summary.kind) {
        Some(k) if k.is_entity() => Ok((summary, k)),
        _ => Err(EntityError::NotEntity(rel.to_string())),
    }
}

fn write_atomic(abs: &Path, text: &str) -> Result<()> {
    if let Some(dir) = abs.parent() {
        fs::create_dir_all(dir)?;
    }
    StagedWrite::stage(abs, text.as_bytes())?.commit()?;
    Ok(())
}

fn nonempty(s: &str) -> Option<&str> {
    let t = s.trim();
    (!t.is_empty()).then_some(t)
}

fn assemble(bom: bool, block: &str, eol: &str, body: &str) -> String {
    let mut out = String::with_capacity(block.len() + body.len() + 4);
    if bom {
        out.push('\u{feff}');
    }
    out.push_str(block);
    if !block.is_empty() && !block.ends_with('\n') && !body.is_empty() {
        out.push_str(eol);
    }
    out.push_str(body);
    out
}

pub fn create(vault: &Path, idx: &mut Index, kind: Kind, name: &str) -> Result<EntitySummary> {
    if !kind.is_entity() {
        return Err(EntityError::NotEntity(kind.as_str().to_string()));
    }
    let display = name.trim();
    let stem = names::file_stem(display)?;
    let exists = |idx: &Index, key: &str| -> Result<()> {
        match idx.same_kind_with_key(kind, key)? {
            Some(path) => Err(EntityError::Exists { name: display.to_string(), path }),
            None => Ok(()),
        }
    };
    exists(idx, &names::key(display))?;
    exists(idx, &names::key(&stem))?;

    let mut file = stem.clone();
    let mut disambiguated = false;
    if !idx.by_name_key(&names::key(&file))?.is_empty() {
        file = names::disambiguated(&stem, kind);
        disambiguated = true;
        if let Some((path, _)) = idx.by_name_key(&names::key(&file))?.into_iter().next() {
            return Err(EntityError::Exists { name: display.to_string(), path });
        }
    }
    let rel = format!("{}/{}.md", kind.dir(), file);
    let abs = vault.join(&rel);
    if abs.exists() {
        return Err(EntityError::Exists { name: display.to_string(), path: rel });
    }

    let now = vault::now_string();
    let id = ulid::Ulid::generate().to_string();
    let mut block = yaml::set_scalar("", "\n", "id", Some(&id));
    block = yaml::set_scalar(&block, "\n", "type", Some(kind.as_str()));
    if file != display || stem != display {
        block = yaml::set_scalar(&block, "\n", "title", Some(display));
    }
    // The clashing name stays reachable as an alias, unless another note already claims it.
    if disambiguated
        && kind != Kind::Tag
        && idx.alias_owner(&names::key(display), "")?.is_none()
    {
        block = yaml::set_list(&block, "\n", "aliases", &[display.to_string()]);
    }
    block = yaml::set_scalar(&block, "\n", "created", Some(&now));

    write_atomic(&abs, &block)?;
    idx.refresh(vault, std::slice::from_ref(&rel))?;
    idx.summary(&rel)?.ok_or(EntityError::NotEntity(rel))
}

pub fn detail(vault: &Path, idx: &Index, rel: &str) -> Result<EntityDetail> {
    let (summary, _) = entity_at(idx, rel)?;
    let text = fs::read_to_string(vault.join(rel))?;
    let (relationship, birthday) = idx.props(rel)?;
    Ok(EntityDetail {
        backlinks: idx.mentions(rel, MENTION_LIMIT)?,
        notes: frontmatter::split(&text).body.to_string(),
        summary,
        relationship,
        birthday,
    })
}

pub fn update(vault: &Path, idx: &mut Index, rel: &str, patch: EntityPatch) -> Result<EntityDetail> {
    entity_at(idx, rel)?;
    let abs = vault.join(rel);
    let (text, _) = vault::read_raw(&abs)?.ok_or_else(|| EntityError::NotEntity(rel.to_string()))?;
    let s = frontmatter::split(&text);
    let eol = frontmatter::detect_eol(&text);
    let mut block = s.block.to_string();

    if let Some(t) = &patch.title {
        block = yaml::set_scalar(&block, eol, "title", nonempty(t));
    }
    if let Some(list) = &patch.aliases {
        let mut seen = std::collections::HashSet::new();
        let mut clean = Vec::new();
        for a in list.iter().filter_map(|a| nonempty(a)) {
            let key = names::key(a);
            if !seen.insert(key.clone()) {
                continue;
            }
            if let Some((_, other)) = idx.alias_owner(&key, rel)? {
                return Err(EntityError::AliasTaken { alias: a.to_string(), other });
            }
            clean.push(a.to_string());
        }
        block = yaml::set_list(&block, eol, "aliases", &clean);
    }
    if let Some(r) = &patch.relationship {
        block = yaml::set_scalar(&block, eol, "relationship", nonempty(r));
    }
    if let Some(b) = &patch.birthday {
        if let Some(b) = nonempty(b) {
            vault::validate_date(b).map_err(|_| EntityError::BadDate(b.to_string()))?;
        }
        block = yaml::set_scalar(&block, eol, "birthday", nonempty(b));
    }
    // Hand-made notes get the same identity keys the app writes.
    if !yaml::has_key(&block, "id") {
        block = yaml::set_scalar(&block, eol, "id", Some(&ulid::Ulid::generate().to_string()));
    }
    if !yaml::has_key(&block, "type") {
        let kind = Kind::parse(&entity_at(idx, rel)?.0.kind).map_or("person", Kind::as_str);
        block = yaml::set_scalar(&block, eol, "type", Some(kind));
    }

    let body = match &patch.notes {
        Some(n) => n.replace("\r\n", "\n").replace('\n', eol),
        None => s.body.to_string(),
    };
    let out = assemble(s.bom, &block, eol, &body);
    if out != text {
        write_atomic(&abs, &out)?;
        idx.refresh(vault, &[rel.to_string()])?;
    }
    detail(vault, idx, rel)
}

pub fn rename(vault: &Path, idx: &mut Index, rel: &str, new_name: &str) -> Result<RenameResult> {
    let (old, kind) = entity_at(idx, rel)?;
    if kind == Kind::Tag {
        return Err(EntityError::CantRename("tag"));
    }
    let display = new_name.trim();
    let new_stem = names::file_stem(display)?;
    let old_key = names::key(&old.name);
    let new_key = names::key(&new_stem);

    let clash = |path: String| EntityError::Exists { name: display.to_string(), path };
    for (path, _) in idx.by_name_key(&new_key)? {
        if path != rel {
            return Err(clash(path));
        }
    }
    if let Some(path) = idx.same_kind_with_key(kind, &names::key(display))? {
        if path != rel {
            return Err(clash(path));
        }
    }

    let new_rel = format!("{}/{}.md", kind.dir(), new_stem);
    let (old_abs, new_abs) = (vault.join(rel), vault.join(&new_rel));
    if rel != new_rel {
        fs::rename(&old_abs, &new_abs)?;
    }

    // The display name lives in `title:` whenever it can't be the filename itself.
    let text = fs::read_to_string(&new_abs)?;
    let s = frontmatter::split(&text);
    let eol = frontmatter::detect_eol(&text);
    let title = (new_stem != display).then_some(display);
    let block = yaml::set_scalar(s.block, eol, "title", title);
    let out = assemble(s.bom, &block, eol, s.body);
    if out != text {
        write_atomic(&new_abs, &out)?;
    }

    // Rewrite `[[Old]]` -> `[[New]]` in every note that links to the old filename.
    let mut touched = vec![rel.to_string(), new_rel.clone()];
    let mut updated_notes = 0;
    if old_key != new_key || old.name != new_stem {
        for src in idx.linking_to(&old_key)? {
            let src_rel = if src == rel { new_rel.clone() } else { src };
            let path = vault.join(&src_rel);
            let Ok(text) = fs::read_to_string(&path) else { continue };
            let s = frontmatter::split(&text);
            let (body, n) = links::rewrite_links(s.body, &old_key, &new_stem);
            if n == 0 {
                continue;
            }
            write_atomic(&path, &assemble(s.bom, s.block, "", &body))?;
            touched.push(src_rel.clone());
            if src_rel != new_rel {
                updated_notes += 1;
            }
        }
    }
    idx.refresh(vault, &touched)?;
    let entity = idx
        .summary(&new_rel)?
        .ok_or_else(|| EntityError::NotEntity(new_rel))?;
    Ok(RenameResult { entity, updated_notes })
}

const EMOTIONS: &[&str] = &[
    "calm", "content", "grateful", "hopeful", "joyful", "excited", "proud", "loved", "peaceful",
    "curious", "relieved", "amused", "sad", "anxious", "angry", "frustrated", "lonely", "tired",
    "overwhelmed", "stressed", "bored", "guilty", "afraid", "disappointed",
];

/// (name, icon, extra fields) for the built-in type definitions in `types/`.
const TYPES: &[(&str, &str, &str)] = &[
    ("journal", "book-open", "date, mood, private"),
    ("person", "user", "aliases, relationship, birthday"),
    ("place", "map-pin", "aliases"),
    ("emotion", "smile", "aliases"),
    ("tag", "hash", "aliases"),
];

/// Write the built-in type definitions and the starter emotion vocabulary, but only into folders
/// that don't exist yet, so deleting or editing one is never undone.
pub fn ensure_seeded(vault: &Path) -> Result<()> {
    let now = vault::now_string();
    let id = || ulid::Ulid::generate().to_string();
    if !vault.join(Kind::Type.dir()).exists() {
        for (name, icon, fields) in TYPES {
            let mut b = yaml::set_scalar("", "\n", "id", Some(&id()));
            b = yaml::set_scalar(&b, "\n", "type", Some("type"));
            b = yaml::set_scalar(&b, "\n", "name", Some(name));
            b = yaml::set_scalar(&b, "\n", "icon", Some(icon));
            b = yaml::set_scalar(&b, "\n", "fields", Some(&format!("[{fields}]")));
            b = yaml::set_scalar(&b, "\n", "created", Some(&now));
            write_atomic(&vault.join(format!("types/{name}.md")), &b)?;
        }
    }
    if !vault.join(Kind::Emotion.dir()).exists() {
        for name in EMOTIONS {
            let mut b = yaml::set_scalar("", "\n", "id", Some(&id()));
            b = yaml::set_scalar(&b, "\n", "type", Some("emotion"));
            b = yaml::set_scalar(&b, "\n", "created", Some(&now));
            write_atomic(&vault.join(format!("emotions/{name}.md")), &b)?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::{tempdir, TempDir};

    fn setup() -> (TempDir, Index) {
        let dir = tempdir().unwrap();
        let mut idx = Index::open_in_memory().unwrap();
        idx.sync(dir.path()).unwrap();
        (dir, idx)
    }

    fn put(v: &Path, rel: &str, text: &str) {
        let p = v.join(rel);
        fs::create_dir_all(p.parent().unwrap()).unwrap();
        fs::write(p, text).unwrap();
    }

    #[test]
    fn create_writes_a_valid_note_and_indexes_it() {
        let (dir, mut idx) = setup();
        let e = create(dir.path(), &mut idx, Kind::Person, "  Alice  ").unwrap();
        assert_eq!((e.path.as_str(), e.kind.as_str(), e.display.as_str()), ("people/Alice.md", "person", "Alice"));
        let text = fs::read_to_string(dir.path().join("people/Alice.md")).unwrap();
        assert!(text.starts_with("---\nid: "));
        assert!(text.contains("\ntype: person\n"));
        assert!(!text.contains("title:"));
        assert!(text.ends_with("---\n"));
        assert_eq!(idx.entities().unwrap().len(), 1);
    }

    #[test]
    fn same_kind_duplicates_and_bad_names_are_rejected() {
        let (dir, mut idx) = setup();
        create(dir.path(), &mut idx, Kind::Person, "Alice").unwrap();
        assert!(matches!(create(dir.path(), &mut idx, Kind::Person, "alice"), Err(EntityError::Exists { .. })));
        assert!(matches!(create(dir.path(), &mut idx, Kind::Person, "  "), Err(EntityError::Name(NameError::Empty))));
        assert!(matches!(create(dir.path(), &mut idx, Kind::Person, "2026-12-25"), Err(EntityError::Name(NameError::DateShaped(_)))));
        assert!(create(dir.path(), &mut idx, Kind::Journal, "x").is_err());
    }

    #[test]
    fn cross_kind_clash_gets_a_disambiguated_filename_title_and_alias() {
        let (dir, mut idx) = setup();
        create(dir.path(), &mut idx, Kind::Person, "Paris").unwrap();
        let place = create(dir.path(), &mut idx, Kind::Place, "Paris").unwrap();
        assert_eq!(place.path, "places/Paris (place).md");
        assert_eq!(place.display, "Paris");
        assert_eq!(place.aliases, vec!["Paris"]);
        let text = fs::read_to_string(dir.path().join(&place.path)).unwrap();
        assert!(text.contains("title: Paris\n"));
        assert!(text.contains("aliases: [Paris]\n"));
        // And a second "Paris" place is a duplicate, found through its title.
        assert!(matches!(create(dir.path(), &mut idx, Kind::Place, "Paris"), Err(EntityError::Exists { .. })));
    }

    #[test]
    fn illegal_characters_move_the_original_to_title() {
        let (dir, mut idx) = setup();
        let e = create(dir.path(), &mut idx, Kind::Place, "AC/DC: Bar").unwrap();
        assert_eq!(e.path, "places/AC-DC- Bar.md");
        assert_eq!(e.display, "AC/DC: Bar");
        let text = fs::read_to_string(dir.path().join(&e.path)).unwrap();
        assert!(text.contains("title: \"AC/DC: Bar\"\n"));
    }

    #[test]
    fn update_edits_only_the_touched_lines() {
        let (dir, mut idx) = setup();
        put(
            dir.path(),
            "people/Alice.md",
            "---\r\n# my note\r\nid: X\r\ntype: person\r\nrelationship: friend # since 2010\r\nextra: keep\r\n---\r\nOld notes\r\n",
        );
        idx.sync(dir.path()).unwrap();
        let d = update(
            dir.path(),
            &mut idx,
            "people/Alice.md",
            EntityPatch {
                relationship: Some("sister".into()),
                aliases: Some(vec!["Ali".into(), "ali".into(), " ".into(), "Al".into()]),
                birthday: Some("1990-05-02".into()),
                notes: Some("New\nnotes".into()),
                ..Default::default()
            },
        )
        .unwrap();
        assert_eq!(d.relationship.as_deref(), Some("sister"));
        assert_eq!(d.birthday.as_deref(), Some("1990-05-02"));
        assert_eq!(d.summary.aliases, vec!["Ali", "Al"]);
        assert_eq!(d.notes, "New\r\nnotes");
        let text = fs::read_to_string(dir.path().join("people/Alice.md")).unwrap();
        assert_eq!(
            text,
            "---\r\n# my note\r\nid: X\r\ntype: person\r\nrelationship: sister # since 2010\r\nextra: keep\r\naliases: [Ali, Al]\r\nbirthday: 1990-05-02\r\n---\r\nNew\r\nnotes"
        );
    }

    #[test]
    fn update_without_changes_writes_nothing_and_validates() {
        let (dir, mut idx) = setup();
        put(dir.path(), "people/Alice.md", "---\nid: X\ntype: person\n---\nhi\n");
        put(dir.path(), "people/Bob.md", "---\nid: Y\ntype: person\naliases: [Bobby]\n---\n");
        idx.sync(dir.path()).unwrap();
        let p = dir.path().join("people/Alice.md");
        let before = fs::metadata(&p).unwrap().modified().unwrap();
        std::thread::sleep(std::time::Duration::from_millis(30));
        update(dir.path(), &mut idx, "people/Alice.md", EntityPatch::default()).unwrap();
        assert_eq!(fs::metadata(&p).unwrap().modified().unwrap(), before);

        let err = update(
            dir.path(),
            &mut idx,
            "people/Alice.md",
            EntityPatch { aliases: Some(vec!["BOBBY".into()]), ..Default::default() },
        )
        .unwrap_err();
        assert_eq!(err.to_string(), "\"BOBBY\" is already an alias of Bob");
        assert!(matches!(
            update(dir.path(), &mut idx, "people/Alice.md", EntityPatch { birthday: Some("nope".into()), ..Default::default() }),
            Err(EntityError::BadDate(_))
        ));
    }

    #[test]
    fn update_adds_identity_keys_to_hand_made_notes() {
        let (dir, mut idx) = setup();
        put(dir.path(), "people/Carl.md", "Just some text\n");
        idx.sync(dir.path()).unwrap();
        update(dir.path(), &mut idx, "people/Carl.md", EntityPatch { relationship: Some("neighbour".into()), ..Default::default() }).unwrap();
        let text = fs::read_to_string(dir.path().join("people/Carl.md")).unwrap();
        assert!(text.starts_with("---\nrelationship: neighbour\nid: "));
        assert!(text.contains("\ntype: person\n---\nJust some text\n"));
    }

    #[test]
    fn only_indexed_entities_can_be_touched() {
        let (dir, mut idx) = setup();
        put(dir.path(), "journal/2026/10/2026-10-28.md", "x");
        idx.sync(dir.path()).unwrap();
        for bad in ["journal/2026/10/2026-10-28.md", "../outside.md", "people/Nobody.md", "settings.json"] {
            assert!(update(dir.path(), &mut idx, bad, EntityPatch::default()).is_err(), "{bad}");
            assert!(rename(dir.path(), &mut idx, bad, "X").is_err(), "{bad}");
        }
    }

    #[test]
    fn rename_moves_the_file_and_rewrites_every_link() {
        let (dir, mut idx) = setup();
        put(dir.path(), "people/Alice.md", "---\nid: A\ntype: person\naliases: [Ali]\n---\nSee [[Alice]] herself.\n");
        put(dir.path(), "journal/2026/10/2026-10-27.md", "---\nid: J\n---\nMet [[Alice]], [[alice|my friend]], [[Alice#x]] and [[Ali]] and `[[Alice]]`.\r\n");
        put(dir.path(), "journal/2026/10/2026-10-28.md", "Nothing about her. [[Bob]]\n");
        idx.sync(dir.path()).unwrap();

        let r = rename(dir.path(), &mut idx, "people/Alice.md", "Alicia").unwrap();
        assert_eq!(r.entity.path, "people/Alicia.md");
        assert_eq!(r.updated_notes, 1);
        assert!(!dir.path().join("people/Alice.md").exists());
        let day = fs::read_to_string(dir.path().join("journal/2026/10/2026-10-27.md")).unwrap();
        assert_eq!(
            day,
            "---\nid: J\n---\nMet [[Alicia]], [[Alicia|my friend]], [[Alicia#x]] and [[Ali]] and `[[Alice]]`.\r\n"
        );
        let own = fs::read_to_string(dir.path().join("people/Alicia.md")).unwrap();
        assert!(own.contains("See [[Alicia]] herself."));
        assert_eq!(fs::read_to_string(dir.path().join("journal/2026/10/2026-10-28.md")).unwrap(), "Nothing about her. [[Bob]]\n");
        // Backlinks survive the rename, including the one through the alias.
        let d = detail(dir.path(), &idx, "people/Alicia.md").unwrap();
        assert_eq!(d.summary.mentions, 4);
        assert_eq!(d.backlinks.len(), 4);
    }

    #[test]
    fn rename_to_a_name_with_illegal_characters_sets_title() {
        let (dir, mut idx) = setup();
        create(dir.path(), &mut idx, Kind::Place, "Cafe").unwrap();
        let r = rename(dir.path(), &mut idx, "places/Cafe.md", "Cafe: Nero").unwrap();
        assert_eq!(r.entity.path, "places/Cafe- Nero.md");
        assert_eq!(r.entity.display, "Cafe: Nero");
        let back = rename(dir.path(), &mut idx, "places/Cafe- Nero.md", "Cafe Nero").unwrap();
        assert_eq!(back.entity.display, "Cafe Nero");
        assert!(back.entity.title.is_none());
    }

    #[test]
    fn rename_rejects_collisions_but_allows_case_changes() {
        let (dir, mut idx) = setup();
        create(dir.path(), &mut idx, Kind::Person, "Alice").unwrap();
        create(dir.path(), &mut idx, Kind::Person, "Bob").unwrap();
        create(dir.path(), &mut idx, Kind::Place, "Rome").unwrap();
        assert!(matches!(rename(dir.path(), &mut idx, "people/Bob.md", "alice"), Err(EntityError::Exists { .. })));
        assert!(matches!(rename(dir.path(), &mut idx, "people/Bob.md", "ROME"), Err(EntityError::Exists { .. })));
        assert!(matches!(rename(dir.path(), &mut idx, "people/Bob.md", "2026-01-01"), Err(EntityError::Name(_))));
        let r = rename(dir.path(), &mut idx, "people/Alice.md", "ALICE").unwrap();
        assert_eq!(r.entity.name, "ALICE");
        let names: Vec<_> = fs::read_dir(dir.path().join("people")).unwrap().flatten().map(|e| e.file_name().to_string_lossy().into_owned()).collect();
        assert!(names.contains(&"ALICE.md".to_string()), "{names:?}");
        assert!(rename(dir.path(), &mut idx, "places/Rome.md", "x").is_ok());
    }

    #[test]
    fn tags_cannot_be_renamed_yet() {
        let (dir, mut idx) = setup();
        let t = create(dir.path(), &mut idx, Kind::Tag, "work").unwrap();
        assert!(matches!(rename(dir.path(), &mut idx, &t.path, "job"), Err(EntityError::CantRename(_))));
    }

    #[test]
    fn seeding_fills_missing_folders_once() {
        let (dir, mut idx) = setup();
        ensure_seeded(dir.path()).unwrap();
        idx.sync(dir.path()).unwrap();
        assert_eq!(idx.entities().unwrap().len(), EMOTIONS.len());
        assert!(dir.path().join("types/person.md").exists());
        let sad = fs::read_to_string(dir.path().join("emotions/sad.md")).unwrap();
        assert!(sad.contains("type: emotion"));
        // Edits and deletions are respected on the next launch.
        fs::remove_file(dir.path().join("emotions/sad.md")).unwrap();
        ensure_seeded(dir.path()).unwrap();
        assert!(!dir.path().join("emotions/sad.md").exists());
    }
}
