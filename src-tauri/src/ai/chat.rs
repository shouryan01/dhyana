//! The chat sidebar's backend: builds the exact context that will be sent (also shown to the user
//! before sending), then streams the reply and writes the request log.

use std::path::Path;

use serde::{Deserialize, Serialize};
use serde_json::json;

use super::log::{self, LogEntry};
use super::privacy::{self, Egress};
use super::provider::{self, ChatRequest, Message};
use super::settings::{AiSettings, ProviderKind};
use super::tools::Tools;
use crate::vault::validate_date;

const BASE_PROMPT: &str = "You are the assistant inside dhyana, a personal journal. You are a thoughtful, warm and \
concise reading companion. You can only read: you cannot change the journal. Use only the journal text given below \
and the conversation; if something is not there, say so rather than guessing. When you rely on an entry, mention its \
date (YYYY-MM-DD).";

/// Most characters of journal text added to one request.
const CONTEXT_BUDGET: usize = 24_000;

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Attachments {
    /// The day open in the editor.
    pub current_date: Option<String>,
    /// Attach the current day's text.
    pub current_note: bool,
    /// Selected text from the current day (dropped if that day is private).
    pub selection: Option<String>,
    /// Other days chosen by the user.
    pub dates: Vec<String>,
    /// People or places chosen by the user.
    pub people: Vec<String>,
    /// Let the assistant search the journal for this question. Off unless asked, per chat.
    pub retrieval: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatInput {
    pub messages: Vec<Message>,
    #[serde(default)]
    pub attachments: Attachments,
    /// Use the fast model instead of the chat model.
    #[serde(default)]
    pub fast: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Built {
    pub provider: String,
    pub model: String,
    pub cloud: bool,
    pub system: String,
    pub messages: Vec<Message>,
    /// Journal days whose text is in the request, for source chips.
    pub sources: Vec<String>,
    /// Things left out and why ("2026-01-02 is private").
    pub omitted: Vec<String>,
}

fn add_block(
    context: &mut String,
    title: &str,
    body: &str,
    budget: &mut usize,
    omitted: &mut Vec<String>,
) {
    let block = format!("### {title}\n{body}\n\n");
    let n = block.chars().count();
    if n > *budget {
        omitted.push(format!("{title} (over the size limit)"));
        return;
    }
    *budget -= n;
    context.push_str(&block);
}

fn which(settings: &AiSettings, fast: bool) -> Result<(ProviderKind, String), String> {
    if fast {
        let f = settings
            .fast
            .as_ref()
            .ok_or("No fast model is configured (Settings > AI).")?;
        return Ok((f.provider, f.model.clone()));
    }
    Ok((settings.active, settings.config(settings.active).model))
}

/// Build the request without sending it. Checks the gate first.
pub fn build(settings: &AiSettings, tools: &Tools, input: &ChatInput) -> Result<Built, String> {
    let (kind, model) = which(settings, input.fast)?;
    let egress = privacy::check_chat(settings, kind)?;
    let a = &input.attachments;
    let mut context = String::new();
    let mut budget = CONTEXT_BUDGET;
    let mut sources: Vec<String> = Vec::new();
    let mut omitted: Vec<String> = Vec::new();

    let read_day = |date: &str,
                    context: &mut String,
                    budget: &mut usize,
                    sources: &mut Vec<String>,
                    omitted: &mut Vec<String>| {
        if sources.iter().any(|s| s == date) {
            return;
        }
        match tools.call("read_entry", &json!({ "date": date })) {
            Ok(out) => {
                let text = out.value["text"].as_str().unwrap_or("");
                add_block(context, &format!("Entry {date}"), text, budget, omitted);
                sources.push(date.to_string());
            }
            Err(_) => omitted.push(format!(
                "{date} (private, outside the allowed folders, or missing)"
            )),
        }
    };

    if a.current_note {
        if let Some(d) = a
            .current_date
            .as_deref()
            .filter(|d| validate_date(d).is_ok())
        {
            read_day(d, &mut context, &mut budget, &mut sources, &mut omitted);
        }
    }
    if let (Some(sel), Some(d)) = (a.selection.as_deref(), a.current_date.as_deref()) {
        if !sel.trim().is_empty() {
            if validate_date(d).is_ok() && tools.visible_day(d)? {
                add_block(
                    &mut context,
                    &format!("Selected text from {d}"),
                    sel,
                    &mut budget,
                    &mut omitted,
                );
            } else {
                omitted.push("selected text (its day is private or not allowed)".into());
            }
        }
    }
    for d in a.dates.iter().filter(|d| validate_date(d).is_ok()) {
        read_day(d, &mut context, &mut budget, &mut sources, &mut omitted);
    }
    for name in &a.people {
        match tools.call("get_person", &json!({ "name": name })) {
            Ok(out) => {
                let v = &out.value;
                let mut body = format!(
                    "Kind: {}. Relationship: {}.\n{}",
                    v["kind"].as_str().unwrap_or(""),
                    v["relationship"].as_str().unwrap_or("not set"),
                    v["note"].as_str().unwrap_or("")
                );
                if let Some(ms) = v["recentMentions"].as_array() {
                    for m in ms.iter().take(8) {
                        body.push_str(&format!(
                            "\n- {}: {}",
                            m["date"].as_str().unwrap_or(""),
                            m["context"].as_str().unwrap_or("")
                        ));
                    }
                }
                add_block(
                    &mut context,
                    &format!("About {name}"),
                    &body,
                    &mut budget,
                    &mut omitted,
                );
            }
            Err(_) => omitted.push(format!("{name} (not found or not allowed)")),
        }
    }
    if a.retrieval {
        let question = input
            .messages
            .iter()
            .rev()
            .find(|m| m.role == "user")
            .map(|m| m.content.clone())
            .unwrap_or_default();
        if let Ok(out) = tools.call("search", &json!({ "text": question, "limit": 5 })) {
            for d in out.dates {
                read_day(&d, &mut context, &mut budget, &mut sources, &mut omitted);
            }
        }
    }

    let mut system = BASE_PROMPT.to_string();
    if !settings.instructions.trim().is_empty() {
        system.push_str("\n\nThe user's own instructions:\n");
        system.push_str(settings.instructions.trim());
    }
    if !context.is_empty() {
        system.push_str("\n\n## Journal text provided by the user\n\n");
        system.push_str(&context);
    }
    Ok(Built {
        provider: kind.id().into(),
        model,
        cloud: egress == Egress::Cloud,
        system,
        messages: input.messages.clone(),
        sources,
        omitted,
    })
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Done {
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub sources: Vec<String>,
}

/// Send a built request and stream the reply through `on_delta` (return `false` to stop).
/// Always writes a log entry, success or not.
pub fn run(
    settings: &AiSettings,
    built: &Built,
    key: Option<String>,
    log_path: &Path,
    on_delta: &mut dyn FnMut(&str) -> bool,
) -> Result<Done, String> {
    let kind = ProviderKind::parse(&built.provider).ok_or("unknown provider")?;
    // Re-check at the moment of sending, not only when the context was built.
    privacy::check_chat(settings, kind)?;
    let cfg = settings.config(kind);
    let req = ChatRequest {
        system: built.system.clone(),
        messages: built.messages.clone(),
        model: built.model.clone(),
    };
    let mut sent = format!("[system]\n{}\n", built.system);
    for m in &built.messages {
        sent.push_str(&format!("[{}]\n{}\n", m.role, m.content));
    }
    let mut entry = LogEntry {
        at: chrono::Local::now().to_rfc3339(),
        kind: "chat".into(),
        provider: built.provider.clone(),
        model: built.model.clone(),
        cloud: built.cloud,
        sent: sent.clone(),
        sources: built.sources.clone(),
        ..LogEntry::default()
    };
    let mut produced = String::new();
    let result = provider::build(kind, &cfg, key).and_then(|p| {
        p.stream(&req, &mut |t| {
            produced.push_str(t);
            on_delta(t)
        })
    });
    match &result {
        Ok(t) => {
            entry.input_tokens = if t.input > 0 {
                t.input
            } else {
                log::estimate_tokens(&sent)
            };
            entry.output_tokens = if t.output > 0 {
                t.output
            } else {
                log::estimate_tokens(&produced)
            };
        }
        Err(e) => entry.error = Some(e.clone()),
    }
    let _ = log::append(log_path, &entry);
    result.map(|_| Done {
        input_tokens: entry.input_tokens,
        output_tokens: entry.output_tokens,
        sources: built.sources.clone(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::index::Index;
    use std::fs;
    use tempfile::tempdir;

    fn setup() -> (tempfile::TempDir, Index) {
        let dir = tempdir().unwrap();
        let w = |rel: &str, text: &str| {
            let p = dir.path().join(rel);
            fs::create_dir_all(p.parent().unwrap()).unwrap();
            fs::write(p, text).unwrap();
        };
        w("journal/2026/01/2026-01-01.md", "A calm day with tea.\n");
        w(
            "journal/2026/01/2026-01-02.md",
            "---\nprivate: true\n---\nDark thoughts.\n",
        );
        let mut idx = Index::open_in_memory().unwrap();
        idx.rebuild(dir.path()).unwrap();
        (dir, idx)
    }

    fn input(a: Attachments) -> ChatInput {
        ChatInput {
            messages: vec![Message {
                role: "user".into(),
                content: "tea".into(),
            }],
            attachments: a,
            fast: false,
        }
    }

    #[test]
    fn refuses_when_ai_is_off() {
        let (dir, idx) = setup();
        let s = AiSettings::default();
        let t = Tools {
            vault: dir.path(),
            index: &idx,
            settings: &s,
        };
        assert!(build(&s, &t, &input(Attachments::default())).is_err());
    }

    #[test]
    fn private_day_and_its_selection_are_left_out() {
        let (dir, idx) = setup();
        let s = AiSettings {
            enabled: true,
            ..AiSettings::default()
        };
        let t = Tools {
            vault: dir.path(),
            index: &idx,
            settings: &s,
        };
        let b = build(
            &s,
            &t,
            &input(Attachments {
                current_date: Some("2026-01-02".into()),
                current_note: true,
                selection: Some("Dark thoughts".into()),
                dates: vec!["2026-01-01".into()],
                ..Attachments::default()
            }),
        )
        .unwrap();
        assert!(!b.system.contains("Dark thoughts"));
        assert!(b.system.contains("calm day with tea"));
        assert_eq!(b.sources, vec!["2026-01-01".to_string()]);
        assert_eq!(b.omitted.len(), 2);
        assert!(!b.cloud);
    }

    #[test]
    fn retrieval_is_off_unless_asked() {
        let (dir, idx) = setup();
        let s = AiSettings {
            enabled: true,
            ..AiSettings::default()
        };
        let t = Tools {
            vault: dir.path(),
            index: &idx,
            settings: &s,
        };
        let off = build(&s, &t, &input(Attachments::default())).unwrap();
        assert!(off.sources.is_empty());
        let on = build(
            &s,
            &t,
            &input(Attachments {
                retrieval: true,
                ..Attachments::default()
            }),
        )
        .unwrap();
        assert_eq!(on.sources, vec!["2026-01-01".to_string()]);
    }
}
