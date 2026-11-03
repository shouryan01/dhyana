//! AI configuration, saved as `ai.json` in app data (never in the vault). API keys are not here:
//! they live in the OS keychain (`privacy::keychain`).

use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "lowercase")]
pub enum ProviderKind {
    /// Any OpenAI-compatible endpoint, normally Ollama or LM Studio on this machine.
    Local,
    Anthropic,
    Openai,
    Gemini,
    Groq,
    Openrouter,
    /// A coding-agent CLI already installed on this machine (claude, codex, gemini, agy...),
    /// run non-interactively. `model` holds the agent id; `base_url` an optional command override.
    Agent,
}

impl ProviderKind {
    pub const ALL: [ProviderKind; 7] = [
        ProviderKind::Local,
        ProviderKind::Anthropic,
        ProviderKind::Openai,
        ProviderKind::Gemini,
        ProviderKind::Groq,
        ProviderKind::Openrouter,
        ProviderKind::Agent,
    ];

    pub fn id(self) -> &'static str {
        match self {
            ProviderKind::Local => "local",
            ProviderKind::Anthropic => "anthropic",
            ProviderKind::Openai => "openai",
            ProviderKind::Gemini => "gemini",
            ProviderKind::Groq => "groq",
            ProviderKind::Openrouter => "openrouter",
            ProviderKind::Agent => "agent",
        }
    }

    pub fn default_base_url(self) -> &'static str {
        match self {
            ProviderKind::Local => "http://localhost:11434/v1",
            ProviderKind::Anthropic => "https://api.anthropic.com/v1",
            ProviderKind::Openai => "https://api.openai.com/v1",
            ProviderKind::Gemini => "https://generativelanguage.googleapis.com/v1beta/openai",
            ProviderKind::Groq => "https://api.groq.com/openai/v1",
            ProviderKind::Openrouter => "https://openrouter.ai/api/v1",
            ProviderKind::Agent => "",
        }
    }

    pub fn default_model(self) -> &'static str {
        match self {
            ProviderKind::Local => "llama3.2",
            ProviderKind::Anthropic => "claude-sonnet-5-5",
            ProviderKind::Openai => "gpt-4o-mini",
            ProviderKind::Gemini => "gemini-2.0-flash",
            ProviderKind::Groq => "llama-3.3-70b-versatile",
            ProviderKind::Openrouter => "openai/gpt-4o-mini",
            ProviderKind::Agent => "claude",
        }
    }

    pub fn parse(s: &str) -> Option<ProviderKind> {
        Self::ALL.into_iter().find(|k| k.id() == s)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", default)]
pub struct ProviderConfig {
    pub base_url: String,
    pub model: String,
    /// The user accepted the consent screen for this provider at this `base_url`. Reset
    /// whenever the URL changes.
    pub consented: bool,
}

impl ProviderConfig {
    pub fn for_kind(kind: ProviderKind) -> Self {
        ProviderConfig {
            base_url: kind.default_base_url().into(),
            model: kind.default_model().into(),
            consented: false,
        }
    }
}

impl Default for ProviderConfig {
    fn default() -> Self {
        ProviderConfig::for_kind(ProviderKind::Local)
    }
}

/// A provider plus model, used for the separately configured fast model.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ModelChoice {
    pub provider: ProviderKind,
    pub model: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", default)]
pub struct AiSettings {
    /// The master switch. Off: no AI code path runs, no request leaves the machine.
    pub enabled: bool,
    pub providers: std::collections::BTreeMap<String, ProviderConfig>,
    /// Provider used for chat.
    pub active: ProviderKind,
    /// Optional quick model for sidebar nudges (e.g. Groq), configured apart from chat.
    pub fast: Option<ModelChoice>,
    /// Custom assistant instructions, added to the system prompt.
    pub instructions: String,
    /// Vault-relative folders the AI may read (`journal/2026`, `people`...). Empty = all.
    pub allowed_folders: Vec<String>,
    /// The MCP server answers clients (off by default; read-only, there is no write tool).
    pub mcp_enabled: bool,
    /// The user accepted the consent screen for the MCP server.
    pub mcp_consented: bool,
}

impl Default for AiSettings {
    fn default() -> Self {
        AiSettings {
            enabled: false,
            providers: ProviderKind::ALL
                .into_iter()
                .map(|k| (k.id().to_string(), ProviderConfig::for_kind(k)))
                .collect(),
            active: ProviderKind::Local,
            fast: None,
            instructions: String::new(),
            allowed_folders: Vec::new(),
            mcp_enabled: false,
            mcp_consented: false,
        }
    }
}

impl AiSettings {
    pub fn config(&self, kind: ProviderKind) -> ProviderConfig {
        self.providers
            .get(kind.id())
            .cloned()
            .unwrap_or_else(|| ProviderConfig::for_kind(kind))
    }

    pub fn load(path: &Path) -> AiSettings {
        let mut s: AiSettings = fs::read_to_string(path)
            .ok()
            .and_then(|t| serde_json::from_str(&t).ok())
            .unwrap_or_default();
        // Keep every provider present even if the file predates one.
        for k in ProviderKind::ALL {
            s.providers
                .entry(k.id().to_string())
                .or_insert_with(|| ProviderConfig::for_kind(k));
        }
        s
    }

    pub fn save(&self, path: &Path) -> std::io::Result<()> {
        if let Some(dir) = path.parent() {
            fs::create_dir_all(dir)?;
        }
        let tmp: PathBuf = path.with_extension("json.tmp");
        fs::write(&tmp, serde_json::to_vec_pretty(self)?)?;
        fs::rename(&tmp, path)
    }

    /// Is a vault-relative note path inside the allow list?
    pub fn path_allowed(&self, rel: &str) -> bool {
        self.allowed_folders.is_empty()
            || self.allowed_folders.iter().any(|f| {
                let f = f.trim_matches('/');
                rel == f || rel.starts_with(&format!("{f}/"))
            })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn off_by_default_and_nothing_consented() {
        let s = AiSettings::default();
        assert!(!s.enabled && !s.mcp_enabled && !s.mcp_consented);
        assert!(s.providers.values().all(|p| !p.consented));
        assert_eq!(s.providers.len(), 7);
    }

    #[test]
    fn allow_list_matches_folders_not_name_prefixes() {
        let s = AiSettings {
            allowed_folders: vec!["journal/2026".into(), "people/".into()],
            ..AiSettings::default()
        };
        assert!(s.path_allowed("journal/2026/01/2026-01-02.md"));
        assert!(s.path_allowed("people/Alice.md"));
        assert!(!s.path_allowed("journal/2025/01/2025-01-02.md"));
        assert!(!s.path_allowed("journal/20260/x.md"));
        assert!(AiSettings::default().path_allowed("anything/at/all.md"));
    }

    #[test]
    fn partial_file_gets_defaults() {
        let s: AiSettings = serde_json::from_str(r#"{"enabled":true}"#).unwrap();
        assert!(s.enabled);
        assert_eq!(s.active, ProviderKind::Local);
    }
}
