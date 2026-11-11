import "server-only";
import type { Content, Part, FunctionDeclaration } from "@google/genai";
import { getGemini } from "../gemini";
import { GEMINI_MODEL } from "../env";
import type { ChatMessage } from "../schemas";
import { tools } from "./tools";
import { toFunctionDeclarations } from "./defineTool";
import { buildSystemPrompt } from "./systemPrompt";
import type { AgentResult, AgentStep } from "./types";

/** Stops the agent from looping forever and using up your Gemini quota. */
const MAX_ROUNDS = 8;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Calls Gemini with automatic retries for transient 503 high-demand errors,
 * falling back to stable alternative models if the primary model continues to spike.
 */
async function generateContentWithRetry(
  ai: ReturnType<typeof getGemini>,
  contents: Content[],
  functionDeclarations: FunctionDeclaration[]
) {
  const modelsToTry = [
    GEMINI_MODEL,
    "gemini-2.5-flash",
    "gemini-2.0-flash",
  ].filter((m, idx, arr) => Boolean(m) && arr.indexOf(m) === idx);

  let lastError: unknown = null;

  for (const model of modelsToTry) {
    // For each model, attempt up to 2 times for transient 503/high-demand spikes
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await ai.models.generateContent({
          model,
          contents,
          config: {
            systemInstruction: buildSystemPrompt(),
            tools: [{ functionDeclarations }],
            temperature: 0.2,
          },
        });
        return response;
      } catch (err: unknown) {
        lastError = err;
        const msg = err instanceof Error ? err.message : String(err);
        const isHighDemandOrUnavailable = /503|UNAVAILABLE|high demand|overloaded/i.test(msg);

        if (isHighDemandOrUnavailable && attempt === 0) {
          console.warn(`[agent] ${model} reported high demand (503). Retrying in 1200ms...`);
          await sleep(1200);
          continue;
        }

        if (isHighDemandOrUnavailable) {
          console.warn(`[agent] ${model} unavailable after retry. Trying fallback model...`);
          break; // proceed to next model in modelsToTry
        }

        // If not a transient 503, throw immediately (e.g. invalid arguments or authentication)
        throw err;
      }
    }
  }

  throw lastError;
}

/**
 * THE AGENT LOOP
 * 1. Send the chat + the tool list to Gemini.
 * 2. If Gemini asks for tools, check the arguments with Zod and run them.
 * 3. Send the results back to Gemini.
 * 4. Repeat until Gemini gives a final text answer (or MAX_ROUNDS is reached).
 */
export async function runAgent(messages: ChatMessage[]): Promise<AgentResult> {
  const ai = getGemini();
  const steps: AgentStep[] = [];
  const functionDeclarations = toFunctionDeclarations(tools);

  const contents: Content[] = messages.map((m) => ({
    role: m.role,
    parts: [{ text: m.text }],
  }));

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const response = await generateContentWithRetry(ai, contents, functionDeclarations);

    const calls = response.functionCalls ?? [];

    // No tool requested: this is the final answer.
    if (calls.length === 0) {
      return { reply: response.text?.trim() || "Sorry, I could not answer that.", steps };
    }

    // Keep Gemini's own turn (it carries the tool request) in the history.
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
      const step = await runTool(call.name ?? "", call.args ?? {});
      steps.push(step);
      responseParts.push({
        functionResponse: {
          id: call.id,
          name: call.name,
          response: step.ok ? { result: step.result } : { error: step.error },
        },
      });
    }
    contents.push({ role: "user", parts: responseParts });
  }

  return {
    reply: "I needed too many steps for this request. Please try a simpler or more specific question.",
    steps,
  };
}

async function runTool(name: string, rawArgs: unknown): Promise<AgentStep> {
  const tool = tools.find((t) => t.name === name);
  if (!tool) {
    return { tool: name, args: rawArgs, ok: false, writes: false, error: `Unknown tool: ${name}` };
  }

  // Never trust the model's arguments: check them with Zod first.
  const parsed = tool.schema.safeParse(rawArgs);
  if (!parsed.success) {
    const message = parsed.error.issues.map((i) => `${i.path.join(".") || "args"}: ${i.message}`).join("; ");
    return { tool: name, args: rawArgs, ok: false, writes: tool.writes, error: `Invalid arguments: ${message}` };
  }

  try {
    const result = await tool.run(parsed.data);
    return { tool: name, args: parsed.data, ok: true, writes: tool.writes, result };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Tool failed";
    console.error(`[tool ${name}]`, message); // shows tool errors in the terminal
    return { tool: name, args: parsed.data, ok: false, writes: tool.writes, error: message };
  }
}
