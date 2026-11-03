//! The gate. Every AI request and tool call asks here first, so "AI off means nothing leaves the
//! machine" is enforced in one place instead of at each call site.

use super::settings::{AiSettings, ProviderConfig, ProviderKind};

/// Where a request would go.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Egress {
    /// Stays on this machine (a loopback endpoint).
    Local,
    /// Leaves the machine: a cloud API, a remote endpoint, or an agent CLI that talks to its
    /// vendor. Needs the user's consent for this provider.
    Cloud,
}

/// Is `url` served from this machine?
pub fn is_loopback(url: &str) -> bool {
    let rest = url.split("://").nth(1).unwrap_or(url);
    let host_port = rest.split(['/', '?', '#']).next().unwrap_or("");
    let host_port = host_port.rsplit('@').next().unwrap_or("");
    let host = if let Some(v6) = host_port.strip_prefix('[') {
        v6.split(']').next().unwrap_or("")
    } else {
        host_port.split(':').next().unwrap_or("")
    };
    matches!(
        host.to_ascii_lowercase().as_str(),
        "localhost" | "127.0.0.1" | "::1"
    )
}

pub fn egress_of(kind: ProviderKind, cfg: &ProviderConfig) -> Egress {
    match kind {
        ProviderKind::Local if is_loopback(&cfg.base_url) => Egress::Local,
        _ => Egress::Cloud,
    }
}

/// May a chat request go to this provider right now?
pub fn check_chat(s: &AiSettings, kind: ProviderKind) -> Result<Egress, String> {
    if !s.enabled {
        return Err("AI is turned off. Turn it on in Settings > AI.".into());
    }
    let cfg = s.config(kind);
    let egress = egress_of(kind, &cfg);
    if egress == Egress::Cloud && !cfg.consented {
        return Err(format!(
            "{} has not been approved yet. Review and accept the consent screen in Settings > AI.",
            kind.id()
        ));
    }
    Ok(egress)
}

/// May the MCP server answer a client right now?
pub fn check_mcp(s: &AiSettings) -> Result<(), String> {
    if !s.enabled {
        return Err("AI is turned off in dhyana (Settings > AI).".into());
    }
    if !s.mcp_enabled {
        return Err("The MCP server is off. Turn it on in dhyana: Settings > AI.".into());
    }
    if !s.mcp_consented {
        return Err("The MCP server has not been approved. Accept the consent screen in dhyana: Settings > AI.".into());
    }
    Ok(())
}

/// API keys live in the OS keychain, never in the vault or in `ai.json`.
pub mod keychain {
    const SERVICE: &str = "dhyana";

    fn entry(provider: &str) -> Result<keyring::Entry, String> {
        keyring::Entry::new(SERVICE, &format!("ai:{provider}")).map_err(|e| e.to_string())
    }

    pub fn get(provider: &str) -> Option<String> {
        entry(provider)
            .ok()?
            .get_password()
            .ok()
            .filter(|k| !k.is_empty())
    }

    pub fn set(provider: &str, key: &str) -> Result<(), String> {
        entry(provider)?
            .set_password(key)
            .map_err(|e| e.to_string())
    }

    pub fn clear(provider: &str) -> Result<(), String> {
        match entry(provider)?.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => Err(e.to_string()),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn loopback_detection() {
        assert!(is_loopback("http://localhost:11434/v1"));
        assert!(is_loopback("http://127.0.0.1:1234/v1"));
        assert!(is_loopback("http://[::1]:8080"));
        assert!(!is_loopback("http://192.168.1.5:11434/v1"));
        assert!(!is_loopback("https://api.openai.com/v1"));
        assert!(!is_loopback("http://localhost.evil.com/v1"));
        assert!(!is_loopback("http://localhost@evil.com/v1"));
    }

    #[test]
    fn off_means_no_requests() {
        let s = AiSettings::default();
        for k in ProviderKind::ALL {
            assert!(check_chat(&s, k).is_err());
        }
        assert!(check_mcp(&s).is_err());
    }

    #[test]
    fn cloud_needs_consent_local_does_not() {
        let mut s = AiSettings {
            enabled: true,
            ..AiSettings::default()
        };
        assert_eq!(check_chat(&s, ProviderKind::Local), Ok(Egress::Local));
        assert!(check_chat(&s, ProviderKind::Openai).is_err());
        assert!(check_chat(&s, ProviderKind::Agent).is_err());
        s.providers.get_mut("openai").unwrap().consented = true;
        assert_eq!(check_chat(&s, ProviderKind::Openai), Ok(Egress::Cloud));
        // A "local" provider pointed at another machine is cloud egress.
        s.providers.get_mut("local").unwrap().base_url = "http://10.0.0.7:11434/v1".into();
        assert!(check_chat(&s, ProviderKind::Local).is_err());
    }

    #[test]
    fn mcp_needs_all_three() {
        let mut s = AiSettings {
            enabled: true,
            ..AiSettings::default()
        };
        assert!(check_mcp(&s).is_err());
        s.mcp_enabled = true;
        assert!(check_mcp(&s).is_err());
        s.mcp_consented = true;
        assert!(check_mcp(&s).is_ok());
    }
}
