import "server-only";
import { z } from "zod";
import type { FunctionDeclaration } from "@google/genai";

/**
 * One agent tool = a name + a description + a Zod schema for its arguments + the code it runs.
 * Gemini reads the name, description and schema to decide WHEN to call the tool.
 * Your code runs the tool. Gemini never touches the database directly.
 */
export type AgentTool = {
  name: string;
  description: string;
  schema: z.ZodObject;
  writes: boolean;
  run: (args: unknown) => Promise<unknown>;
};

export function defineTool<S extends z.ZodObject>(tool: {
  name: string;
  description: string;
  schema: S;
  /** true if this tool inserts, updates or deletes data */
  writes?: boolean;
  run: (args: z.infer<S>) => Promise<unknown>;
}): AgentTool {
  return {
    name: tool.name,
    description: tool.description,
    schema: tool.schema,
    writes: tool.writes ?? false,
    run: (args) => tool.run(args as z.infer<S>),
  };
}

// Only these JSON Schema keys are sent to Gemini. Zod still checks everything else.
const ALLOWED_KEYS = new Set([
  "type",
  "properties",
  "required",
  "description",
  "enum",
  "items",
  "nullable",
  "format",
]);

function clean(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(clean);
  if (!node || typeof node !== "object") return node;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    if (!ALLOWED_KEYS.has(key)) continue;
    if (key === "properties" && value && typeof value === "object") {
      out.properties = Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, clean(v)])
      );
    } else if (key === "format" && value !== "date-time" && value !== "enum") {
      continue;
    } else {
      out[key] = clean(value);
    }
  }
  return out;
}

/** Turns our tools into the function declarations Gemini expects. */
export function toFunctionDeclarations(tools: AgentTool[]): FunctionDeclaration[] {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    parametersJsonSchema: clean(z.toJSONSchema(tool.schema, { io: "input" })),
  }));
}
