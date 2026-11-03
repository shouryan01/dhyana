//! MCP server over stdio. Launched by the client (`dhyana --mcp`) as its own process, so it opens
//! its own copy of the index and reads the settings fresh on every call: turning MCP off in the
//! app takes effect immediately, with nothing to restart.
//!
//! It only exposes the shared tool contract, which has no write tool. Every call is a cloud
//! egress as far as the log is concerned.

use std::io::{BufRead, Write};
use std::path::{Path, PathBuf};

use serde_json::{json, Value};

use super::log::{self, LogEntry};
use super::privacy;
use super::settings::AiSettings;
use super::tools::{definitions, Tools};
use crate::index::{vault_id, Index};
use crate::settings::Settings;

const PROTOCOL: &str = "2024-11-05";

/// The app-data folder for the bundle identifier, matching Tauri's `app_data_dir`.
pub fn default_data_dir() -> Option<PathBuf> {
    if let Some(d) = std::env::var_os("DHYANA_DATA_DIR") {
        return Some(PathBuf::from(d));
    }
    let id = "com.dhyana.app";
    #[cfg(windows)]
    {
        std::env::var_os("APPDATA").map(|p| PathBuf::from(p).join(id))
    }
    #[cfg(target_os = "macos")]
    {
        std::env::var_os("HOME").map(|p| {
            PathBuf::from(p)
                .join("Library/Application Support")
                .join(id)
        })
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        std::env::var_os("XDG_DATA_HOME")
            .map(PathBuf::from)
            .or_else(|| std::env::var_os("HOME").map(|h| PathBuf::from(h).join(".local/share")))
            .map(|p| p.join(id))
    }
}

pub struct Server {
    pub data_dir: PathBuf,
}

impl Server {
    fn ai_path(&self) -> PathBuf {
        self.data_dir.join("ai.json")
    }
    fn log_path(&self) -> PathBuf {
        self.data_dir.join("ai").join("requests.jsonl")
    }

    fn log(&self, tool: &str, args: &Value, result: &Result<String, String>, dates: Vec<String>) {
        let sent = match result {
            Ok(r) => format!("tool {tool} {args}\n=> {r}"),
            Err(e) => format!("tool {tool} {args}\n=> error: {e}"),
        };
        let entry = LogEntry {
            at: chrono::Local::now().to_rfc3339(),
            kind: "mcp".into(),
            provider: "mcp".into(),
            model: tool.into(),
            cloud: true,
            output_tokens: log::estimate_tokens(&sent),
            sent,
            sources: dates,
            error: result.as_ref().err().cloned(),
            ..LogEntry::default()
        };
        let _ = log::append(&self.log_path(), &entry);
    }

    fn call_tool(&self, name: &str, args: &Value) -> Result<(String, Vec<String>), String> {
        let ai = AiSettings::load(&self.ai_path());
        privacy::check_mcp(&ai)?;
        let app = Settings::load(&self.data_dir.join("settings.json"));
        let vault = app
            .existing_vault()
            .ok_or("dhyana has no vault configured")?;
        let db = self
            .data_dir
            .join("index")
            .join(format!("{}-mcp.db", vault_id(&vault)));
        let mut index = Index::open(&db).map_err(|e| e.to_string())?;
        index.sync(&vault).map_err(|e| e.to_string())?;
        let tools = Tools {
            vault: &vault,
            index: &index,
            settings: &ai,
        };
        let out = tools.call(name, args)?;
        Ok((
            serde_json::to_string_pretty(&out.value).unwrap_or_default(),
            out.dates,
        ))
    }

    /// One JSON-RPC message in, the reply out (`None` for notifications).
    pub fn handle(&self, msg: &Value) -> Option<Value> {
        let id = msg.get("id").cloned();
        let method = msg["method"].as_str().unwrap_or("");
        let reply = |result: Value| {
            id.clone()
                .map(|id| json!({"jsonrpc": "2.0", "id": id, "result": result}))
        };
        match method {
            "initialize" => reply(json!({
                "protocolVersion": PROTOCOL,
                "capabilities": {"tools": {}},
                "serverInfo": {"name": "dhyana", "version": env!("CARGO_PKG_VERSION")},
            })),
            "ping" => reply(json!({})),
            "tools/list" => reply(json!({"tools": definitions()})),
            "tools/call" => {
                let name = msg["params"]["name"].as_str().unwrap_or("");
                let args = msg["params"]["arguments"].clone();
                let res = self.call_tool(name, &args);
                let (log_res, dates) = match &res {
                    Ok((text, dates)) => (Ok(text.clone()), dates.clone()),
                    Err(e) => (Err(e.clone()), vec![]),
                };
                // Refused calls (AI or MCP off) are not logged: nothing was read or sent.
                if privacy::check_mcp(&AiSettings::load(&self.ai_path())).is_ok() {
                    self.log(name, &args, &log_res, dates);
                }
                reply(match res {
                    Ok((text, _)) => json!({"content": [{"type": "text", "text": text}]}),
                    Err(e) => json!({"isError": true, "content": [{"type": "text", "text": e}]}),
                })
            }
            _ if id.is_some() => Some(json!({
                "jsonrpc": "2.0", "id": id,
                "error": {"code": -32601, "message": format!("method not found: {method}")}
            })),
            _ => None,
        }
    }
}

/// Serve newline-delimited JSON-RPC on stdin/stdout until the client closes it.
pub fn run_stdio() {
    let Some(data_dir) = default_data_dir() else {
        eprintln!("dhyana mcp: cannot find the app data folder (set DHYANA_DATA_DIR)");
        return;
    };
    serve(
        &Server { data_dir },
        std::io::stdin().lock(),
        std::io::stdout().lock(),
    );
}

pub fn serve(server: &Server, input: impl BufRead, mut out: impl Write) {
    for line in input.lines() {
        let Ok(line) = line else { break };
        if line.trim().is_empty() {
            continue;
        }
        let reply = match serde_json::from_str::<Value>(&line) {
            Ok(msg) => server.handle(&msg),
            Err(e) => Some(json!({
                "jsonrpc": "2.0", "id": null,
                "error": {"code": -32700, "message": format!("parse error: {e}")}
            })),
        };
        if let Some(r) = reply {
            if writeln!(out, "{r}").and_then(|_| out.flush()).is_err() {
                break;
            }
        }
    }
}

/// Where this program lives, for the config snippet shown in settings.
pub fn command_snippet(exe: &Path) -> Value {
    json!({"mcpServers": {"dhyana": {"command": exe.display().to_string(), "args": ["--mcp"]}}})
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::tempdir;

    fn setup(mcp_on: bool) -> (tempfile::TempDir, Server) {
        let dir = tempdir().unwrap();
        let vault = dir.path().join("vault");
        fs::create_dir_all(vault.join("journal/2026/01")).unwrap();
        fs::write(
            vault.join("journal/2026/01/2026-01-01.md"),
            "Tea and lanterns.\n",
        )
        .unwrap();
        fs::write(
            vault.join("journal/2026/01/2026-01-02.md"),
            "---\nprivate: true\n---\nSecret lanterns.\n",
        )
        .unwrap();
        let data = dir.path().join("data");
        let app = Settings {
            vault_path: Some(vault.display().to_string()),
            ..Settings::default()
        };
        app.save(&data.join("settings.json")).unwrap();
        AiSettings {
            enabled: mcp_on,
            mcp_enabled: mcp_on,
            mcp_consented: mcp_on,
            ..AiSettings::default()
        }
        .save(&data.join("ai.json"))
        .unwrap();
        (dir, Server { data_dir: data })
    }

    fn call(s: &Server, tool: &str, args: Value) -> Value {
        s.handle(&json!({"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":tool,"arguments":args}}))
            .unwrap()
    }

    #[test]
    fn handshake_and_tool_list() {
        let (_d, s) = setup(false);
        let init = s
            .handle(&json!({"jsonrpc":"2.0","id":1,"method":"initialize"}))
            .unwrap();
        assert_eq!(init["result"]["serverInfo"]["name"], "dhyana");
        assert!(s
            .handle(&json!({"jsonrpc":"2.0","method":"notifications/initialized"}))
            .is_none());
        let list = s
            .handle(&json!({"jsonrpc":"2.0","id":2,"method":"tools/list"}))
            .unwrap();
        assert_eq!(list["result"]["tools"].as_array().unwrap().len(), 6);
    }

    #[test]
    fn off_by_default_answers_nothing() {
        let (_d, s) = setup(false);
        let r = call(&s, "search", json!({"text":"lanterns"}));
        assert_eq!(r["result"]["isError"], true);
        assert!(!r.to_string().contains("Tea and lanterns"));
        assert!(!s.log_path().exists(), "refused calls leave no log");
    }

    #[test]
    fn on_serves_public_days_only_and_logs() {
        let (_d, s) = setup(true);
        let r = call(&s, "search", json!({"text":"lanterns"})).to_string();
        assert!(r.contains("2026-01-01") && !r.contains("2026-01-02") && !r.contains("Secret"));
        let private = call(&s, "read_entry", json!({"date":"2026-01-02"}));
        assert_eq!(private["result"]["isError"], true);
        let logged = log::read(&s.log_path(), 10);
        assert_eq!(logged.len(), 2);
        assert!(logged.iter().all(|e| e.cloud && e.kind == "mcp"));
    }

    #[test]
    fn serves_lines() {
        let (_d, s) = setup(true);
        let mut out = Vec::new();
        serve(
            &s,
            "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"ping\"}\nnot json\n".as_bytes(),
            &mut out,
        );
        let text = String::from_utf8(out).unwrap();
        assert_eq!(text.lines().count(), 2);
    }
}
