//! Finds `[[wikilinks]]` and `#tags` in a note body, and rewrites link targets in place.
//!
//! Code (fenced blocks and inline code spans) is ignored, and `![[embeds]]` are not links. The
//! same scanner feeds the index and the rename rewrite, so they can never disagree.

use crate::names;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WikiLink {
    /// The target as written, without any `#heading` / `^block` suffix.
    pub target: String,
    pub label: Option<String>,
    /// Byte range of `target` within the scanned text.
    pub target_span: (usize, usize),
    /// The line the link is on, trimmed and shortened, for "mentions" lists.
    pub context: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TagRef {
    pub tag: String,
}

#[derive(Debug, Default, PartialEq, Eq)]
pub struct Scan {
    pub links: Vec<WikiLink>,
    pub tags: Vec<TagRef>,
}

const CONTEXT_CHARS: usize = 160;

fn context_of(line: &str) -> String {
    let t = line.trim();
    if t.chars().count() <= CONTEXT_CHARS {
        return t.to_string();
    }
    let cut: String = t.chars().take(CONTEXT_CHARS).collect();
    format!("{}…", cut.trim_end())
}

fn is_tag_char(c: char) -> bool {
    c.is_alphanumeric() || matches!(c, '_' | '-' | '/')
}

/// Byte ranges of inline code spans in `line` (a run of N backticks closes at the next run of N).
fn code_spans(line: &str) -> Vec<(usize, usize)> {
    let b = line.as_bytes();
    let mut spans = Vec::new();
    let mut i = 0;
    while i < b.len() {
        if b[i] != b'`' {
            i += 1;
            continue;
        }
        let start = i;
        while i < b.len() && b[i] == b'`' {
            i += 1;
        }
        let run = i - start;
        let mut j = i;
        let mut closed = None;
        while j < b.len() {
            if b[j] == b'`' {
                let s = j;
                while j < b.len() && b[j] == b'`' {
                    j += 1;
                }
                if j - s == run {
                    closed = Some(j);
                    break;
                }
            } else {
                j += 1;
            }
        }
        // An unmatched run is just literal backticks.
        if let Some(end) = closed {
            spans.push((start, end));
            i = end;
        }
    }
    spans
}

fn fence_marker(line: &str) -> Option<(char, usize)> {
    let t = line.trim_start();
    if line.len() - t.len() > 3 {
        return None;
    }
    let c = t.chars().next()?;
    if c != '`' && c != '~' {
        return None;
    }
    let n = t.chars().take_while(|x| *x == c).count();
    (n >= 3).then_some((c, n))
}

pub fn scan(text: &str) -> Scan {
    let mut out = Scan::default();
    let mut fence: Option<(char, usize)> = None;
    let mut offset = 0;

    for raw in text.split_inclusive('\n') {
        let line_start = offset;
        offset += raw.len();
        let line = raw.trim_end_matches(['\r', '\n']);

        if let Some((c, n)) = fence {
            if let Some((c2, n2)) = fence_marker(line) {
                if c2 == c && n2 >= n && line.trim_start().chars().all(|x| x == c) {
                    fence = None;
                }
            }
            continue;
        }
        if let Some(f) = fence_marker(line) {
            fence = Some(f);
            continue;
        }

        let code = code_spans(line);
        let in_code = |i: usize| code.iter().any(|&(s, e)| i >= s && i < e);
        let ctx = context_of(line);
        let b = line.as_bytes();
        let mut i = 0;

        while i < b.len() {
            if in_code(i) {
                i += 1;
                continue;
            }
            if b[i] == b'[' && b.get(i + 1) == Some(&b'[') && !(i > 0 && b[i - 1] == b'!') {
                if let Some(rel) = line[i + 2..].find("]]") {
                    let inner_start = i + 2;
                    let inner_end = inner_start + rel;
                    let inner = &line[inner_start..inner_end];
                    if !inner.contains("[[") && !in_code(inner_end) {
                        let (target_raw, label) = match inner.find('|') {
                            Some(p) => (&inner[..p], Some(inner[p + 1..].to_string())),
                            None => (inner, None),
                        };
                        let cut = target_raw.find(['#', '^']).unwrap_or(target_raw.len());
                        let target = target_raw[..cut].trim();
                        if !target.is_empty() {
                            let lead =
                                target_raw[..cut].len() - target_raw[..cut].trim_start().len();
                            let s = line_start + inner_start + lead;
                            out.links.push(WikiLink {
                                target: target.to_string(),
                                label: label.filter(|l| !l.is_empty()),
                                target_span: (s, s + target.len()),
                                context: ctx.clone(),
                            });
                        }
                        i = inner_end + 2;
                        continue;
                    }
                }
            }
            if b[i] == b'#' && (i == 0 || (b[i - 1] as char).is_whitespace()) {
                let rest = &line[i + 1..];
                let len: usize = rest
                    .chars()
                    .take_while(|c| is_tag_char(*c))
                    .map(char::len_utf8)
                    .sum();
                let tag = &rest[..len];
                if !tag.is_empty() && tag.chars().any(|c| !c.is_ascii_digit()) {
                    out.tags.push(TagRef {
                        tag: tag.to_string(),
                    });
                }
                i += 1 + len;
                continue;
            }
            // Step by whole characters so slicing stays on boundaries.
            i += line[i..].chars().next().map_or(1, char::len_utf8);
        }
    }
    out
}

/// Replace the target of every link that points at `old_key` (a [`names::key`]) with `new_target`.
/// Labels and `#anchors` are left alone. Returns the new text and how many links changed.
pub fn rewrite_links(text: &str, old_key: &str, new_target: &str) -> (String, usize) {
    let mut hits: Vec<(usize, usize)> = scan(text)
        .links
        .into_iter()
        .filter(|l| names::key(&l.target) == old_key)
        .map(|l| l.target_span)
        .collect();
    hits.sort_unstable();
    let mut out = String::with_capacity(text.len() + 16);
    let mut last = 0;
    for &(s, e) in &hits {
        out.push_str(&text[last..s]);
        out.push_str(new_target);
        last = e;
    }
    out.push_str(&text[last..]);
    (out, hits.len())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn targets(t: &str) -> Vec<(String, Option<String>)> {
        scan(t)
            .links
            .into_iter()
            .map(|l| (l.target, l.label))
            .collect()
    }
    fn tags(t: &str) -> Vec<String> {
        scan(t).tags.into_iter().map(|t| t.tag).collect()
    }

    #[test]
    fn finds_links_with_labels_and_anchors() {
        let t = "Met [[Alice]] and [[Paris (place)|Paris]], see [[Bob#plans]] and [[2026-12-25|Mom's birthday]].";
        assert_eq!(
            targets(t),
            vec![
                ("Alice".into(), None),
                ("Paris (place)".into(), Some("Paris".into())),
                ("Bob".into(), None),
                ("2026-12-25".into(), Some("Mom's birthday".into())),
            ]
        );
    }

    #[test]
    fn ignores_embeds_code_and_fences() {
        let t = "![[embed]] `[[inline]]` and [[real]]\n```\n[[fenced]] #nope\n```\n~~~\n[[tilde]]\n~~~\nafter [[also]]";
        assert_eq!(
            targets(t).into_iter().map(|x| x.0).collect::<Vec<_>>(),
            vec!["real", "also"]
        );
        assert!(tags(t).is_empty());
    }

    #[test]
    fn tags_need_whitespace_before_and_a_letter() {
        assert_eq!(
            tags("#work and #deep/focus, a#b, #123, # heading\n#gratitude"),
            vec!["work", "deep/focus", "gratitude"]
        );
        assert_eq!(tags("## Heading\ntext"), Vec::<String>::new());
        assert_eq!(tags("#café ok"), vec!["café"]);
    }

    #[test]
    fn tags_inside_links_and_code_are_not_tags() {
        assert!(tags("[[Note #x]] and `#y`").is_empty());
    }

    #[test]
    fn context_is_the_trimmed_line() {
        let s = scan("first\n  met [[Alice]] today  \n");
        assert_eq!(s.links[0].context, "met [[Alice]] today");
        let long = format!("[[A]] {}", "x".repeat(400));
        assert!(scan(&long).links[0].context.chars().count() <= CONTEXT_CHARS + 1);
    }

    #[test]
    fn unicode_does_not_break_scanning() {
        let t = "日本語 [[Zoë]] ✨ #日記 [[Æ|æ]]";
        assert_eq!(targets(t).len(), 2);
        assert_eq!(tags(t), vec!["日記"]);
    }

    #[test]
    fn rewrite_keeps_labels_anchors_and_everything_else() {
        let t =
            "A [[alice]] B [[Alice|Al]] C [[Alice#sec]] D [[Bob]] E `[[Alice]]` F ![[Alice]]\r\n";
        let (out, n) = rewrite_links(t, &names::key("Alice"), "Alicia");
        assert_eq!(n, 3);
        assert_eq!(
            out,
            "A [[Alicia]] B [[Alicia|Al]] C [[Alicia#sec]] D [[Bob]] E `[[Alice]]` F ![[Alice]]\r\n"
        );
    }

    #[test]
    fn rewrite_with_no_hits_is_identity() {
        let t = "nothing [[here]]";
        assert_eq!(rewrite_links(t, "zzz", "x"), (t.to_string(), 0));
    }
}
