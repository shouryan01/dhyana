//! Tauri commands for the AI features. Thin wrappers over `crate::ai`.

use std::collections::BTreeMap;
use std::fs;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{AppHandle, Emitter, Manager, State};

use crate::ai::chat::{self, Built, ChatInput};
use crate::ai::log::{self, LogEntry, Usage};
use crate::ai::privacy;
use crate::ai::provider::{self, DetectedAgent};
use crate::ai::settings::{AiSettings, ProviderKind};
use crate::ai::tools::Tools;
use crate::commands::AppCtx;

const DELTA_EVENT: &str = "ai://delta";
const DONE_EVENT: &str = "ai://done";
const ERROR_EVENT: &str = "ai://error";

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiView {
    pub settings: AiSettings,
    /// Which providers have a key in the keychain. Only filled in while AI is on: with the master
    /// switch off the keychain is not touched.
    pub has_key: BTreeMap<String, bool>,
}

fn view(s: AiSettings) -> AiView {
    let has_key = if s.enabled {
        ProviderKind::ALL
            .into_iter()
            .map(|k| (k.id().to_string(), privacy::keychain::get(k.id()).is_some()))
            .collect()
    } else {
        BTreeMap::new()
    };
    AiView {
        settings: s,
        has_key,
    }
}

fn save(ctx: &AppCtx, s: &AiSettings) -> Result<(), String> {
    s.save(&ctx.ai_path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn ai_get_settings(ctx: State<AppCtx>) -> Result<AiView, String> {
    Ok(view(ctx.ai.lock().map_err(|e| e.to_string())?.clone()))
}

/// Replace the settings. Consent is never taken from the caller: it is kept as it was, and
/// cleared for any provider whose address changed (`ai_consent` is the only way to set it).
#[tauri::command]
pub fn ai_update_settings(ctx: State<AppCtx>, settings: AiSettings) -> Result<AiView, String> {
    let mut cur = ctx.ai.lock().map_err(|e| e.to_string())?;
    let mut next = settings;
    for (id, cfg) in next.providers.iter_mut() {
        let old = cur.providers.get(id);
        cfg.consented = old.is_some_and(|o| {
            o.consented && o.base_url == cfg.base_url && (id != "agent" || o.model == cfg.model)
        });
    }
    next.mcp_consented = cur.mcp_consented;
    if !next.enabled {
        next.mcp_enabled = false;
    }
    save(&ctx, &next)?;
    *cur = next.clone();
    Ok(view(next))
}

/// Record (or withdraw) the user's approval from the consent screen. `target` is a provider id
/// or `mcp`.
#[tauri::command]
pub fn ai_consent(ctx: State<AppCtx>, target: String, accepted: bool) -> Result<AiView, String> {
    let mut s = ctx.ai.lock().map_err(|e| e.to_string())?;
    if target == "mcp" {
        s.mcp_consented = accepted;
    } else {
        let kind = ProviderKind::parse(&target).ok_or("unknown provider")?;
        s.providers
            .entry(kind.id().to_string())
            .or_insert_with(|| crate::ai::settings::ProviderConfig::for_kind(kind))
            .consented = accepted;
    }
    save(&ctx, &s)?;
    Ok(view(s.clone()))
}

#[tauri::command]
pub fn ai_set_key(ctx: State<AppCtx>, provider: String, key: String) -> Result<(), String> {
    if !ctx.ai.lock().map_err(|e| e.to_string())?.enabled {
        return Err("Turn AI on first.".into());
    }
    ProviderKind::parse(&provider).ok_or("unknown provider")?;
    privacy::keychain::set(&provider, key.trim())
}

#[tauri::command]
pub fn ai_clear_key(provider: String) -> Result<(), String> {
    ProviderKind::parse(&provider).ok_or("unknown provider")?;
    privacy::keychain::clear(&provider)
}

/// Agent CLIs (claude, codex, gemini, agy...) found on PATH. Only looks at PATH, and only while
/// AI is on.
#[tauri::command]
pub fn ai_detect_agents(ctx: State<AppCtx>) -> Result<Vec<DetectedAgent>, String> {
    if !ctx.ai.lock().map_err(|e| e.to_string())?.enabled {
        return Ok(Vec::new());
    }
    Ok(provider::detect_agents())
}

fn build(ctx: &AppCtx, input: &ChatInput) -> Result<Built, String> {
    let settings = ctx.ai.lock().map_err(|e| e.to_string())?.clone();
    ctx.with_index(|vault, idx| {
        let tools = Tools {
            vault,
            index: idx,
            settings: &settings,
        };
        chat::build(&settings, &tools, input)
    })
}

/// Exactly what a send would transmit, for the "what will be sent" view.
#[tauri::command]
pub fn ai_preview(ctx: State<AppCtx>, input: ChatInput) -> Result<Built, String> {
    build(&ctx, &input)
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DeltaEvent {
    id: String,
    text: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ErrorEvent {
    id: String,
    message: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DoneEvent {
    id: String,
    #[serde(flatten)]
    done: chat::Done,
}

/// Start a streamed reply. Returns at once; text arrives as `ai://delta` events keyed by `id`,
/// then `ai://done` or `ai://error`.
#[tauri::command]
pub fn ai_send(
    app: AppHandle,
    ctx: State<AppCtx>,
    id: String,
    input: ChatInput,
) -> Result<Built, String> {
    let built = build(&ctx, &input)?;
    let settings = ctx.ai.lock().map_err(|e| e.to_string())?.clone();
    let log_path = ctx.ai_log.clone();
    if let Ok(mut c) = ctx.ai_cancelled.lock() {
        c.remove(&id);
    }
    let thread_built = built.clone();
    let key = privacy::keychain::get(&built.provider);
    std::thread::spawn(move || {
        let handle = app.clone();
        let stream_id = id.clone();
        let result = chat::run(&settings, &thread_built, key, &log_path, &mut |t| {
            let _ = handle.emit(
                DELTA_EVENT,
                DeltaEvent {
                    id: stream_id.clone(),
                    text: t.to_string(),
                },
            );
            let ctx = handle.state::<AppCtx>();
            let stopped = ctx
                .ai_cancelled
                .lock()
                .map(|c| c.contains(&stream_id))
                .unwrap_or(false);
            !stopped
        });
        match result {
            Ok(done) => {
                let _ = app.emit(DONE_EVENT, DoneEvent { id, done });
            }
            Err(message) => {
                let _ = app.emit(ERROR_EVENT, ErrorEvent { id, message });
            }
        }
    });
    Ok(built)
}

#[tauri::command]
pub fn ai_cancel(ctx: State<AppCtx>, id: String) {
    if let Ok(mut c) = ctx.ai_cancelled.lock() {
        c.insert(id);
    }
}

#[tauri::command]
pub fn ai_usage(ctx: State<AppCtx>) -> Usage {
    log::usage(&ctx.ai_log)
}

#[tauri::command]
pub fn ai_log(ctx: State<AppCtx>, limit: Option<usize>) -> Vec<LogEntry> {
    log::read(&ctx.ai_log, limit.unwrap_or(100).min(1000))
}

#[tauri::command]
pub fn ai_clear_log(ctx: State<AppCtx>) -> Result<(), String> {
    log::clear(&ctx.ai_log).map_err(|e| e.to_string())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct McpInfo {
    pub command: String,
    /// JSON to paste into Claude Desktop's config (or `claude mcp add`).
    pub config: Value,
}

#[tauri::command]
pub fn ai_mcp_info() -> Result<McpInfo, String> {
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    Ok(McpInfo {
        command: format!("\"{}\" --mcp", exe.display()),
        config: crate::ai::mcp::command_snippet(&exe),
    })
}

// ---- chat sessions: `.dhyana/chats/<id>.json` in the vault (master plan §4) -------------------

fn chats_dir(ctx: &AppCtx) -> Result<PathBuf, String> {
    Ok(ctx.vault()?.join(".dhyana").join("chats"))
}

fn safe_id(id: &str) -> Result<(), String> {
    if !id.is_empty()
        && id.len() <= 64
        && id
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
    {
        Ok(())
    } else {
        Err("invalid chat id".into())
    }
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionInfo {
    pub id: String,
    pub title: String,
    pub updated: String,
}

#[tauri::command]
pub fn ai_list_sessions(ctx: State<AppCtx>) -> Result<Vec<SessionInfo>, String> {
    let dir = chats_dir(&ctx)?;
    let mut out: Vec<SessionInfo> = fs::read_dir(&dir)
        .into_iter()
        .flatten()
        .flatten()
        .filter_map(|e| {
            let text = fs::read_to_string(e.path()).ok()?;
            let v: Value = serde_json::from_str(&text).ok()?;
            Some(SessionInfo {
                id: e.path().file_stem()?.to_str()?.to_string(),
                title: v["title"].as_str().unwrap_or("Chat").to_string(),
                updated: v["updated"].as_str().unwrap_or("").to_string(),
            })
        })
        .collect();
    out.sort_by(|a, b| b.updated.cmp(&a.updated));
    Ok(out)
}

#[tauri::command]
pub fn ai_load_session(ctx: State<AppCtx>, id: String) -> Result<Value, String> {
    safe_id(&id)?;
    let text = fs::read_to_string(chats_dir(&ctx)?.join(format!("{id}.json")))
        .map_err(|e| e.to_string())?;
    serde_json::from_str(&text).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn ai_save_session(ctx: State<AppCtx>, id: String, session: Value) -> Result<(), String> {
    safe_id(&id)?;
    let dir = chats_dir(&ctx)?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join(format!("{id}.json"));
    let tmp = path.with_extension("json.tmp");
    fs::write(
        &tmp,
        serde_json::to_vec_pretty(&session).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;
    fs::rename(&tmp, &path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn ai_delete_session(ctx: State<AppCtx>, id: String) -> Result<(), String> {
    safe_id(&id)?;
    match fs::remove_file(chats_dir(&ctx)?.join(format!("{id}.json"))) {
        Err(e) if e.kind() != std::io::ErrorKind::NotFound => Err(e.to_string()),
        _ => Ok(()),
    }
}
