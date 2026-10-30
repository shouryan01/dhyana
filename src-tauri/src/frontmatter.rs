//! Byte-exact, line-level frontmatter handling.
//!
//! We never parse YAML. We only find the `---` block, read a few top-level
//! scalar keys, and insert/replace whole lines, so user comments, ordering and
//! formatting survive untouched.

/// A file split into its (optional) BOM, frontmatter block, and body.
#[derive(Debug, PartialEq, Eq)]
pub struct Split<'a> {
    pub bom: bool,
    /// The whole block, delimiters and trailing line ending included. Empty if none.
    pub block: &'a str,
    pub body: &'a str,
}

const BOM: char = '\u{feff}';

fn line_content(line: &str) -> &str {
    line.trim_end_matches(['\r', '\n'])
}

/// Split a file into BOM, frontmatter block and body.
///
/// A block exists only if the first line is `---` (trailing whitespace allowed)
/// and a later line is exactly `---` or `...`. An unclosed block is not a block.
pub fn split(raw: &str) -> Split<'_> {
    let (bom, text) = match raw.strip_prefix(BOM) {
        Some(rest) => (true, rest),
        None => (false, raw),
    };
    let mut offset = 0;
    let mut lines = text.split_inclusive('\n');
    let first_ok = lines.next().is_some_and(|l| {
        offset += l.len();
        line_content(l).trim_end() == "---"
    });
    if first_ok {
        for line in lines {
            offset += line.len();
            let c = line_content(line);
            if c == "---" || c == "..." {
                return Split {
                    bom,
                    block: &text[..offset],
                    body: &text[offset..],
                };
            }
        }
    }
    Split {
        bom,
        block: "",
        body: text,
    }
}

/// The file's line ending, taken from its first line break (default `\n`).
pub fn detect_eol(text: &str) -> &'static str {
    match text.find('\n') {
        Some(i) if i > 0 && text.as_bytes()[i - 1] == b'\r' => "\r\n",
        _ => "\n",
    }
}

/// Lines of the block strictly between the delimiters.
fn inner_lines(block: &str) -> Vec<&str> {
    let lines: Vec<&str> = block.split_inclusive('\n').collect();
    if lines.len() < 2 {
        return Vec::new();
    }
    lines[1..lines.len() - 1].to_vec()
}

/// Byte offset in `rest` (the text after `key:`) where the value token ends,
/// i.e. where trailing whitespace/comment/EOL begins.
fn value_end(rest: &str) -> usize {
    let content = line_content(rest);
    let start = content.len() - content.trim_start_matches([' ', '\t']).len();
    if let Some(&q) = content.as_bytes().get(start) {
        if q == b'"' || q == b'\'' {
            if let Some(j) = content[start + 1..].find(q as char) {
                return start + 1 + j + 1;
            }
        }
    }
    // A comment starts at ` #` or `\t#` (YAML requires preceding whitespace).
    let mut end = content.len();
    for (i, w) in content.as_bytes().windows(2).enumerate() {
        if i >= start && (w[0] == b' ' || w[0] == b'\t') && w[1] == b'#' {
            end = i;
            break;
        }
    }
    start + content[start..end].trim_end().len()
}

/// Read a top-level scalar key (`key: value`) from a block. Quotes and trailing
/// comments are stripped; empty values give `None`.
pub fn get_value(block: &str, key: &str) -> Option<String> {
    let prefix = format!("{key}:");
    for line in inner_lines(block) {
        if let Some(rest) = line.strip_prefix(&prefix) {
            let content = line_content(rest);
            let start = content.len() - content.trim_start_matches([' ', '\t']).len();
            let end = value_end(rest);
            let v = content[start..end].trim();
            let v = if v.len() >= 2
                && ((v.starts_with('"') && v.ends_with('"'))
                    || (v.starts_with('\'') && v.ends_with('\'')))
            {
                &v[1..v.len() - 1]
            } else {
                v
            };
            return if v.is_empty() {
                None
            } else {
                Some(v.to_string())
            };
        }
    }
    None
}

/// Values written by dhyana. `id`/`ty`/`date`/`created` are only added when
/// missing; `modified` is always set.
pub struct Fields<'a> {
    pub id: &'a str,
    pub ty: &'a str,
    pub date: &'a str,
    pub created: &'a str,
    pub modified: &'a str,
}

/// Build a brand-new block (ends with the closing delimiter and `eol`).
pub fn new_block(f: &Fields, eol: &str) -> String {
    format!(
        "---{eol}id: {}{eol}type: {}{eol}date: {}{eol}created: {}{eol}modified: {}{eol}---{eol}",
        f.id, f.ty, f.date, f.created, f.modified
    )
}

fn has_key(lines: &[&str], key: &str) -> bool {
    let prefix = format!("{key}:");
    lines.iter().any(|l| l.starts_with(&prefix))
}

/// Return `block` with `modified` updated and any missing keys inserted just
/// before the closing delimiter. Every other byte is preserved.
pub fn update_block(block: &str, eol: &str, f: &Fields) -> String {
    if block.is_empty() {
        return new_block(f, eol);
    }
    let lines: Vec<&str> = block.split_inclusive('\n').collect();
    let close = lines.len() - 1;
    let inner = &lines[1..close];

    let mut out = String::with_capacity(block.len() + 128);
    out.push_str(lines[0]);
    let mut modified_done = false;
    for line in inner {
        match line.strip_prefix("modified:") {
            Some(rest) if !modified_done => {
                let content = line_content(rest);
                let lead_len = content.len() - content.trim_start_matches([' ', '\t']).len();
                let end = value_end(rest);
                out.push_str("modified:");
                out.push_str(if lead_len == 0 { " " } else { &rest[..lead_len] });
                out.push_str(f.modified);
                out.push_str(&rest[end..]);
                modified_done = true;
            }
            _ => out.push_str(line),
        }
    }
    for (key, value) in [
        ("id", f.id),
        ("type", f.ty),
        ("date", f.date),
        ("created", f.created),
    ] {
        if !has_key(inner, key) {
            out.push_str(&format!("{key}: {value}{eol}"));
        }
    }
    if !modified_done {
        out.push_str(&format!("modified: {}{eol}", f.modified));
    }
    out.push_str(lines[close]);
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fields() -> Fields<'static> {
        Fields {
            id: "01ID",
            ty: "journal",
            date: "2026-10-28",
            created: "2026-10-28T07:12:00-05:00",
            modified: "2026-10-28T21:40:00-05:00",
        }
    }

    #[test]
    fn split_basic() {
        let raw = "---\na: 1\n---\nhello\n";
        let s = split(raw);
        assert!(!s.bom);
        assert_eq!(s.block, "---\na: 1\n---\n");
        assert_eq!(s.body, "hello\n");
    }

    #[test]
    fn split_no_frontmatter() {
        let s = split("hello\n---\nnot fm\n---\n");
        assert_eq!(s.block, "");
        assert_eq!(s.body, "hello\n---\nnot fm\n---\n");
    }

    #[test]
    fn split_unclosed_is_not_frontmatter() {
        let raw = "---\na: 1\nno close\n";
        let s = split(raw);
        assert_eq!(s.block, "");
        assert_eq!(s.body, raw);
    }

    #[test]
    fn split_bom_and_crlf() {
        let raw = "\u{feff}---\r\na: 1\r\n---\r\nbody\r\n";
        let s = split(raw);
        assert!(s.bom);
        assert_eq!(s.block, "---\r\na: 1\r\n---\r\n");
        assert_eq!(s.body, "body\r\n");
        assert_eq!(detect_eol("---\r\na"), "\r\n");
        assert_eq!(detect_eol("a\nb\r\n"), "\n");
        assert_eq!(detect_eol("no eol"), "\n");
    }

    #[test]
    fn split_dashes_inside_body_ignored() {
        let raw = "---\na: 1\n---\ntext\n---\nmore\n---\n";
        let s = split(raw);
        assert_eq!(s.block, "---\na: 1\n---\n");
        assert_eq!(s.body, "text\n---\nmore\n---\n");
    }

    #[test]
    fn split_dots_close_and_trailing_space_open() {
        let s = split("---  \na: 1\n...\nbody");
        assert_eq!(s.block, "---  \na: 1\n...\n");
        assert_eq!(s.body, "body");
    }

    #[test]
    fn split_closing_without_eol() {
        let s = split("---\na: 1\n---");
        assert_eq!(s.block, "---\na: 1\n---");
        assert_eq!(s.body, "");
    }

    #[test]
    fn split_empty_and_only_delimiter() {
        assert_eq!(split("").block, "");
        assert_eq!(split("---\n").block, "");
    }

    #[test]
    fn get_value_variants() {
        let b = "---\ncreated: \"2026-10-28T07:12:00-05:00\" # when\nmodified: 2026-10-28T09:00:00Z\nempty:\n  indented: x\n---\n";
        assert_eq!(
            get_value(b, "created").as_deref(),
            Some("2026-10-28T07:12:00-05:00")
        );
        assert_eq!(
            get_value(b, "modified").as_deref(),
            Some("2026-10-28T09:00:00Z")
        );
        assert_eq!(get_value(b, "empty"), None);
        assert_eq!(get_value(b, "indented"), None);
        assert_eq!(get_value(b, "missing"), None);
    }

    #[test]
    fn get_value_strips_comment_and_crlf() {
        let b = "---\r\ndate: 2026-10-28   # day\r\n---\r\n";
        assert_eq!(get_value(b, "date").as_deref(), Some("2026-10-28"));
    }

    #[test]
    fn get_value_hash_inside_unquoted_without_space() {
        let b = "---\ntitle: a#b\n---\n";
        assert_eq!(get_value(b, "title").as_deref(), Some("a#b"));
    }

    #[test]
    fn update_replaces_modified_only_and_keeps_comment() {
        let b = "---\n# my note\nid: X\ntype: journal\ndate: 2026-10-28\ncreated: 2026-10-28T07:12:00-05:00\nmodified:   2020-01-01T00:00:00Z   # last edit\nmood:\n  - { at: \"07:12\", valence: 0.4 }\n---\n";
        let out = update_block(b, "\n", &fields());
        let expected = "---\n# my note\nid: X\ntype: journal\ndate: 2026-10-28\ncreated: 2026-10-28T07:12:00-05:00\nmodified:   2026-10-28T21:40:00-05:00   # last edit\nmood:\n  - { at: \"07:12\", valence: 0.4 }\n---\n";
        assert_eq!(out, expected);
    }

    #[test]
    fn update_replaces_quoted_modified() {
        let b = "---\nid: X\ntype: j\ndate: d\ncreated: c\nmodified: \"old value\"\n---\n";
        let out = update_block(b, "\n", &fields());
        assert!(out.contains("modified: 2026-10-28T21:40:00-05:00\n---"));
        assert!(!out.contains("old value"));
    }

    #[test]
    fn update_inserts_missing_keys_before_close_after_multiline() {
        let b = "---\nmood:\n  - { at: \"07:12\" }\n  - { at: \"09:00\" }\n---\n";
        let out = update_block(b, "\n", &fields());
        assert_eq!(
            out,
            "---\nmood:\n  - { at: \"07:12\" }\n  - { at: \"09:00\" }\nid: 01ID\ntype: journal\ndate: 2026-10-28\ncreated: 2026-10-28T07:12:00-05:00\nmodified: 2026-10-28T21:40:00-05:00\n---\n"
        );
    }

    #[test]
    fn update_does_not_duplicate_existing_keys() {
        let b = "---\nid: X\ntype: journal\ndate: 2026-10-28\ncreated: C\nmodified: M\n---\n";
        let out = update_block(b, "\n", &fields());
        assert_eq!(out.matches("id:").count(), 1);
        assert_eq!(out.matches("created:").count(), 1);
        assert!(out.contains("created: C\n"));
    }

    #[test]
    fn update_crlf_uses_file_eol() {
        let b = "---\r\nid: X\r\nmodified: old\r\n---\r\n";
        let out = update_block(b, "\r\n", &fields());
        assert_eq!(
            out,
            "---\r\nid: X\r\nmodified: 2026-10-28T21:40:00-05:00\r\ntype: journal\r\ndate: 2026-10-28\r\ncreated: 2026-10-28T07:12:00-05:00\r\n---\r\n"
        );
        assert!(!out.replace("\r\n", "").contains('\n'));
    }

    #[test]
    fn update_closing_without_eol_keeps_closing_line() {
        let b = "---\nid: X\n---";
        let out = update_block(b, "\n", &fields());
        assert!(out.ends_with("modified: 2026-10-28T21:40:00-05:00\n---"));
    }

    #[test]
    fn update_empty_block_makes_new() {
        let out = update_block("", "\n", &fields());
        assert_eq!(
            out,
            "---\nid: 01ID\ntype: journal\ndate: 2026-10-28\ncreated: 2026-10-28T07:12:00-05:00\nmodified: 2026-10-28T21:40:00-05:00\n---\n"
        );
    }

    #[test]
    fn nested_modified_key_is_not_touched() {
        let b = "---\nmeta:\n  modified: nested\n---\n";
        let out = update_block(b, "\n", &fields());
        assert!(out.contains("  modified: nested\n"));
        assert!(out.contains("\nmodified: 2026-10-28T21:40:00-05:00\n"));
    }
}
