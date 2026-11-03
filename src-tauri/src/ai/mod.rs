//! Everything AI. Off by default: with the master switch off nothing in here opens a socket,
//! reads the keychain or builds a prompt (see `privacy::Gate`).
//!
//! * `settings`: what the user configured (providers, consent, allow list), in app data.
//! * `privacy`: the one gate every outbound request and every tool call passes through.
//! * `tools`: the single tool contract, shared by the chat sidebar and the MCP server.
//! * `provider`: the provider trait with OpenAI-compatible and Anthropic implementations.
//! * `chat`: builds the exact context that is sent, and streams the reply.
//! * `log`: the local request log and usage totals.
//! * `mcp`: stdio MCP server exposing the tools to external clients.

pub mod chat;
pub mod log;
pub mod mcp;
pub mod privacy;
pub mod provider;
pub mod settings;
pub mod tools;
