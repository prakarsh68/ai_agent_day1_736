import "server-only";
import type { Content, Part, FunctionDeclaration } from "@google/genai";
import { getGemini } from "../gemini";
import { GEMINI_MODEL } from "../env";
import type { ChatMessage } from "../schemas";
import { tools } from "./tools";
import { toFunctionDeclarations } from "./defineTool";
import { buildSystemPrompt } from "./systemPrompt";
import type { AgentResult, AgentStep } from "./types";

/** Maximum loop rounds to prevent infinite loops. */
const MAX_ROUNDS = 8;

/** Total server-side execution deadline in ms (fits cleanly inside Next.js 60s maxDuration). */
const SERVER_TIMEOUT_MS = 45000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Executes a promise with an absolute timeout guarantee.
 */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`Timeout: ${label} exceeded bounded limit of ${ms}ms`));
    }, ms);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timer));
}

/**
 * Calls Gemini with bounded retries, exponential backoff, and jitter.
 * Logs STAGE D and STAGE E explicitly.
 */
async function callGeminiWithRetry(
  ai: ReturnType<typeof getGemini>,
  contents: Content[],
  functionDeclarations: FunctionDeclaration[],
  round: number,
  deadline: number
) {
  // Candidate models: Start with the configured GEMINI_MODEL, then available fallbacks on this key
  const modelsToTry = [
    GEMINI_MODEL,
    "gemini-3.6-flash",
    "gemini-3.5-flash",
  ].filter((m, idx, arr) => Boolean(m) && arr.indexOf(m) === idx);

  let lastError: unknown = null;

  for (const model of modelsToTry) {
    const maxRetries = 1;
    let delay = 1000;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const remainingTime = deadline - Date.now();
      if (remainingTime < 3000) {
        console.warn(`[STAGE E] Insufficient time left before deadline (${remainingTime}ms). Aborting request.`);
        throw new Error("Server execution deadline reached. Aborting to return JSON response.");
      }

      console.log(
        `[STAGE D] Gemini API request started for round ${round + 1} (model: ${model}, attempt: ${attempt + 1}/${maxRetries + 1})`
      );
      const startTime = Date.now();

      try {
        const responsePromise = ai.models.generateContent({
          model,
          contents,
          config: {
            systemInstruction: buildSystemPrompt(),
            tools: [{ functionDeclarations }],
            temperature: 0.2,
          },
        });

        // Hard cap per individual Gemini call at 20 seconds
        const response = await withTimeout(responsePromise, 20000, `Gemini API (${model})`);
        const duration = Date.now() - startTime;
        console.log(`[STAGE E] Gemini API response received in ${duration}ms (model: ${model})`);
        return response;
      } catch (err: unknown) {
        lastError = err;
        const duration = Date.now() - startTime;
        const rawMsg = err instanceof Error ? err.message : String(err);
        console.error(
          `[STAGE E] Gemini API request failed in ${duration}ms (model: ${model}). Error:`,
          rawMsg.slice(0, 200)
        );

        const is503 = /503|UNAVAILABLE|high demand|overloaded/i.test(rawMsg);
        const is429 = /429|quota|RESOURCE_EXHAUSTED/i.test(rawMsg);
        const isTimeout = /timeout|DEADLINE_EXCEEDED|504/i.test(rawMsg);

        // If high demand, rate limit, or timeout occurred, retry with jittered backoff
        if ((is503 || is429 || isTimeout) && attempt < maxRetries) {
          const jitter = Math.floor(Math.random() * 300) + 100;
          const sleepTime = delay + jitter;

          if (Date.now() + sleepTime + 3000 > deadline) {
            console.warn(`[STAGE E] Remaining time (${deadline - Date.now()}ms) too small for retry backoff.`);
            break;
          }

          console.warn(`[STAGE D] Retrying ${model} in ${sleepTime}ms due to transient upstream issue...`);
          await sleep(sleepTime);
          delay = Math.round(delay * 1.5);
          continue;
        }

        // If retries exhausted on this model, break to try next available fallback
        if (is503 || is429 || isTimeout) {
          console.warn(`[STAGE E] ${model} unavailable (quota or demand). Trying fallback model...`);
          break;
        }

        throw err;
      }
    }
  }

  throw lastError ?? new Error("All Gemini model attempts exhausted.");
}

/**
 * THE AGENT LOOP
 * Coordinates conversation turns, function calls, and Supabase tools.
 */
export async function runAgent(messages: ChatMessage[]): Promise<AgentResult> {
  const ai = getGemini();
  const steps: AgentStep[] = [];
  const functionDeclarations = toFunctionDeclarations(tools);
  const executedWrites = new Set<string>();
  const deadline = Date.now() + SERVER_TIMEOUT_MS;

  console.log(`[STAGE C] Agent loop started. Model: ${GEMINI_MODEL}, message count: ${messages.length}`);

  const contents: Content[] = messages.map((m) => ({
    role: m.role,
    parts: [{ text: m.text }],
  }));

  try {
    for (let round = 0; round < MAX_ROUNDS; round++) {
      if (Date.now() >= deadline - 3000) {
        console.warn(`[STAGE C] Server deadline approaching before round ${round + 1}. Exiting agent loop.`);
        break;
      }

      const response = await callGeminiWithRetry(ai, contents, functionDeclarations, round, deadline);
      const calls = response.functionCalls ?? [];

      // No tool requested: Gemini gave final conversational answer
      if (calls.length === 0) {
        const textReply = response.text?.trim() || "Sorry, I could not complete your request.";
        console.log(`[STAGE C] Round ${round + 1}: Final text answer received: "${textReply.slice(0, 80)}..."`);
        return { reply: textReply, steps };
      }

      console.log(
        `[STAGE F] Function calls received: ${calls.map((c) => c.name).join(", ")}`
      );

      // Keep model turn in history
      const modelTurn = response.candidates?.[0]?.content ?? {
        role: "model",
        parts: calls.map((call) => ({
          functionCall: {
            id: call.id,
            name: call.name,
            args: (call.args as Record<string, unknown>) ?? {},
          },
        })),
      };
      contents.push(modelTurn);

      const responseParts: Part[] = [];
      for (const call of calls) {
        const toolName = call.name ?? "";
        const toolArgs = call.args ?? {};

        const step = await runTool(toolName, toolArgs, executedWrites);
        steps.push(step);

        responseParts.push({
          functionResponse: {
            id: call.id,
            name: toolName,
            response: step.ok ? { result: step.result } : { error: step.error },
          },
        });
      }

      contents.push({ role: "user", parts: responseParts });
    }

    // If rounds exhausted or deadline reached but order was placed
    if (executedWrites.has("placeOrder")) {
      const orderStep = steps.find((s) => s.tool === "placeOrder" && s.ok);
      const data = orderStep?.result as any;
      return {
        reply: `Your order has been placed successfully (Order #${data?.order_id ?? ""})! Pickup time: ${data?.pickup_time ?? "canteen"}, Total: Rs ${data?.total ?? ""}. Wallet balance remaining: Rs ${data?.wallet_balance_after ?? ""}.`,
        steps,
      };
    }

    return {
      reply: "I reached the maximum conversation steps for this request. Please try a simpler or more specific instruction.",
      steps,
    };
  } catch (err: unknown) {
    // Transaction Safety: If an order was already placed in the database during this request,
    // NEVER present an error failure to the user; return the confirmed order details.
    if (executedWrites.has("placeOrder")) {
      const orderStep = steps.find((s) => s.tool === "placeOrder" && s.ok);
      const data = orderStep?.result as any;
      console.warn("[STAGE G] placeOrder succeeded earlier; returning confirmed order details despite later error.");
      return {
        reply: `Your order has been placed successfully (Order #${data?.order_id ?? ""})! Pickup time: ${data?.pickup_time ?? "canteen"}, Total: Rs ${data?.total ?? ""}. Wallet balance remaining: Rs ${data?.wallet_balance_after ?? ""}.`,
        steps,
      };
    }

    if (executedWrites.has("cancelOrder")) {
      const cancelStep = steps.find((s) => s.tool === "cancelOrder" && s.ok);
      const data = cancelStep?.result as any;
      console.warn("[STAGE G] cancelOrder succeeded earlier; returning cancellation details despite later error.");
      return {
        reply: `Your order #${data?.order_id ?? ""} was cancelled and Rs ${data?.refunded ?? ""} refunded. Wallet balance: Rs ${data?.wallet_balance_after ?? ""}.`,
        steps,
      };
    }

    throw err;
  }
}

async function runTool(
  name: string,
  rawArgs: unknown,
  executedWrites: Set<string>
): Promise<AgentStep> {
  const tool = tools.find((t) => t.name === name);
  if (!tool) {
    console.error(`[STAGE G] Unknown tool called: ${name}`);
    return { tool: name, args: rawArgs, ok: false, writes: false, error: `Unknown tool: ${name}` };
  }

  // Transaction safety: block repeating a write action that already succeeded in this request
  if (tool.writes && executedWrites.has(name)) {
    console.warn(`[STAGE G] BLOCKED duplicate write: ${name} was already executed in this request.`);
    return {
      tool: name,
      args: rawArgs,
      ok: false,
      writes: true,
      error: `Action '${name}' was already executed successfully in this request. Duplicate operations are forbidden.`,
    };
  }

  // Validate arguments with Zod
  const parsed = tool.schema.safeParse(rawArgs);
  if (!parsed.success) {
    const message = parsed.error.issues.map((i) => `${i.path.join(".") || "args"}: ${i.message}`).join("; ");
    console.warn(`[STAGE G] Invalid arguments for ${name}: ${message}`);
    return { tool: name, args: rawArgs, ok: false, writes: tool.writes, error: `Invalid arguments: ${message}` };
  }

  console.log(`[STAGE G] Supabase tool execution started: ${name} with args:`, JSON.stringify(parsed.data));
  const startTime = Date.now();

  try {
    const result = await tool.run(parsed.data);
    const duration = Date.now() - startTime;
    console.log(`[STAGE G] Supabase tool execution completed: ${name} in ${duration}ms (status: OK). Result:`, JSON.stringify(result));
    if (tool.writes) {
      executedWrites.add(name);
    }
    return { tool: name, args: parsed.data, ok: true, writes: tool.writes, result };
  } catch (err) {
    const duration = Date.now() - startTime;
    const message = err instanceof Error ? err.message : "Tool failed";
    console.error(`[STAGE G] Supabase tool execution completed: ${name} in ${duration}ms (status: FAILED). Error: ${message}`);
    return { tool: name, args: parsed.data, ok: false, writes: tool.writes, error: message };
  }
}
