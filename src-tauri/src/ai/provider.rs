//! Providers behind one trait: OpenAI-compatible HTTP (local servers, OpenAI, Gemini, Groq,
//! OpenRouter), Anthropic's Messages API, and coding-agent CLIs already installed here.
//!
//! Nothing in this file checks consent: callers go through `privacy::check_chat` first.

use std::io::{BufRead, BufReader, Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::Duration;

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use super::settings::{ProviderConfig, ProviderKind};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Message {
    /// `user` or `assistant`.
    pub role: String,
    pub content: String,
}

#[derive(Debug, Clone)]
pub struct ChatRequest {
    pub system: String,
    pub messages: Vec<Message>,
    pub model: String,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct Tokens {
    pub input: u64,
    pub output: u64,
}

/// Streams a reply. `on_delta` gets each piece of text and returns `false` to stop early.
pub trait Provider {
    fn stream(
        &self,
        req: &ChatRequest,
        on_delta: &mut dyn FnMut(&str) -> bool,
    ) -> Result<Tokens, String>;
}

fn agent(timeout_secs: u64) -> ureq::Agent {
    ureq::AgentBuilder::new()
        .timeout_connect(Duration::from_secs(10))
        .timeout_read(Duration::from_secs(timeout_secs))
        .build()
}

fn http_error(e: ureq::Error) -> String {
    match e {
        ureq::Error::Status(code, resp) => {
            let body = resp.into_string().unwrap_or_default();
            let msg = serde_json::from_str::<Value>(&body)
                .ok()
                .and_then(|v| {
                    v["error"]["message"]
                        .as_str()
                        .or_else(|| v["error"].as_str())
                        .map(str::to_string)
                })
                .unwrap_or(body);
            format!("HTTP {code}: {}", msg.chars().take(300).collect::<String>())
        }
        other => other.to_string(),
    }
}

fn join_url(base: &str, tail: &str) -> String {
    format!("{}/{}", base.trim_end_matches('/'), tail)
}

pub struct OpenAiCompat {
    pub base_url: String,
    pub key: Option<String>,
}

impl OpenAiCompat {
    pub fn body(req: &ChatRequest) -> Value {
        let mut messages = Vec::new();
        if !req.system.is_empty() {
            messages.push(json!({"role": "system", "content": req.system}));
        }
        for m in &req.messages {
            messages.push(json!({"role": m.role, "content": m.content}));
        }
        json!({
            "model": req.model,
            "messages": messages,
            "stream": true,
            "stream_options": {"include_usage": true},
        })
    }
}

impl Provider for OpenAiCompat {
    fn stream(
        &self,
        req: &ChatRequest,
        on_delta: &mut dyn FnMut(&str) -> bool,
    ) -> Result<Tokens, String> {
        let mut r = agent(300).post(&join_url(&self.base_url, "chat/completions"));
        if let Some(k) = &self.key {
            r = r.set("Authorization", &format!("Bearer {k}"));
        }
        let resp = r.send_json(Self::body(req)).map_err(http_error)?;
        let mut tokens = Tokens::default();
        for line in BufReader::new(resp.into_reader()).lines() {
            let line = line.map_err(|e| e.to_string())?;
            let Some(data) = line.strip_prefix("data:") else {
                continue;
            };
            let data = data.trim();
            if data == "[DONE]" {
                break;
            }
            let Ok(v) = serde_json::from_str::<Value>(data) else {
                continue;
            };
            if let Some(u) = v.get("usage").filter(|u| u.is_object()) {
                tokens.input = u["prompt_tokens"].as_u64().unwrap_or(tokens.input);
                tokens.output = u["completion_tokens"].as_u64().unwrap_or(tokens.output);
            }
            if let Some(text) = v["choices"][0]["delta"]["content"].as_str() {
                if !text.is_empty() && !on_delta(text) {
                    break;
                }
            }
        }
        Ok(tokens)
    }
}

pub struct Anthropic {
    pub base_url: String,
    pub key: String,
}

impl Provider for Anthropic {
    fn stream(
        &self,
        req: &ChatRequest,
        on_delta: &mut dyn FnMut(&str) -> bool,
    ) -> Result<Tokens, String> {
        let messages: Vec<Value> = req
            .messages
            .iter()
            .map(|m| json!({"role": m.role, "content": m.content}))
            .collect();
        let mut body = json!({
            "model": req.model,
            "max_tokens": 4096,
            "messages": messages,
            "stream": true,
        });
        if !req.system.is_empty() {
            body["system"] = json!(req.system);
        }
        let resp = agent(300)
            .post(&join_url(&self.base_url, "messages"))
            .set("x-api-key", &self.key)
            .set("anthropic-version", "2023-06-01")
            .send_json(body)
            .map_err(http_error)?;
        let mut tokens = Tokens::default();
        for line in BufReader::new(resp.into_reader()).lines() {
            let line = line.map_err(|e| e.to_string())?;
            let Some(data) = line.strip_prefix("data:") else {
                continue;
            };
            let Ok(v) = serde_json::from_str::<Value>(data.trim()) else {
                continue;
            };
            match v["type"].as_str() {
                Some("message_start") => {
                    tokens.input = v["message"]["usage"]["input_tokens"].as_u64().unwrap_or(0);
                }
                Some("message_delta") => {
                    tokens.output = v["usage"]["output_tokens"]
                        .as_u64()
                        .unwrap_or(tokens.output);
                }
                Some("content_block_delta") => {
                    if let Some(t) = v["delta"]["text"].as_str() {
                        if !on_delta(t) {
                            break;
                        }
                    }
                }
                Some("error") => {
                    return Err(v["error"]["message"]
                        .as_str()
                        .unwrap_or("Anthropic error")
                        .to_string());
                }
                _ => {}
            }
        }
        Ok(tokens)
    }
}

// ---- coding-agent CLIs ---------------------------------------------------------------------

/// An agent CLI dhyana knows how to call non-interactively. The conversation is written to the
/// agent's stdin and its stdout is streamed back.
pub struct KnownAgent {
    pub id: &'static str,
    pub label: &'static str,
    /// Executable names to look for on PATH.
    pub bins: &'static [&'static str],
    /// Arguments that make it answer once and print the reply.
    pub args: &'static [&'static str],
}

pub const KNOWN_AGENTS: &[KnownAgent] = &[
    KnownAgent {
        id: "claude",
        label: "Claude Code",
        bins: &["claude"],
        args: &["-p"],
    },
    KnownAgent {
        id: "codex",
        label: "OpenAI Codex CLI",
        bins: &["codex"],
        args: &["exec", "-"],
    },
    KnownAgent {
        id: "gemini",
        label: "Gemini CLI",
        bins: &["gemini"],
        args: &["-p", "Answer the conversation given on stdin."],
    },
    KnownAgent {
        id: "agy",
        label: "Antigravity (agy)",
        bins: &["agy"],
        args: &["-p"],
    },
];

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DetectedAgent {
    pub id: String,
    pub label: String,
    pub path: String,
}

/// Look for `bin` in the directories of `path_var`.
pub fn find_in_path(bin: &str, path_var: &std::ffi::OsStr) -> Option<PathBuf> {
    let exts: &[&str] = if cfg!(windows) {
        &[".exe", ".cmd", ".bat", ".com"]
    } else {
        &[""]
    };
    for dir in std::env::split_paths(path_var) {
        for ext in exts {
            let p = dir.join(format!("{bin}{ext}"));
            if p.is_file() {
                return Some(p);
            }
        }
    }
    None
}

/// The known agent CLIs found on PATH.
pub fn detect_agents() -> Vec<DetectedAgent> {
    let Some(path) = std::env::var_os("PATH") else {
        return Vec::new();
    };
    KNOWN_AGENTS
        .iter()
        .filter_map(|a| {
            a.bins
                .iter()
                .find_map(|b| find_in_path(b, &path))
                .map(|p| DetectedAgent {
                    id: a.id.into(),
                    label: a.label.into(),
                    path: p.display().to_string(),
                })
        })
        .collect()
}

pub struct AgentCli {
    pub program: PathBuf,
    pub args: Vec<String>,
}

impl AgentCli {
    /// `agent_id` is a known id, or `custom` with `command_override` (a program and arguments
    /// separated by spaces). An override wins for any id.
    pub fn resolve(agent_id: &str, command_override: &str) -> Result<AgentCli, String> {
        let over: Vec<String> = command_override
            .split_whitespace()
            .map(str::to_string)
            .collect();
        if let Some((prog, rest)) = over.split_first() {
            let program = find_in_path(prog, &std::env::var_os("PATH").unwrap_or_default())
                .unwrap_or_else(|| PathBuf::from(prog));
            return Ok(AgentCli {
                program,
                args: rest.to_vec(),
            });
        }
        let known = KNOWN_AGENTS
            .iter()
            .find(|a| a.id == agent_id)
            .ok_or_else(|| format!("unknown agent '{agent_id}'"))?;
        let path = std::env::var_os("PATH").unwrap_or_default();
        let program = known
            .bins
            .iter()
            .find_map(|b| find_in_path(b, &path))
            .ok_or_else(|| format!("{} was not found on PATH", known.label))?;
        Ok(AgentCli {
            program,
            args: known.args.iter().map(|s| s.to_string()).collect(),
        })
    }

    /// The conversation as the plain text written to the agent.
    pub fn transcript(req: &ChatRequest) -> String {
        let mut out = String::new();
        if !req.system.is_empty() {
            out.push_str(&req.system);
            out.push_str("\n\n");
        }
        out.push_str("Answer using only the text below. Do not use tools or read files.\n\n");
        for m in &req.messages {
            let who = if m.role == "assistant" {
                "Assistant"
            } else {
                "User"
            };
            out.push_str(&format!("{who}: {}\n\n", m.content));
        }
        out.push_str("Assistant:");
        out
    }
}

/// An empty directory the agent runs in, so it has nothing of the vault to wander into.
fn sandbox_dir() -> PathBuf {
    let dir = std::env::temp_dir().join("dhyana-agent");
    let _ = std::fs::create_dir_all(&dir);
    dir
}

impl Provider for AgentCli {
    fn stream(
        &self,
        req: &ChatRequest,
        on_delta: &mut dyn FnMut(&str) -> bool,
    ) -> Result<Tokens, String> {
        let prompt = Self::transcript(req);
        let mut child = Command::new(&self.program)
            .args(&self.args)
            .current_dir(sandbox_dir())
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| format!("could not start {}: {e}", self.program.display()))?;
        let mut stdin = child.stdin.take().ok_or("no stdin")?;
        let to_write = prompt.clone();
        let writer = std::thread::spawn(move || {
            let _ = stdin.write_all(to_write.as_bytes());
        });
        let mut stdout = child.stdout.take().ok_or("no stdout")?;
        let mut buf = [0u8; 2048];
        let mut pending: Vec<u8> = Vec::new();
        let mut produced = String::new();
        loop {
            let n = stdout.read(&mut buf).map_err(|e| e.to_string())?;
            if n == 0 {
                break;
            }
            pending.extend_from_slice(&buf[..n]);
            // Only emit complete UTF-8; keep a split character for the next read.
            let valid = match std::str::from_utf8(&pending) {
                Ok(_) => pending.len(),
                Err(e) => e.valid_up_to(),
            };
            if valid > 0 {
                let text = String::from_utf8_lossy(&pending[..valid]).into_owned();
                pending.drain(..valid);
                produced.push_str(&text);
                if !on_delta(&text) {
                    let _ = child.kill();
                    break;
                }
            }
        }
        let _ = writer.join();
        let status = child.wait().map_err(|e| e.to_string())?;
        if !status.success() && produced.is_empty() {
            let mut err = String::new();
            if let Some(mut e) = child.stderr.take() {
                let _ = e.read_to_string(&mut err);
            }
            return Err(format!(
                "{} exited with {status}: {}",
                self.program.display(),
                err.trim().chars().take(300).collect::<String>()
            ));
        }
        Ok(Tokens {
            input: super::log::estimate_tokens(&prompt),
            output: super::log::estimate_tokens(&produced),
        })
    }
}

/// Build the provider for `kind`. `key` comes from the keychain.
pub fn build(
    kind: ProviderKind,
    cfg: &ProviderConfig,
    key: Option<String>,
) -> Result<Box<dyn Provider>, String> {
    match kind {
        ProviderKind::Anthropic => Ok(Box::new(Anthropic {
            base_url: cfg.base_url.clone(),
            key: key.ok_or("no Anthropic API key saved")?,
        })),
        ProviderKind::Agent => Ok(Box::new(AgentCli::resolve(&cfg.model, &cfg.base_url)?)),
        ProviderKind::Local => Ok(Box::new(OpenAiCompat {
            base_url: cfg.base_url.clone(),
            key,
        })),
        other => Ok(Box::new(OpenAiCompat {
            base_url: cfg.base_url.clone(),
            key: Some(key.ok_or_else(|| format!("no {} API key saved", other.id()))?),
        })),
    }
}

/// Used by tests and the settings screen to check a path exists.
pub fn exists(p: &Path) -> bool {
    p.is_file()
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn openai_body_has_system_first_and_streams() {
        let req = ChatRequest {
            system: "be kind".into(),
            messages: vec![Message {
                role: "user".into(),
                content: "hi".into(),
            }],
            model: "m".into(),
        };
        let b = OpenAiCompat::body(&req);
        assert_eq!(b["messages"][0]["role"], "system");
        assert_eq!(b["messages"][1]["content"], "hi");
        assert_eq!(b["stream"], true);
    }

    #[test]
    fn finds_binaries_on_a_path() {
        let dir = tempdir().unwrap();
        let name = if cfg!(windows) {
            "fakeagent.exe"
        } else {
            "fakeagent"
        };
        std::fs::write(dir.path().join(name), b"").unwrap();
        let path = std::env::join_paths([dir.path()]).unwrap();
        assert!(find_in_path("fakeagent", &path).is_some());
        assert!(find_in_path("nothere", &path).is_none());
    }

    #[test]
    fn transcript_ends_with_assistant_turn() {
        let t = AgentCli::transcript(&ChatRequest {
            system: "S".into(),
            messages: vec![Message {
                role: "user".into(),
                content: "hello".into(),
            }],
            model: String::new(),
        });
        assert!(t.starts_with('S') && t.contains("User: hello") && t.ends_with("Assistant:"));
    }

    #[test]
    fn unknown_agent_is_an_error() {
        assert!(AgentCli::resolve("nope", "").is_err());
    }
}
