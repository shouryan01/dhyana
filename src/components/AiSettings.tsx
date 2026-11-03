import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { useApp } from "@/app/context";
import { Row, Section, Segmented } from "@/components/SettingsPage";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { backend } from "@/lib";
import {
  PROVIDER_IDS,
  PROVIDERS,
  type AiSettings,
  type DetectedAgent,
  type LogEntry,
  type McpInfo,
  type ProviderId,
  type Usage,
} from "@/lib/ai";

const ON_OFF = { on: "On", off: "Off" };
const SELECT =
  "h-8 rounded-md border border-border bg-popover px-2 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-ring/50";

/** Settings > AI: master switch, providers, privacy, MCP, usage and the request log. */
export function AiSection() {
  const app = useApp();
  const view = app.ai;
  const [agents, setAgents] = useState<DetectedAgent[]>([]);
  const [consentFor, setConsentFor] = useState<string | null>(null);
  const [logOpen, setLogOpen] = useState(false);
  const enabled = view?.settings.enabled ?? false;

  const commit = useCallback(
    async (next: AiSettings) => {
      try {
        app.setAi(await backend.aiUpdateSettings(next));
      } catch (e) {
        toast.error(`Couldn't save AI settings: ${e}`);
      }
    },
    [app],
  );

  // Looking for installed agents only happens while AI is on.
  useEffect(() => {
    if (enabled) void backend.aiDetectAgents().then(setAgents, () => setAgents([]));
    else setAgents([]);
  }, [enabled]);

  if (!view) return null;
  const s = view.settings;

  return (
    <Section title="AI" id="ai">
      <Row
        label="Use AI"
        hint="Off by default. When off, dhyāna makes no AI requests and shows no AI interface."
      >
        <Segmented
          options={["off", "on"]}
          labels={ON_OFF}
          value={enabled ? "on" : "off"}
          onChange={(v) => void commit({ ...s, enabled: v === "on" })}
        />
      </Row>

      {enabled && (
        <>
          <ProviderBlock
            settings={s}
            hasKey={view.hasKey}
            agents={agents}
            commit={commit}
            onConsent={setConsentFor}
            onKeyChange={() => void app.refreshAi()}
          />
          <FastModel settings={s} commit={commit} />
          <Row
            label="Assistant instructions"
            hint="Added to every chat, e.g. tone or how to address you."
          >
            <span />
          </Row>
          <InstructionsField
            value={s.instructions}
            onSave={(v) => void commit({ ...s, instructions: v })}
          />
          <Row
            label="Folders the AI may read"
            hint="One per line, like journal/2026 or people. Empty means everything except private days."
          >
            <span />
          </Row>
          <FoldersField
            value={s.allowedFolders}
            onSave={(v) => void commit({ ...s, allowedFolders: v })}
          />
          <McpBlock settings={s} commit={commit} onConsent={() => setConsentFor("mcp")} />
          <UsageBlock onOpenLog={() => setLogOpen(true)} version={logOpen} />
        </>
      )}

      <ConsentDialog
        target={consentFor}
        onClose={() => setConsentFor(null)}
        onAccept={async (t) => {
          const v = await backend.aiConsent(t, true);
          app.setAi(
            t === "mcp" ? await backend.aiUpdateSettings({ ...v.settings, mcpEnabled: true }) : v,
          );
          setConsentFor(null);
        }}
        settings={s}
      />
      <LogDialog open={logOpen} onClose={() => setLogOpen(false)} />
    </Section>
  );
}

function ProviderBlock({
  settings: s,
  hasKey,
  agents,
  commit,
  onConsent,
  onKeyChange,
}: {
  settings: AiSettings;
  hasKey: Record<string, boolean>;
  agents: DetectedAgent[];
  commit(next: AiSettings): Promise<void>;
  onConsent(target: string): void;
  onKeyChange(): void;
}) {
  const id = s.active;
  const info = PROVIDERS[id];
  const cfg = s.providers[id] ?? { baseUrl: "", model: "", consented: false };
  const isLocalEndpoint = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])([:/]|$)/i.test(cfg.baseUrl);
  const cloud = id !== "local" || !isLocalEndpoint;
  const setCfg = (patch: Partial<typeof cfg>) =>
    void commit({ ...s, providers: { ...s.providers, [id]: { ...cfg, ...patch } } });
  const [key, setKey] = useState("");

  return (
    <>
      <Row label="Chat provider" hint="Where chat requests go.">
        <select
          className={SELECT}
          value={id}
          onChange={(e) => void commit({ ...s, active: e.target.value as ProviderId })}
        >
          {PROVIDER_IDS.map((p) => (
            <option key={p} value={p}>
              {PROVIDERS[p].label}
            </option>
          ))}
        </select>
      </Row>

      {id === "agent" ? (
        <Row
          label="Agent"
          hint={
            agents.length
              ? "Found on this computer. Runs with no access to your vault; only the context you see in the chat is sent to it."
              : "None found on PATH (claude, codex, gemini, agy). Enter your own command below."
          }
        >
          <select
            className={SELECT}
            value={cfg.model}
            onChange={(e) => setCfg({ model: e.target.value })}
          >
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
            {!agents.some((a) => a.id === cfg.model) && (
              <option value={cfg.model}>{cfg.model}</option>
            )}
          </select>
        </Row>
      ) : (
        <Row label="Model">
          <TextField value={cfg.model} onSave={(v) => setCfg({ model: v })} width="w-56" />
        </Row>
      )}

      <Row
        label={id === "agent" ? "Custom command (optional)" : "Address"}
        hint={
          id === "agent"
            ? "A program and its arguments; the conversation is written to its input."
            : id === "local"
              ? "Ollama is http://localhost:11434/v1, LM Studio http://localhost:1234/v1. Pointing this at another machine counts as cloud."
              : undefined
        }
      >
        <TextField value={cfg.baseUrl} onSave={(v) => setCfg({ baseUrl: v })} width="w-72" />
      </Row>

      {info.needsKey && (
        <Row
          label="API key"
          hint={
            hasKey[id]
              ? "Saved in your operating system's keychain, never in the vault."
              : "Stored in your operating system's keychain, never in the vault."
          }
        >
          <div className="flex items-center gap-2">
            <Input
              type="password"
              autoComplete="off"
              placeholder={hasKey[id] ? "••••••••" : "Paste key"}
              value={key}
              onChange={(e) => setKey(e.target.value)}
              className="h-8 w-44"
            />
            <Button
              variant="outline"
              size="sm"
              disabled={!key.trim()}
              onClick={() =>
                void backend
                  .aiSetKey(id, key)
                  .then(() => {
                    setKey("");
                    onKeyChange();
                    toast.success("Key saved to the keychain");
                  })
                  .catch((e) => toast.error(`Couldn't save the key: ${e}`))
              }
            >
              Save
            </Button>
            {hasKey[id] && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  void backend.aiClearKey(id).then(() => {
                    onKeyChange();
                  })
                }
              >
                Remove
              </Button>
            )}
          </div>
        </Row>
      )}

      <Row
        label="Privacy approval"
        hint={
          !cloud
            ? "This stays on your computer, so no approval is needed."
            : cfg.consented
              ? "Approved. Changing the address withdraws the approval."
              : "Required before anything is sent."
        }
      >
        {!cloud ? (
          <span className="text-[12px] text-muted-foreground">Not needed</span>
        ) : cfg.consented ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => void backend.aiConsent(id, false).then(onKeyChange)}
          >
            Withdraw
          </Button>
        ) : (
          <Button size="sm" onClick={() => onConsent(id)}>
            Review and approve…
          </Button>
        )}
      </Row>
    </>
  );
}

function FastModel({
  settings: s,
  commit,
}: {
  settings: AiSettings;
  commit(next: AiSettings): Promise<void>;
}) {
  const fast = s.fast;
  return (
    <Row
      label="Fast model for nudges"
      hint="A quick, cheap model for small prompts (e.g. Groq), separate from chat. Uses that provider's approval."
    >
      <div className="flex items-center gap-2">
        <select
          className={SELECT}
          value={fast?.provider ?? ""}
          onChange={(e) =>
            void commit({
              ...s,
              fast: e.target.value
                ? {
                    provider: e.target.value as ProviderId,
                    model: s.providers[e.target.value]?.model ?? "",
                  }
                : null,
            })
          }
        >
          <option value="">None</option>
          {PROVIDER_IDS.map((p) => (
            <option key={p} value={p}>
              {PROVIDERS[p].label}
            </option>
          ))}
        </select>
        {fast && (
          <TextField
            value={fast.model}
            onSave={(model) => void commit({ ...s, fast: { ...fast, model } })}
            width="w-40"
          />
        )}
      </div>
    </Row>
  );
}

function McpBlock({
  settings: s,
  commit,
  onConsent,
}: {
  settings: AiSettings;
  commit(next: AiSettings): Promise<void>;
  onConsent(): void;
}) {
  const [info, setInfo] = useState<McpInfo | null>(null);
  useEffect(() => {
    if (s.mcpEnabled) void backend.aiMcpInfo().then(setInfo, () => setInfo(null));
  }, [s.mcpEnabled]);
  const config = info ? JSON.stringify(info.config, null, 2) : "";
  return (
    <>
      <Row
        label="MCP server"
        hint="Lets Claude Desktop, Claude Code and other MCP clients read your journal. Read-only; private days are never shared. Counts as cloud egress."
      >
        <Segmented
          options={["off", "on"]}
          labels={ON_OFF}
          value={s.mcpEnabled ? "on" : "off"}
          onChange={(v) => {
            if (v === "on" && !s.mcpConsented) onConsent();
            else void commit({ ...s, mcpEnabled: v === "on" });
          }}
        />
      </Row>
      {s.mcpEnabled && info && (
        <div className="mb-3 rounded-md border border-border bg-popover p-3 text-[12px]">
          <p className="mb-2 text-muted-foreground">
            Add this to your client's MCP configuration (Claude Desktop: Settings, Developer, Edit
            config), then restart it.
          </p>
          <pre className="overflow-x-auto whitespace-pre-wrap break-all font-mono text-[11.5px]">
            {config}
          </pre>
          <Button
            variant="outline"
            size="sm"
            className="mt-2"
            onClick={() =>
              void navigator.clipboard.writeText(config).then(() => toast.success("Copied"))
            }
          >
            Copy
          </Button>
        </div>
      )}
    </>
  );
}

function UsageBlock({ onOpenLog, version }: { onOpenLog(): void; version: boolean }) {
  const [u, setU] = useState<Usage | null>(null);
  useEffect(() => {
    void backend.aiUsage().then(setU, () => setU(null));
  }, [version]);
  return (
    <Row
      label="Usage and request log"
      hint={
        u
          ? `${u.requests} request${u.requests === 1 ? "" : "s"} (${u.cloudRequests} left this computer), about ${u.inputTokens.toLocaleString()} tokens in and ${u.outputTokens.toLocaleString()} out. Kept only on this computer.`
          : "Every request is recorded locally so you can see exactly what was sent."
      }
    >
      <Button variant="outline" size="sm" onClick={onOpenLog}>
        View log
      </Button>
    </Row>
  );
}

function LogDialog({ open, onClose }: { open: boolean; onClose(): void }) {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  useEffect(() => {
    if (open) void backend.aiLog(100).then(setEntries, () => setEntries([]));
  }, [open]);
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[80vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Request log</DialogTitle>
          <DialogDescription>
            Newest first. Each entry is the exact text sent. Nothing here leaves your computer.
          </DialogDescription>
        </DialogHeader>
        {entries.length === 0 && (
          <p className="text-[13px] text-muted-foreground">No requests yet.</p>
        )}
        <div className="flex flex-col gap-2">
          {entries.map((e, i) => (
            <details key={i} className="rounded-md border border-border px-3 py-2 text-[12.5px]">
              <summary className="cursor-pointer">
                {new Date(e.at).toLocaleString()} · {e.kind} · {e.provider}
                {e.model ? ` (${e.model})` : ""} · {e.cloud ? "left this computer" : "stayed local"}
                {e.error ? ` · failed: ${e.error}` : ""}
              </summary>
              <p className="mt-1 text-muted-foreground">
                about {e.inputTokens} tokens in, {e.outputTokens} out
                {e.sources.length ? ` · entries: ${e.sources.join(", ")}` : ""}
              </p>
              <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap font-mono text-[11.5px]">
                {e.sent}
              </pre>
            </details>
          ))}
        </div>
        <DialogFooter>
          {entries.length > 0 && (
            <Button
              variant="outline"
              onClick={() => void backend.aiClearLog().then(() => setEntries([]))}
            >
              Clear log
            </Button>
          )}
          <Button onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** The consent screen: where the text goes, and exactly what will and won't be sent. */
function ConsentDialog({
  target,
  settings,
  onClose,
  onAccept,
}: {
  target: string | null;
  settings: AiSettings;
  onClose(): void;
  onAccept(target: string): Promise<void>;
}) {
  const mcp = target === "mcp";
  const info = target && !mcp ? PROVIDERS[target as ProviderId] : null;
  const cfg = target && !mcp ? settings.providers[target] : null;
  return (
    <Dialog open={target !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {mcp ? "Share your journal with MCP clients?" : `Send journal text to ${info?.label}?`}
          </DialogTitle>
          <DialogDescription>
            {mcp
              ? "Any program you add dhyāna to as an MCP server can ask it for entries. This works like a cloud provider: the text leaves dhyāna."
              : `Text you choose goes to ${info?.destination}${cfg?.baseUrl ? ` (${cfg.baseUrl})` : ""}.`}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-[13px]">
          <div>
            <div className="font-medium">What can be sent</div>
            <ul className="ml-4 list-disc text-muted-foreground">
              {mcp ? (
                <>
                  <li>Entries, search results and people notes the client asks for.</li>
                  <li>Only what the client requests, one request at a time.</li>
                </>
              ) : (
                <>
                  <li>The messages you type in the chat.</li>
                  <li>
                    Entries, selections and people you attach, and entries found by search when you
                    turn on "search my journal" for a chat.
                  </li>
                  <li>Your custom assistant instructions.</li>
                </>
              )}
            </ul>
          </div>
          <div>
            <div className="font-medium">What is never sent</div>
            <ul className="ml-4 list-disc text-muted-foreground">
              <li>Days marked private, in any form (text, snippets, counts, mentions).</li>
              <li>Anything outside the folders you allow.</li>
              <li>Your API keys, or the rest of your vault.</li>
            </ul>
          </div>
          <p className="text-muted-foreground">
            {mcp
              ? "It is read-only: there is no way for a client to change your journal. "
              : "In the chat you can preview exactly what will be sent before each message. "}
            Every request is recorded in the local request log. You can withdraw approval at any
            time.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              if (!target) return;
              void onAccept(target).catch((e) => toast.error(String(e)));
            }}
          >
            I understand, approve
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TextField({
  value,
  onSave,
  width,
}: {
  value: string;
  onSave(v: string): void;
  width: string;
}) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return (
    <Input
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => v !== value && onSave(v.trim())}
      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
      className={`h-8 ${width}`}
      spellCheck={false}
    />
  );
}

function InstructionsField({ value, onSave }: { value: string; onSave(v: string): void }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return (
    <Textarea
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => v !== value && onSave(v)}
      rows={3}
      className="mb-2 text-[13px]"
      placeholder="Be concise. Ask a gentle question at the end."
    />
  );
}

function FoldersField({ value, onSave }: { value: string[]; onSave(v: string[]): void }) {
  const [v, setV] = useState(value.join("\n"));
  useEffect(() => setV(value.join("\n")), [value]);
  return (
    <Textarea
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => {
        const next = v
          .split("\n")
          .map((l) => l.trim().replace(/^\/+|\/+$/g, ""))
          .filter(Boolean);
        if (next.join("\n") !== value.join("\n")) onSave(next);
      }}
      rows={2}
      className="mb-2 font-mono text-[12.5px]"
      placeholder="journal/2026"
      spellCheck={false}
    />
  );
}
