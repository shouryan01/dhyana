//! Entity name rules (master plan §4a): comparison keys, safe filenames, kinds and their folders.

use unicode_normalization::UnicodeNormalization;

use crate::vault::validate_date;

/// What a note is. Decided by the folder it lives in.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Kind {
    Journal,
    Person,
    Place,
    Emotion,
    Tag,
    Note,
    Type,
}

impl Kind {
    pub const ALL: [Kind; 7] = [
        Kind::Journal,
        Kind::Person,
        Kind::Place,
        Kind::Emotion,
        Kind::Tag,
        Kind::Note,
        Kind::Type,
    ];

    pub fn dir(self) -> &'static str {
        match self {
            Kind::Journal => "journal",
            Kind::Person => "people",
            Kind::Place => "places",
            Kind::Emotion => "emotions",
            Kind::Tag => "tags",
            Kind::Note => "notes",
            Kind::Type => "types",
        }
    }

    pub fn as_str(self) -> &'static str {
        match self {
            Kind::Journal => "journal",
            Kind::Person => "person",
            Kind::Place => "place",
            Kind::Emotion => "emotion",
            Kind::Tag => "tag",
            Kind::Note => "note",
            Kind::Type => "type",
        }
    }

    pub fn parse(s: &str) -> Option<Kind> {
        Kind::ALL.into_iter().find(|k| k.as_str() == s)
    }

    pub fn from_dir(dir: &str) -> Option<Kind> {
        Kind::ALL.into_iter().find(|k| k.dir() == dir)
    }

    /// Kinds a user can create and rename from the UI.
    pub fn is_entity(self) -> bool {
        matches!(
            self,
            Kind::Person | Kind::Place | Kind::Emotion | Kind::Tag | Kind::Note
        )
    }
}

#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum NameError {
    #[error("name is empty")]
    Empty,
    #[error("\"{0}\" looks like a date; those names are reserved for journal days")]
    DateShaped(String),
}

/// Case-insensitive, Unicode-normalized comparison key. Same on every platform.
pub fn key(s: &str) -> String {
    s.trim().nfc().collect::<String>().to_lowercase()
}

const ILLEGAL: &[char] = &[
    '<', '>', ':', '"', '/', '\\', '|', '?', '*', '[', ']', '#', '^',
];
const RESERVED: &[&str] = &[
    "con", "prn", "aux", "nul", "com1", "com2", "com3", "com4", "com5", "com6", "com7", "com8",
    "com9", "lpt1", "lpt2", "lpt3", "lpt4", "lpt5", "lpt6", "lpt7", "lpt8", "lpt9",
];

/// A filename stem for `name`: illegal characters replaced, NFC, no trailing dots or spaces.
/// The caller keeps the original in `title:` when this differs from the input.
pub fn file_stem(name: &str) -> Result<String, NameError> {
    let nfc: String = name.nfc().collect();
    let mut out = String::with_capacity(nfc.len());
    for ch in nfc.chars() {
        out.push(if ILLEGAL.contains(&ch) || ch.is_control() {
            '-'
        } else {
            ch
        });
    }
    let collapsed = out.split_whitespace().collect::<Vec<_>>().join(" ");
    let mut stem: String = collapsed
        .trim_matches(|c: char| c == '.' || c == ' ')
        .chars()
        .take(100)
        .collect();
    stem = stem.trim_end_matches(['.', ' ']).to_string();
    if stem.is_empty() {
        return Err(NameError::Empty);
    }
    if validate_date(&stem).is_ok() {
        return Err(NameError::DateShaped(stem));
    }
    if RESERVED.contains(&stem.to_lowercase().as_str()) {
        stem.push('_');
    }
    Ok(stem)
}

/// Filename stem for a name that clashes with another kind: `Paris (place)`.
pub fn disambiguated(stem: &str, kind: Kind) -> String {
    format!("{stem} ({})", kind.as_str())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keys_ignore_case_and_unicode_form() {
        assert_eq!(key("Alice"), key("  alice "));
        // "é" precomposed vs "e" + combining acute
        assert_eq!(key("Ren\u{e9}"), key("Rene\u{301}"));
        assert_ne!(key("Alice"), key("Alicia"));
    }

    #[test]
    fn stems_replace_illegal_characters() {
        assert_eq!(file_stem("AC/DC: live?").unwrap(), "AC-DC- live-");
        assert_eq!(file_stem("  Cafe   Nero. ").unwrap(), "Cafe Nero");
        assert_eq!(file_stem("a|b[c]#d").unwrap(), "a-b-c--d");
        assert_eq!(file_stem("CON").unwrap(), "CON_");
    }

    #[test]
    fn stems_reject_empty_and_dates() {
        assert_eq!(file_stem("   "), Err(NameError::Empty));
        assert_eq!(file_stem("..."), Err(NameError::Empty));
        assert!(matches!(
            file_stem("2026-12-25"),
            Err(NameError::DateShaped(_))
        ));
        assert!(file_stem("2026-12-25 party").is_ok());
    }

    #[test]
    fn kinds_round_trip() {
        for k in Kind::ALL {
            assert_eq!(Kind::parse(k.as_str()), Some(k));
            assert_eq!(Kind::from_dir(k.dir()), Some(k));
        }
        assert_eq!(Kind::parse("nope"), None);
    }

    #[test]
    fn disambiguation_suffix() {
        assert_eq!(disambiguated("Paris", Kind::Place), "Paris (place)");
    }
}
