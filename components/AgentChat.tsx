"use client";

import { useEffect, useRef, useState } from "react";
import type { AgentResult, AgentStep } from "@/lib/agent/types";

type Message = { role: "user" | "model"; text: string; steps?: AgentStep[] };

// Sample prompts aligned with SRM CampusBite live demo
const SAMPLE_PROMPTS = [
  "What's veg under Rs 80 today?",
  "I have Rs 150. Get me lunch with something sweet, pick up at 1:15.",
  "Add a chicken biryani too.",
  "Cancel my latest order.",
];

export default function AgentChat({ onDataChanged }: { onDataChanged?: () => void }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [lastPrompt, setLastPrompt] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    setLastPrompt(trimmed);
    const next: Message[] = [...messages, { role: "user", text: trimmed }];
    setMessages(next);
    setInput("");
    setLoading(true);
    setError("");

    // Set a client-side timeout so requests never hang indefinitely
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 50000);

    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Only the last 20 messages are sent, to keep requests small.
        body: JSON.stringify({
          messages: next.slice(-20).map(({ role, text }) => ({ role, text })),
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }

      let data: any = null;
      try {
        data = await res.json();
      } catch {
        // Response was not JSON
      }

      if (!res.ok) {
        let errMsg = data?.error ?? `Request failed with status ${res.status}`;
        try {
          const parsed = JSON.parse(errMsg);
          if (parsed.error?.message) errMsg = parsed.error.message;
        } catch {}
        throw new Error(errMsg);
      }

      const result = data as AgentResult;
      setMessages([...next, { role: "model", text: result.reply, steps: result.steps }]);
      if (result.steps?.some((s) => s.writes && s.ok)) {
        onDataChanged?.();
      }
    } catch (err: unknown) {
      clearTimeout(timeoutId);
      const isAbort = err instanceof DOMException && err.name === "AbortError";
      const message = isAbort
        ? "Request timed out after 50 seconds. Please try again."
        : err instanceof Error
        ? err.message
        : "Something went wrong while contacting the agent.";
      setError(message);
    } finally {
      clearTimeout(timeoutId);
      setLoading(false);
    }
  }

  return (
    <div className="flex h-[70vh] flex-col rounded-xl border border-slate-200 bg-white">
      <div className="border-b border-slate-200 px-4 py-3">
        <h2 className="font-semibold text-slate-800">CampusBite Assistant</h2>
        <p className="text-xs text-slate-500">
          Ask in plain English. The agent checks menu, wallet &amp; slots live.
        </p>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.length === 0 && (
          <div className="space-y-2">
            <p className="text-sm text-slate-500">Try one of these:</p>
            {SAMPLE_PROMPTS.map((p) => (
              <button
                key={p}
                onClick={() => send(p)}
                className="block w-full rounded-lg border border-slate-200 px-3 py-2 text-left text-sm hover:bg-slate-50 transition"
              >
                {p}
              </button>
            ))}
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
            <div
              className={
                m.role === "user"
                  ? "max-w-[85%] rounded-2xl bg-slate-900 px-3 py-2 text-sm text-white"
                  : "max-w-[85%] space-y-2"
              }
            >
              {m.steps && m.steps.length > 0 && <ToolSteps steps={m.steps} />}
              {m.role === "model" ? (
                <div className="whitespace-pre-wrap rounded-2xl bg-slate-100 px-3 py-2 text-sm text-slate-800">
                  <FormattedText text={m.text} />
                </div>
              ) : (
                m.text
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex items-center gap-2 text-sm text-slate-500 py-1">
            <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-400 border-t-transparent" />
            <span>Agent is working...</span>
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-700 flex items-center justify-between gap-2">
            <span>{error}</span>
            {lastPrompt && (
              <button
                type="button"
                onClick={() => send(lastPrompt)}
                className="rounded bg-red-100 px-2.5 py-1 font-medium text-red-800 hover:bg-red-200 transition text-[11px]"
              >
                Retry
              </button>
            )}
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="flex gap-2 border-t border-slate-200 p-3"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask for food, check wallet, or place order..."
          className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500"
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-50 transition hover:bg-slate-800"
        >
          Send
        </button>
      </form>
    </div>
  );
}

/** Shows **bold** text from Gemini as real bold. Everything else stays plain text. */
function FormattedText({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith("**") && part.endsWith("**") && part.length > 4 ? (
          <strong key={i}>{part.slice(2, -2)}</strong>
        ) : (
          <span key={i}>{part.replace(/^\* /gm, "• ")}</span>
        )
      )}
    </>
  );
}

/** Shows each tool call so users (and judges) can see what the agent did. */
function ToolSteps({ steps }: { steps: AgentStep[] }) {
  return (
    <div className="space-y-1">
      {steps.map((s, i) => (
        <details key={i} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs">
          <summary className="cursor-pointer select-none">
            <span className={s.ok ? "text-emerald-700" : "text-red-600"}>{s.ok ? "Done" : "Failed"}</span>
            {" · "}
            <span className="font-mono font-medium">{s.tool}</span>
            {s.writes && <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-amber-800">writes data</span>}
          </summary>
          <pre className="mt-1 overflow-x-auto whitespace-pre-wrap text-slate-600">
            {JSON.stringify({ args: s.args, ...(s.ok ? { result: s.result } : { error: s.error }) }, null, 2)}
          </pre>
        </details>
      ))}
    </div>
  );
}
