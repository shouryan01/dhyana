//! Comment-preserving edits of a frontmatter block, built on the line-level helpers in
//! `frontmatter`. We never parse or re-emit the YAML: only the lines of the key being changed
//! are rewritten, so comments, key order and every other key stay byte-for-byte.

use crate::frontmatter::{inner_lines, line_content, value_end};

/// A string as a YAML scalar token: plain when that is safe, double-quoted otherwise.
pub fn quote(v: &str) -> String {
    let first = v.chars().next();
    let lower = v.to_lowercase();
    let needs = v.is_empty()
        || v.trim() != v
        || first.is_some_and(|c| "-?:,[]{}#&*!|>'\"%@`".contains(c))
        || v.contains(": ")
        || v.contains(" #")
        || v.ends_with(':')
        || v.contains(['\n', '\r', ',', '[', ']', '{', '}'])
        || matches!(lower.as_str(), "true" | "false" | "null" | "yes" | "no" | "on" | "off" | "~")
        || v.parse::<f64>().is_ok();
    if !needs {
        return v.to_string();
    }
    let mut out = String::with_capacity(v.len() + 2);
    out.push('"');
    for ch in v.chars() {
        match ch {
            '\\' => out.push_str("\\\\"),
            '"' => out.push_str("\\\""),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            c => out.push(c),
        }
    }
    out.push('"');
    out
}

/// The inverse of [`quote`] for one scalar token.
pub fn unquote(token: &str) -> String {
    let t = token.trim();
    if t.len() >= 2 && t.starts_with('"') && t.ends_with('"') {
        let mut out = String::new();
        let mut chars = t[1..t.len() - 1].chars();
        while let Some(c) = chars.next() {
            if c != '\\' {
                out.push(c);
                continue;
            }
            match chars.next() {
                Some('n') => out.push('\n'),
                Some('r') => out.push('\r'),
                Some('t') => out.push('\t'),
                Some(o) => out.push(o),
                None => out.push('\\'),
            }
        }
        out
    } else if t.len() >= 2 && t.starts_with('\'') && t.ends_with('\'') {
        t[1..t.len() - 1].replace("''", "'")
    } else {
        t.to_string()
    }
}

/// Lines of the whole block (delimiters included) and the span `[start, end)` of `key`'s lines:
/// its own line plus any indented or `- ` continuation lines.
pub(crate) fn find_key<'a>(block: &'a str, key: &str) -> (Vec<&'a str>, Option<(usize, usize)>) {
    let lines: Vec<&str> = block.split_inclusive('\n').collect();
    if lines.len() < 2 {
        return (lines, None);
    }
    let close = lines.len() - 1;
    let prefix = format!("{key}:");
    let Some(i) = (1..close).find(|&i| lines[i].starts_with(&prefix)) else {
        return (lines, None);
    };
    let mut j = i + 1;
    while j < close {
        let l = lines[j];
        if l.starts_with([' ', '\t']) || l.starts_with("- ") || line_content(l) == "-" {
            j += 1;
        } else {
            break;
        }
    }
    (lines, Some((i, j)))
}

/// Split a `[a, "b, c", d]` flow sequence into unquoted items.
pub(crate) fn split_flow(inner: &str) -> Vec<String> {
    let mut items = Vec::new();
    let mut cur = String::new();
    let mut quote: Option<char> = None;
    let mut prev = '\0';
    for ch in inner.chars() {
        match quote {
            Some(q) => {
                cur.push(ch);
                if ch == q && !(q == '"' && prev == '\\') {
                    quote = None;
                }
            }
            None if ch == '"' || ch == '\'' => {
                quote = Some(ch);
                cur.push(ch);
            }
            None if ch == ',' => {
                items.push(std::mem::take(&mut cur));
            }
            None => cur.push(ch),
        }
        prev = ch;
    }
    items.push(cur);
    items
        .into_iter()
        .map(|s| unquote(&s))
        .filter(|s| !s.is_empty())
        .collect()
}

/// A list value: `key: [a, b]`, a block sequence, or a single scalar. Missing gives `[]`.
pub fn get_list(block: &str, key: &str) -> Vec<String> {
    let (lines, span) = find_key(block, key);
    let Some((i, j)) = span else {
        return Vec::new();
    };
    let rest = &lines[i][key.len() + 1..];
    let content = line_content(rest);
    let start = content.len() - content.trim_start_matches([' ', '\t']).len();
    let token = content[start..value_end(rest)].trim();
    if token.starts_with('[') && token.ends_with(']') {
        return split_flow(&token[1..token.len() - 1]);
    }
    if !token.is_empty() {
        return vec![unquote(token)];
    }
    lines[i + 1..j]
        .iter()
        .filter_map(|l| {
            let after = l.trim_start().strip_prefix('-')?;
            let end = value_end(after);
            let item = unquote(&after[..end]);
            (!item.is_empty()).then_some(item)
        })
        .collect()
}

/// Set (`Some`) or remove (`None`) `key` with the raw value `token`, keeping the key line's
/// spacing and trailing comment when it already exists.
fn replace_value(block: &str, eol: &str, key: &str, token: Option<&str>) -> String {
    let (lines, span) = find_key(block, key);
    match (span, token) {
        (None, None) => block.to_string(),
        (None, Some(t)) => {
            if block.is_empty() {
                return format!("---{eol}{key}: {t}{eol}---{eol}");
            }
            let close = lines.len() - 1;
            let mut out: String = lines[..close].concat();
            out.push_str(&format!("{key}: {t}{eol}"));
            out.push_str(lines[close]);
            out
        }
        (Some((i, j)), None) => {
            let mut out: String = lines[..i].concat();
            out.push_str(&lines[j..].concat());
            out
        }
        (Some((i, j)), Some(t)) => {
            let rest = &lines[i][key.len() + 1..];
            let content = line_content(rest);
            let lead = content.len() - content.trim_start_matches([' ', '\t']).len();
            let end = value_end(rest);
            let mut out: String = lines[..i].concat();
            out.push_str(key);
            out.push(':');
            out.push_str(if lead == 0 { " " } else { &rest[..lead] });
            out.push_str(t);
            out.push_str(&rest[end..]);
            out.push_str(&lines[j..].concat());
            out
        }
    }
}

/// Set or remove (`None`) a scalar key.
pub fn set_scalar(block: &str, eol: &str, key: &str, value: Option<&str>) -> String {
    replace_value(block, eol, key, value.map(quote).as_deref())
}

/// Set a list key; an empty list removes it. A key already written as a block sequence stays one.
pub fn set_list(block: &str, eol: &str, key: &str, items: &[String]) -> String {
    if items.is_empty() {
        return replace_value(block, eol, key, None);
    }
    let (lines, span) = find_key(block, key);
    if let Some((i, j)) = span {
        let rest = &lines[i][key.len() + 1..];
        let inline_empty = line_content(rest)[..value_end(rest)].trim().is_empty();
        if inline_empty && j > i + 1 {
            let indent: String = lines[i + 1]
                .chars()
                .take_while(|c| *c == ' ' || *c == '\t')
                .collect();
            let mut out: String = lines[..=i].concat();
            for it in items {
                out.push_str(&format!("{indent}- {}{eol}", quote(it)));
            }
            out.push_str(&lines[j..].concat());
            return out;
        }
    }
    let flow = format!("[{}]", items.iter().map(|s| quote(s)).collect::<Vec<_>>().join(", "));
    replace_value(block, eol, key, Some(&flow))
}

/// Does the block have this top-level key at all?
pub fn has_key(block: &str, key: &str) -> bool {
    let prefix = format!("{key}:");
    inner_lines(block).iter().any(|l| l.starts_with(&prefix))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn quoting_round_trips() {
        for v in [
            "Alice", "Dr. Smith", "Mom's", "a: b", "x #y", "[x]", "true", "42", "", " pad ",
            "say \"hi\"", "back\\slash", "line\nbreak", "-dash", "ends:", "a, b",
        ] {
            assert_eq!(unquote(&quote(v)), v, "{v:?} via {:?}", quote(v));
        }
        assert_eq!(quote("Alice"), "Alice");
        assert_eq!(quote("1990-05-02"), "1990-05-02");
        assert_eq!(unquote("'it''s'"), "it's");
    }

    #[test]
    fn reads_lists_in_every_shape() {
        let b = "---\naliases: [Ali, \"Al, the pal\", 'x']\nother:\n  - a\n  - \"b\" # note\n---\n";
        assert_eq!(get_list(b, "aliases"), vec!["Ali", "Al, the pal", "x"]);
        assert_eq!(get_list(b, "other"), vec!["a", "b"]);
        assert_eq!(get_list("---\naliases: Solo\n---\n", "aliases"), vec!["Solo"]);
        assert_eq!(get_list("---\naliases:\n- a\n- b\n---\n", "aliases"), vec!["a", "b"]);
        assert!(get_list(b, "missing").is_empty());
        assert!(get_list("", "aliases").is_empty());
        assert!(get_list("---\naliases: []\n---\n", "aliases").is_empty());
    }

    #[test]
    fn set_scalar_replaces_in_place_and_keeps_comment() {
        let b = "---\n# who\nid: X\nrelationship:   friend   # since 2010\nbirthday: 1990-05-02\n---\n";
        let out = set_scalar(b, "\n", "relationship", Some("sister"));
        assert_eq!(
            out,
            "---\n# who\nid: X\nrelationship:   sister   # since 2010\nbirthday: 1990-05-02\n---\n"
        );
    }

    #[test]
    fn set_scalar_inserts_before_close_and_removes() {
        let b = "---\nid: X\nlist:\n  - a\n---\n";
        let added = set_scalar(b, "\n", "title", Some("Paris: the city"));
        assert_eq!(added, "---\nid: X\nlist:\n  - a\ntitle: \"Paris: the city\"\n---\n");
        assert_eq!(set_scalar(&added, "\n", "title", None), b);
        assert_eq!(set_scalar(b, "\n", "nope", None), b);
    }

    #[test]
    fn set_scalar_replaces_a_whole_multiline_value() {
        let b = "---\nnotes:\n  - one\n  - two\nafter: 1\n---\n";
        assert_eq!(
            set_scalar(b, "\n", "notes", Some("flat")),
            "---\nnotes: flat\nafter: 1\n---\n"
        );
    }

    #[test]
    fn set_scalar_into_empty_block_makes_one() {
        assert_eq!(set_scalar("", "\n", "title", Some("T")), "---\ntitle: T\n---\n");
        assert_eq!(set_scalar("", "\n", "title", None), "");
    }

    #[test]
    fn set_scalar_crlf() {
        let b = "---\r\nid: X\r\n---\r\n";
        let out = set_scalar(b, "\r\n", "title", Some("T"));
        assert_eq!(out, "---\r\nid: X\r\ntitle: T\r\n---\r\n");
    }

    #[test]
    fn set_list_flow_and_block_styles_are_kept() {
        let flow = "---\naliases: [Ali] # nick\n---\n";
        assert_eq!(
            set_list(flow, "\n", "aliases", &["Ali".into(), "Al, Jr".into()]),
            "---\naliases: [Ali, \"Al, Jr\"] # nick\n---\n"
        );
        let block = "---\naliases:\n    - Ali\n    - Al\nnext: 1\n---\n";
        assert_eq!(
            set_list(block, "\n", "aliases", &["Zed".into()]),
            "---\naliases:\n    - Zed\nnext: 1\n---\n"
        );
        assert_eq!(set_list(block, "\n", "aliases", &[]), "---\nnext: 1\n---\n");
        assert_eq!(
            set_list("---\nid: X\n---\n", "\n", "aliases", &["A".into()]),
            "---\nid: X\naliases: [A]\n---\n"
        );
    }

    #[test]
    fn nested_keys_are_not_matched() {
        let b = "---\nmeta:\n  title: nested\n---\n";
        let out = set_scalar(b, "\n", "title", Some("top"));
        assert_eq!(out, "---\nmeta:\n  title: nested\ntitle: top\n---\n");
        assert!(!has_key(b, "title"));
        assert!(has_key(&out, "title"));
    }
}
