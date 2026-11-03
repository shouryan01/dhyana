//! The local request log: one JSON line per outbound AI request or MCP tool call, in app data,
//! so you can audit exactly what was sent. Also the source of the usage totals.

use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::Path;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct LogEntry {
    /// RFC 3339 time.
    pub at: String,
    /// `chat`, `nudge` or `mcp`.
    pub kind: String,
    pub provider: String,
    pub model: String,
    /// Did it leave this machine?
    pub cloud: bool,
    /// The exact text sent (chat: system prompt plus messages; mcp: the tool call and its result).
    pub sent: String,
    /// Journal days whose text was part of it.
    pub sources: Vec<String>,
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub error: Option<String>,
}

impl Default for LogEntry {
    fn default() -> Self {
        LogEntry {
            at: String::new(),
            kind: "chat".into(),
            provider: String::new(),
            model: String::new(),
            cloud: false,
            sent: String::new(),
            sources: Vec::new(),
            input_tokens: 0,
            output_tokens: 0,
            error: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Usage {
    pub requests: u64,
    pub cloud_requests: u64,
    pub input_tokens: u64,
    pub output_tokens: u64,
}

pub fn append(path: &Path, entry: &LogEntry) -> std::io::Result<()> {
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir)?;
    }
    let mut f = OpenOptions::new().create(true).append(true).open(path)?;
    let mut line = serde_json::to_string(entry)?;
    line.push('\n');
    f.write_all(line.as_bytes())
}

/// Newest first.
pub fn read(path: &Path, limit: usize) -> Vec<LogEntry> {
    let Ok(text) = fs::read_to_string(path) else {
        return Vec::new();
    };
    text.lines()
        .rev()
        .filter_map(|l| serde_json::from_str(l).ok())
        .take(limit)
        .collect()
}

pub fn usage(path: &Path) -> Usage {
    let mut u = Usage::default();
    for e in read(path, usize::MAX) {
        u.requests += 1;
        u.cloud_requests += e.cloud as u64;
        u.input_tokens += e.input_tokens;
        u.output_tokens += e.output_tokens;
    }
    u
}

pub fn clear(path: &Path) -> std::io::Result<()> {
    match fs::remove_file(path) {
        Err(e) if e.kind() != std::io::ErrorKind::NotFound => Err(e),
        _ => Ok(()),
    }
}

/// A rough token count (about four characters each) for providers that don't report usage.
pub fn estimate_tokens(text: &str) -> u64 {
    (text.chars().count() as u64).div_ceil(4)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn append_read_usage_clear() {
        let dir = tempdir().unwrap();
        let p = dir.path().join("ai/requests.jsonl");
        assert!(read(&p, 10).is_empty());
        for i in 0..3u64 {
            append(
                &p,
                &LogEntry {
                    at: format!("t{i}"),
                    cloud: i > 0,
                    input_tokens: 10,
                    output_tokens: 5,
                    ..LogEntry::default()
                },
            )
            .unwrap();
        }
        let got = read(&p, 2);
        assert_eq!(got.len(), 2);
        assert_eq!(got[0].at, "t2");
        let u = usage(&p);
        assert_eq!((u.requests, u.cloud_requests, u.input_tokens), (3, 2, 30));
        clear(&p).unwrap();
        assert!(read(&p, 10).is_empty());
    }
}
