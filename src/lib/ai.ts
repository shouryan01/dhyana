import { z } from "zod";

/** Provider ids, in the order Settings lists them. Mirrors `ProviderKind` in the Rust core. */
export const PROVIDER_IDS = [
  "local",
  "agent",
  "anthropic",
  "openai",
  "gemini",
  "groq",
  "openrouter",
] as const;
export const ProviderIdSchema = z.enum(PROVIDER_IDS);
export type ProviderId = z.infer<typeof ProviderIdSchema>;

export interface ProviderInfo {
  label: string;
  /** Text shown on the consent screen: where the text goes. */
  destination: string;
  needsKey: boolean;
}

export const PROVIDERS: Record<ProviderId, ProviderInfo> = {
  local: {
    label: "Local model (Ollama, LM Studio)",
    destination: "an OpenAI-compatible server at the address below",
    needsKey: false,
  },
  agent: {
    label: "Installed agent (Claude Code, Codex, Gemini CLI, agy…)",
    destination:
      "a coding-agent program already installed on this computer, which sends it on to its own vendor",
    needsKey: false,
  },
  anthropic: { label: "Anthropic", destination: "Anthropic's API", needsKey: true },
  openai: { label: "OpenAI", destination: "OpenAI's API", needsKey: true },
  gemini: { label: "Google Gemini", destination: "Google's Gemini API", needsKey: true },
  groq: { label: "Groq", destination: "Groq's API", needsKey: true },
  openrouter: { label: "OpenRouter", destination: "OpenRouter's API", needsKey: true },
};

export const ProviderConfigSchema = z.object({
  baseUrl: z.string(),
  model: z.string(),
  consented: z.boolean(),
});
export type ProviderConfig = z.infer<typeof ProviderConfigSchema>;

export const AiSettingsSchema = z.object({
  enabled: z.boolean(),
  providers: z.record(z.string(), ProviderConfigSchema),
  active: ProviderIdSchema,
  fast: z.object({ provider: ProviderIdSchema, model: z.string() }).nullable(),
  instructions: z.string(),
  allowedFolders: z.array(z.string()),
  mcpEnabled: z.boolean(),
  mcpConsented: z.boolean(),
});
export type AiSettings = z.infer<typeof AiSettingsSchema>;

export const AiViewSchema = z.object({
  settings: AiSettingsSchema,
  hasKey: z.record(z.string(), z.boolean()),
});
export type AiView = z.infer<typeof AiViewSchema>;

export const DetectedAgentSchema = z.object({
  id: z.string(),
  label: z.string(),
  path: z.string(),
});
export type DetectedAgent = z.infer<typeof DetectedAgentSchema>;

export const ChatMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string(),
});
export type ChatMessage = z.infer<typeof ChatMessageSchema>;

export interface Attachments {
  currentDate?: string | null;
  currentNote?: boolean;
  selection?: string | null;
  dates?: string[];
  people?: string[];
  retrieval?: boolean;
}

export interface ChatInput {
  messages: ChatMessage[];
  attachments: Attachments;
  fast?: boolean;
}

export const BuiltSchema = z.object({
  provider: z.string(),
  model: z.string(),
  cloud: z.boolean(),
  system: z.string(),
  messages: z.array(ChatMessageSchema),
  sources: z.array(z.string()),
  omitted: z.array(z.string()),
});
export type Built = z.infer<typeof BuiltSchema>;

export const LogEntrySchema = z.object({
  at: z.string(),
  kind: z.string(),
  provider: z.string(),
  model: z.string(),
  cloud: z.boolean(),
  sent: z.string(),
  sources: z.array(z.string()),
  inputTokens: z.number(),
  outputTokens: z.number(),
  error: z.string().nullable(),
});
export type LogEntry = z.infer<typeof LogEntrySchema>;

export const UsageSchema = z.object({
  requests: z.number(),
  cloudRequests: z.number(),
  inputTokens: z.number(),
  outputTokens: z.number(),
});
export type Usage = z.infer<typeof UsageSchema>;

export const McpInfoSchema = z.object({ command: z.string(), config: z.unknown() });
export type McpInfo = z.infer<typeof McpInfoSchema>;

export const SessionInfoSchema = z.object({
  id: z.string(),
  title: z.string(),
  updated: z.string(),
});
export type SessionInfo = z.infer<typeof SessionInfoSchema>;

export const SessionSchema = z.object({
  title: z.string(),
  updated: z.string(),
  messages: z.array(ChatMessageSchema.extend({ sources: z.array(z.string()).optional() })),
});
export type Session = z.infer<typeof SessionSchema>;

/** Streaming events for one reply, keyed by the id passed to `aiSend`. */
export type ChatEvent =
  | { id: string; type: "delta"; text: string }
  | { id: string; type: "done"; inputTokens: number; outputTokens: number; sources: string[] }
  | { id: string; type: "error"; message: string };

export const DEFAULT_AI_SETTINGS: AiSettings = {
  enabled: false,
  providers: {},
  active: "local",
  fast: null,
  instructions: "",
  allowedFolders: [],
  mcpEnabled: false,
  mcpConsented: false,
};
