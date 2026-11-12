/**
 * Conversations kept by a Hermes Agent, through its sessions API (`/api/sessions`). A conversation
 * is one Hermes session: its id goes in X-Hermes-Session-Id on each turn, and Hermes keeps the
 * turns, so any device with the key can list it, open it and carry on.
 */
import { here, unreachable, type ChatMessage } from "./llm.ts";

export interface Conversation {
  id: string;
  /** Hermes's title, or null before it has one */
  title: string | null;
  /** the start of the first thing the owner said */
  preview: string;
  /** when it was last used (seconds since 1970), or when it was started */
  at: number;
}

/** Hermes's REST root: the endpoint without its /v1 */
export const hermesRoot = (baseUrl: string): string => baseUrl.replace(/\/+$/, "").replace(/\/v1$/, "");

/** Only sessions the API server owns can be continued over it; the CLI's and messaging apps' are refused. */
const SOURCE = "api_server";

/** Hermes answered, and not with what was asked for */
export class HermesError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/** a JSON object's fields; none for anything else */
function fields(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.entries(v)) : {};
}

/** the `data` list of one of Hermes's list answers, each entry's fields */
function rows(body: unknown): Record<string, unknown>[] {
  const data = fields(body).data;
  return Array.isArray(data) ? data.map(fields) : [];
}

async function call(baseUrl: string, apiKey: string, method: string, path: string, body?: object): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(`${hermesRoot(baseUrl)}/api/sessions${path}`, {
      method,
      headers: { Authorization: `Bearer ${apiKey}`, ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error(unreachable(baseUrl, here(), true));
  }
  if (!res.ok) {
    let detail: unknown;
    try {
      detail = fields(fields(await res.json()).error).message;
    } catch {
      // no JSON body: the status is all there is
    }
    throw new HermesError(`Hermes said no (HTTP ${res.status})${typeof detail === "string" && detail ? `: ${detail}` : ""}.`, res.status);
  }
  return res.json();
}

/** A session as Hermes describes it (`{id, title, preview, last_active, started_at, …}`), as a Conversation. */
function conversation(session: unknown): Conversation {
  const s = fields(session);
  if (typeof s.id !== "string" || !s.id) throw new HermesError("Hermes answered without a session id.", 200);
  const at = [s.last_active, s.started_at].find((t): t is number => typeof t === "number" && t > 0) ?? 0;
  return { id: s.id, title: typeof s.title === "string" && s.title.trim() ? s.title.trim() : null, preview: typeof s.preview === "string" ? s.preview : "", at };
}

/** The conversations, most recently used first. */
export async function listConversations(baseUrl: string, apiKey: string): Promise<Conversation[]> {
  return rows(await call(baseUrl, apiKey, "GET", `?source=${SOURCE}&limit=50`))
    .filter((s) => typeof s.id === "string" && s.id)
    .map(conversation);
}

/** A new, empty conversation (Hermes picks its id). */
export async function startConversation(baseUrl: string, apiKey: string): Promise<Conversation> {
  return conversation(fields(await call(baseUrl, apiKey, "POST", "", {})).session);
}

export async function renameConversation(baseUrl: string, apiKey: string, id: string, title: string): Promise<Conversation> {
  return conversation(fields(await call(baseUrl, apiKey, "PATCH", `/${encodeURIComponent(id)}`, { title })).session);
}

export async function deleteConversation(baseUrl: string, apiKey: string, id: string): Promise<void> {
  await call(baseUrl, apiKey, "DELETE", `/${encodeURIComponent(id)}`);
}

/**
 * What was said in a conversation, oldest first: the owner's turns and the replies. Tool calls,
 * tool results and Hermes's hidden bookkeeping rows are left out.
 */
export async function conversationTurns(baseUrl: string, apiKey: string, id: string): Promise<ChatMessage[]> {
  return rows(await call(baseUrl, apiKey, "GET", `/${encodeURIComponent(id)}/messages`)).flatMap((m): ChatMessage[] =>
    (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim() && m.display_kind !== "hidden" ? [{ role: m.role, content: m.content }] : [],
  );
}

/** What a conversation is called in the list: its title, or the first words the owner said. */
export function conversationName(c: Conversation): string {
  if (c.title) return c.title;
  const words = c.preview.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "New conversation";
  return words.length > 8 ? `${words.slice(0, 8).join(" ")}…` : words.join(" ");
}

/** When a conversation was last used, as the list says it: "just now", "14:05", "yesterday", "Mon", "3 Mar". */
export function when(seconds: number, now = new Date()): string {
  if (!seconds) return "";
  const t = new Date(seconds * 1000);
  if (now.getTime() - t.getTime() < 60_000) return "just now";
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((day(now) - day(t)) / 86_400_000);
  if (days <= 0) return t.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (days === 1) return "yesterday";
  if (days < 7) return t.toLocaleDateString([], { weekday: "short" });
  return t.toLocaleDateString([], { day: "numeric", month: "short", ...(t.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }) });
}

const KEY = "chimera-voice-chat:conversation";

/** The conversation this device had open on that Hermes, to carry on with next time. */
export function openedConversation(baseUrl: string): string | null {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? "null");
    return saved?.root === hermesRoot(baseUrl) && typeof saved.id === "string" ? saved.id : null;
  } catch {
    return null;
  }
}

export function rememberConversation(baseUrl: string, id: string | null): void {
  try {
    if (id) localStorage.setItem(KEY, JSON.stringify({ root: hermesRoot(baseUrl), id }));
    else localStorage.removeItem(KEY);
  } catch {
    // storage blocked: the next visit starts a new conversation
  }
}
