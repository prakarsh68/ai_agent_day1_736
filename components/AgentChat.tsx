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

  async function send(text: string, isRetry = false) {
    console.log("[AgentChat] 1. send() invoked. text:", JSON.stringify(text), "isRetry:", isRetry, "current loading:", loading);

    const trimmed = typeof text === "string" ? text.trim() : "";
    if (!trimmed) {
      console.warn("[AgentChat] 2. Validation failed: trimmed text is empty. Submission aborted.");
      return;
    }

    if (loading) {
      console.warn("[AgentChat] 2. Submission blocked: loading state is currently true. Concurrent request prevented.");
      return;
    }

    console.log("[AgentChat] 3. Validation passed. Updating UI state to loading...");
    setLastPrompt(trimmed);
    setError("");
    setLoading(true);

    // Prevent duplicate user bubbles if retrying the same message
    let next: Message[];
    const lastMsg = messages[messages.length - 1];
    if (isRetry && lastMsg && lastMsg.role === "user" && lastMsg.text === trimmed) {
      console.log("[AgentChat] 4. Reusing existing user message for retry without duplicating.");
      next = messages;
    } else {
      console.log("[AgentChat] 4. Appending new user message to chat history.");
      next = [...messages, { role: "user", text: trimmed }];
      setMessages(next);
    }

    if (!isRetry) {
      setInput("");
    }

    // Client-side safety timeout (52s) to prevent browser hangs
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      console.warn("[AgentChat] 52s client timeout reached; aborting fetch('/api/agent').");
      controller.abort("Client timeout reached (52s)");
    }, 52000);

    controller.signal.addEventListener("abort", () => {
      console.warn("[AgentChat] Fetch signal aborted. Reason:", controller.signal.reason);
    });

    const payload = {
      messages: next.slice(-20).map(({ role, text }) => ({ role, text })),
    };

    console.log("[AgentChat] 5. Prepared POST payload for /api/agent:", JSON.stringify(payload));
    console.log("[AgentChat] 6. Initiating fetch('/api/agent'). Signal aborted?", controller.signal.aborted);

    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      console.log("[AgentChat] 7. fetch('/api/agent') responded with HTTP status:", res.status, res.statusText);
      clearTimeout(timeoutId);

      if (res.status === 401) {
        console.warn("[AgentChat] Session unauthorized (401). Redirecting to /login...");
        window.location.href = "/login";
        return;
      }

      let data: any = null;
      try {
        data = await res.json();
        console.log("[AgentChat] 8. Response parsed successfully:", data);
      } catch (parseErr) {
        console.error("[AgentChat] 8. Failed to parse response as JSON:", parseErr);
      }

      if (!res.ok) {
        let errMsg = data?.error ?? `Request failed with status ${res.status}`;
        try {
          const parsed = JSON.parse(errMsg);
          if (parsed.error?.message) errMsg = parsed.error.message;
        } catch {
          // not serialized JSON
        }
        console.error("[AgentChat] Response not OK. Error message:", errMsg);
        throw new Error(errMsg);
      }

      const result = data as AgentResult;
      console.log("[AgentChat] 9. Success: Model reply received:", result.reply);
      setMessages([...next, { role: "model", text: result.reply, steps: result.steps }]);
      setLastPrompt(""); // Clear retry prompt upon success

      if (result.steps?.some((s) => s.writes && s.ok)) {
        console.log("[AgentChat] Write tool executed successfully. Triggering onDataChanged...");
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
      console.error("[AgentChat] Caught error in send():", message, err);
      setError(message);
    } finally {
      clearTimeout(timeoutId);
      console.log("[AgentChat] 10. Execution finished. Resetting loading state to false.");
      setLoading(false);
    }
  }

  function handleFormSubmit(e: React.FormEvent) {
    e.preventDefault();
    console.log("[AgentChat] Form onSubmit fired. input value:", JSON.stringify(input), "loading:", loading);
    if (!input.trim()) {
      console.warn("[AgentChat] Form onSubmit ignored: input is empty or whitespace.");
      return;
    }
    if (loading) {
      console.warn("[AgentChat] Form onSubmit ignored: already loading.");
      return;
    }
    send(input);
  }

  function handleSendButtonClick(e: React.MouseEvent<HTMLButtonElement>) {
    console.log("[AgentChat] Send button onClick fired. input value:", JSON.stringify(input), "loading:", loading);
    // If the input is valid and not loading, we can trigger submission directly
    if (input.trim() && !loading) {
      console.log("[AgentChat] Triggering send from button click handler...");
      e.preventDefault();
      send(input);
    }
  }

  return (
    <div className="flex h-[70vh] flex-col rounded-xl border border-slate-200 bg-white shadow-sm">
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
                type="button"
                onClick={() => {
                  console.log("[AgentChat] Sample prompt button clicked:", p);
                  send(p);
                }}
                disabled={loading}
                className="block w-full rounded-lg border border-slate-200 px-3 py-2 text-left text-sm hover:bg-slate-50 disabled:opacity-50 transition"
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
                  ? "max-w-[85%] rounded-2xl bg-slate-900 px-3 py-2 text-sm text-white shadow-sm"
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
          <div className="rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-700 flex items-center justify-between gap-2 shadow-xs">
            <span className="flex-1">{error}</span>
            {lastPrompt && (
              <button
                type="button"
                onClick={() => {
                  console.log("[AgentChat] Retry button clicked with lastPrompt:", lastPrompt);
                  send(lastPrompt, true);
                }}
                disabled={loading}
                className="rounded bg-red-100 px-2.5 py-1 font-medium text-red-800 hover:bg-red-200 disabled:opacity-50 transition text-[11px] whitespace-nowrap"
              >
                {loading ? "Retrying..." : "Retry"}
              </button>
            )}
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      <form
        onSubmit={handleFormSubmit}
        className="flex gap-2 border-t border-slate-200 p-3"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={loading}
          placeholder={loading ? "Agent is processing your request..." : "Ask for food, check wallet, or place order..."}
          className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-500 disabled:bg-slate-50 disabled:text-slate-400"
        />
        <button
          type="submit"
          onClick={handleSendButtonClick}
          disabled={loading || !input.trim()}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-50 transition hover:bg-slate-800"
        >
          {loading ? "Working..." : "Send"}
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
