# Privacy and AI

AI in dhyāna is optional. It is **off by default**, and with the master switch off nothing AI-related runs: no requests, no keychain access, no search for installed agents, no AI interface (the chat sidebar and its commands disappear).

Turn it on in **Settings → AI**.

## Where text can go

| Provider                                    | Goes to                                                                                                                                                          | Needs approval |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| Local model (Ollama, LM Studio)             | An OpenAI-compatible server on this computer (`localhost`)                                                                                                       | No             |
| Installed agent                             | A coding-agent program already on this computer (Claude Code, Codex CLI, Gemini CLI, Antigravity `agy`, or your own command). It forwards text to its own vendor | Yes            |
| Anthropic, OpenAI, Gemini, Groq, OpenRouter | The provider's API, with your own key                                                                                                                            | Yes            |
| MCP server                                  | Any MCP client you configure (Claude Desktop, Claude Code…)                                                                                                      | Yes            |

A "local" provider whose address is not `localhost` counts as cloud and needs approval too. Changing a provider's address withdraws its approval.

**Approval** is a consent screen per provider that says where the text goes and what can and cannot be sent. Nothing is sent to a cloud provider until you accept it, and you can withdraw it at any time.

## Installed agents

With AI on, dhyāna looks on your `PATH` for `claude`, `codex`, `gemini` and `agy` and lists the ones it finds under **Agent**. Pick one, approve it, and chat uses it like any other provider. To use another program, enter its command (and arguments) under **Custom command**; the conversation is written to its standard input and its output is streamed back.

Agents run in an empty temporary folder, so they have no access to your vault, and the prompt tells them not to use tools. They only see the context shown in "What will be sent?". The exact flags dhyāna passes are listed in `KNOWN_AGENTS` (`src-tauri/src/ai/provider.rs`); if a CLI changes its non-interactive flags, use the custom command.

## What is sent, and what never is

Sent: the messages you type; the entries, selections and people you attach; entries found by search when you turn on **Search my journal** for a chat (off by default, per chat); your assistant instructions.

Never sent, anywhere (chat, search snippets, mentions, counts, person summaries, MCP):

- days with `private: true` in their frontmatter,
- anything outside the **folders the AI may read**, if you set that list (for example `journal/2026`, `people`),
- API keys, or the rest of your vault.

This is enforced in one place, the tool layer (`src-tauri/src/ai/tools.rs`), and covered by tests. Before each message, **What will be sent?** shows the exact system prompt and messages, and what was left out and why.

## Keys

API keys are stored in the operating system's keychain (Windows Credential Manager, macOS Keychain), never in the vault or in dhyāna's settings file.

## The tools

Chat retrieval and the MCP server share one tool contract, so they behave identically:

`read_entry`, `list_entries`, `search`, `get_person`, `list_people`, and `propose_edit` (a stub until 0.6: it changes nothing). There is no write tool; the AI cannot edit your journal in 0.5.

## MCP server

Turn on **MCP server** in Settings → AI, approve it, and copy the configuration shown into your client. It launches dhyāna as `dhyana --mcp`, a separate process with no window that opens its own copy of the index. It re-reads your settings on every call, so switching it off in the app takes effect immediately, and a refused call reads nothing. It is read-only.

For Claude Desktop, add the snippet from Settings to `claude_desktop_config.json` (Settings, Developer, Edit config) and restart it. For Claude Code: `claude mcp add dhyana -- "<path to dhyana>" --mcp`.

## Request log and usage

Every chat request and MCP tool call is appended to a local log (`ai/requests.jsonl` in the app data folder, not the vault) with the exact text sent, which provider, whether it left your computer, and approximate token counts. **Settings → AI → View log** shows it; you can clear it. Token counts use the provider's numbers when reported and an estimate otherwise.

## Chats

Chat sessions are saved as JSON in `.dhyana/chats/` inside the vault (they contain AI replies, so they are kept with your notes). Past chats are under the history button in the sidebar.

## Fast model

Settings → AI → **Fast model for nudges** picks a separate quick model (for example Groq) for small prompts. Proactive nudges themselves arrive in 0.7; the setting is stored now and uses that provider's approval.
