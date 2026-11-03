import { Link, useParams } from "@tanstack/react-router";
import { History, Plus, Send, Square, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useApp } from "@/app/context";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { backend } from "@/lib";
import type { Attachments, Built, ChatMessage, ChatEvent, SessionInfo } from "@/lib/ai";
import { isISODate } from "@/lib/dates";
import { cn } from "@/lib/utils";

interface Turn extends ChatMessage {
  sources?: string[];
  error?: boolean;
}

const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/**
 * The chat sidebar. It only exists while AI is on. Everything sent is built by the core from the
 * attachments chosen here, and "What will be sent" shows that exact text before sending.
 */
export function ChatSidebar() {
  const app = useApp();
  const params = useParams({ strict: false }) as { date?: string };
  const date = params.date && isISODate(params.date) ? params.date : null;

  const [chatId, setChatId] = useState(newId);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [useNote, setUseNote] = useState(true);
  const [selection, setSelection] = useState<string | null>(null);
  const [people, setPeople] = useState<string[]>([]);
  const [retrieval, setRetrieval] = useState(false);
  const [preview, setPreview] = useState<Built | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const activeId = useRef<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const turnsRef = useRef<Turn[]>([]);
  const chatIdRef = useRef(chatId);
  useEffect(() => {
    turnsRef.current = turns;
    chatIdRef.current = chatId;
  }, [turns, chatId]);

  const attachments = useMemo<Attachments>(
    () => ({
      currentDate: date,
      currentNote: useNote && !!date,
      selection,
      people,
      retrieval,
    }),
    [date, useNote, selection, people, retrieval],
  );

  const save = useCallback((id: string, list: Turn[]) => {
    const first = list.find((t) => t.role === "user")?.content ?? "Chat";
    void backend
      .aiSaveSession(id, {
        title: first.slice(0, 60),
        updated: new Date().toISOString(),
        messages: list.map(({ role, content, sources }) => ({ role, content, sources })),
      })
      .catch(() => {});
  }, []);

  // Streaming events for the reply in flight.
  useEffect(() => {
    let off: (() => void) | undefined;
    let dead = false;
    void backend
      .onAiEvent((e: ChatEvent) => {
        if (e.id !== activeId.current) return;
        if (e.type === "delta") {
          setTurns((t) => {
            const last = t[t.length - 1];
            if (!last || last.role !== "assistant") return t;
            return [...t.slice(0, -1), { ...last, content: last.content + e.text }];
          });
        } else if (e.type === "done") {
          activeId.current = null;
          setBusy(false);
          setTurns((t) => {
            const last = t[t.length - 1];
            const next = last ? [...t.slice(0, -1), { ...last, sources: e.sources }] : t;
            save(chatIdRef.current, next);
            return next;
          });
        } else {
          activeId.current = null;
          setBusy(false);
          setTurns((t) => {
            const last = t[t.length - 1];
            const msg = `Couldn't get a reply: ${e.message}`;
            return last && last.role === "assistant" && !last.content
              ? [...t.slice(0, -1), { role: "assistant", content: msg, error: true }]
              : [...t, { role: "assistant", content: msg, error: true }];
          });
        }
      })
      .then((u) => (dead ? u() : (off = u)));
    return () => {
      dead = true;
      off?.();
    };
  }, [save]);

  const reset = useCallback(() => {
    if (activeId.current) void backend.aiCancel(activeId.current);
    activeId.current = null;
    setBusy(false);
    setTurns([]);
    setHistoryOpen(false);
    setPreview(null);
    setRetrieval(false);
    setPeople([]);
    setSelection(null);
    setChatId(newId());
  }, []);

  // "New chat" from the palette.
  const seenReset = useRef(app.chatResetKey);
  useEffect(() => {
    if (app.chatResetKey !== seenReset.current) {
      seenReset.current = app.chatResetKey;
      reset();
    }
  }, [app.chatResetKey, reset]);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [turns, historyOpen]);

  const input = (extra?: ChatMessage[]) => ({
    messages: [
      ...turnsRef.current.map(({ role, content }) => ({ role, content })),
      ...(extra ?? []),
    ],
    attachments,
  });

  const showPreview = async () => {
    try {
      const text = draft.trim() || "(your message)";
      setPreview(await backend.aiPreview(input([{ role: "user", content: text }])));
    } catch (e) {
      toast.error(String(e));
    }
  };

  const send = async () => {
    const text = draft.trim();
    if (!text || busy) return;
    const id = newId();
    setDraft("");
    setPreview(null);
    setBusy(true);
    activeId.current = id;
    const body = input([{ role: "user", content: text }]);
    setTurns((t) => [...t, { role: "user", content: text }, { role: "assistant", content: "" }]);
    try {
      const built = await backend.aiSend(id, body);
      setTurns((t) => {
        const last = t[t.length - 1];
        return last?.role === "assistant"
          ? [...t.slice(0, -1), { ...last, sources: built.sources }]
          : t;
      });
    } catch (e) {
      activeId.current = null;
      setBusy(false);
      setTurns((t) => [...t.slice(0, -1), { role: "assistant", content: String(e), error: true }]);
    }
  };

  const stop = () => {
    if (activeId.current) void backend.aiCancel(activeId.current);
    activeId.current = null;
    setBusy(false);
    save(chatIdRef.current, turnsRef.current);
  };

  const toggleHistory = async () => {
    const next = !historyOpen;
    setHistoryOpen(next);
    if (next) setSessions(await backend.aiListSessions().catch(() => []));
  };

  const open = async (id: string) => {
    try {
      const s = await backend.aiLoadSession(id);
      reset();
      setChatId(id);
      setTurns(s.messages);
      setHistoryOpen(false);
    } catch (e) {
      toast.error(`Couldn't open that chat: ${e}`);
    }
  };

  const grabSelection = () => {
    const t = window.getSelection()?.toString().trim() ?? "";
    if (!t) return toast("Select some text in the note first");
    setSelection(t);
  };

  const peopleChoices = app.entities.filter((e) => e.kind === "person" || e.kind === "place");

  return (
    <aside className="flex w-[340px] shrink-0 flex-col border-l border-border bg-chrome">
      <div className="flex h-10 shrink-0 items-center justify-between px-3">
        <span className="text-[13px] font-medium">Chat</span>
        <div className="flex items-center gap-0.5">
          <HeaderBtn label="New chat" onClick={reset}>
            <Plus size={15} />
          </HeaderBtn>
          <HeaderBtn
            label={historyOpen ? "Back to chat" : "Past chats"}
            onClick={() => void toggleHistory()}
          >
            <History size={15} />
          </HeaderBtn>
          <HeaderBtn label="Close chat" onClick={app.toggleChat}>
            <X size={15} />
          </HeaderBtn>
        </div>
      </div>

      {historyOpen && (
        <div className="min-h-0 flex-1 overflow-y-auto border-t border-border px-2 py-2">
          {sessions.length === 0 && (
            <p className="px-1 py-2 text-[12px] text-muted-foreground">No saved chats yet.</p>
          )}
          {sessions.map((s) => (
            <div key={s.id} className="group flex items-center gap-1">
              <button
                className="min-w-0 flex-1 truncate rounded px-1.5 py-1 text-left text-[12.5px] hover:bg-chrome-hover"
                onClick={() => void open(s.id)}
              >
                {s.title}
              </button>
              <button
                aria-label="Delete chat"
                className="rounded p-1 text-muted-foreground opacity-0 hover:text-foreground group-hover:opacity-100"
                onClick={() =>
                  void backend
                    .aiDeleteSession(s.id)
                    .then(() => setSessions((x) => x.filter((y) => y.id !== s.id)))
                }
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      )}

      {!historyOpen && (
        <>
          <div ref={scroller} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-2">
            {turns.length === 0 && (
              <p className="text-[12.5px] leading-relaxed text-muted-foreground">
                Ask about your writing. The assistant sees only what you attach below
                {attachments.retrieval ? " and what it finds by searching" : ""}, never private
                days. It can read, not change, your journal.
              </p>
            )}
            {turns.map((t, i) => (
              <div
                key={i}
                className={cn(
                  "text-[13px] leading-relaxed",
                  t.role === "user" && "text-foreground",
                )}
              >
                <div className="mb-0.5 text-[11px] uppercase tracking-wide text-muted-foreground">
                  {t.role === "user" ? "You" : "Assistant"}
                </div>
                <div className={cn("whitespace-pre-wrap", t.error && "text-destructive")}>
                  {t.content || (busy && i === turns.length - 1 ? "…" : "")}
                </div>
                {!!t.sources?.length && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {t.sources.map((d) => (
                      <Link
                        key={d}
                        to="/day/$date"
                        params={{ date: d }}
                        className="rounded-full border border-border bg-popover px-2 py-0.5 text-[11px] text-muted-foreground hover:text-foreground"
                      >
                        {d}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="shrink-0 border-t border-border px-3 pb-3 pt-2">
            <div className="mb-2 flex flex-wrap items-center gap-1.5">
              {date && (
                <Chip active={useNote} onClick={() => setUseNote((v) => !v)}>
                  This note ({date.slice(5)})
                </Chip>
              )}
              <Chip
                active={!!selection}
                onClick={() => (selection ? setSelection(null) : grabSelection())}
              >
                {selection ? `Selection (${selection.length})` : "Attach selection"}
              </Chip>
              <Chip active={retrieval} onClick={() => setRetrieval((v) => !v)}>
                Search my journal
              </Chip>
              {people.map((p) => (
                <Chip key={p} active onClick={() => setPeople((x) => x.filter((y) => y !== p))}>
                  {p} ×
                </Chip>
              ))}
              <select
                aria-label="Attach a person or place"
                className="h-6 rounded-full border border-border bg-popover px-2 text-[11px] text-muted-foreground"
                value=""
                onChange={(e) =>
                  e.target.value && setPeople((x) => [...new Set([...x, e.target.value])])
                }
              >
                <option value="">+ person</option>
                {peopleChoices.map((p) => (
                  <option key={p.path} value={p.name}>
                    {p.display}
                  </option>
                ))}
              </select>
            </div>

            {preview && (
              <div className="mb-2 max-h-52 overflow-auto rounded-md border border-border bg-popover p-2 text-[11.5px]">
                <div className="mb-1 font-medium">
                  To {preview.provider} ({preview.model}) ·{" "}
                  {preview.cloud ? "leaves this computer" : "stays on this computer"}
                </div>
                {preview.omitted.length > 0 && (
                  <p className="mb-1 text-muted-foreground">
                    Left out: {preview.omitted.join("; ")}
                  </p>
                )}
                <pre className="whitespace-pre-wrap font-mono">{preview.system}</pre>
                {preview.messages.map((m, i) => (
                  <pre
                    key={i}
                    className="mt-1 whitespace-pre-wrap font-mono"
                  >{`[${m.role}] ${m.content}`}</pre>
                ))}
              </div>
            )}

            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
                if (e.key === "Escape") (e.target as HTMLElement).blur();
              }}
              rows={3}
              placeholder="Ask something… (Enter to send)"
              className="resize-none bg-popover text-[13px]"
            />
            <div className="mt-2 flex items-center justify-between">
              <button
                className="text-[12px] text-muted-foreground hover:text-foreground"
                onClick={() => (preview ? setPreview(null) : void showPreview())}
              >
                {preview ? "Hide what will be sent" : "What will be sent?"}
              </button>
              {busy ? (
                <Button size="sm" variant="outline" onClick={stop}>
                  <Square size={12} /> Stop
                </Button>
              ) : (
                <Button size="sm" disabled={!draft.trim()} onClick={() => void send()}>
                  <Send size={12} /> Send
                </Button>
              )}
            </div>
          </div>
        </>
      )}
    </aside>
  );
}

function HeaderBtn({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick(): void;
  children: React.ReactNode;
}) {
  return (
    <button
      aria-label={label}
      title={label}
      onClick={onClick}
      className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-chrome-hover hover:text-foreground"
    >
      {children}
    </button>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick(): void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "h-6 rounded-full border px-2.5 text-[11px] transition-colors",
        active
          ? "border-primary/40 bg-chrome-active text-foreground"
          : "border-border bg-popover text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
