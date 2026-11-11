import "server-only";
import { GoogleGenAI } from "@google/genai";
import { requireEnv } from "./env";

let client: GoogleGenAI | null = null;

/**
 * Returns a server-side Gemini client with a bounded 20-second HTTP timeout.
 * This prevents the process from hanging for minutes during upstream server spikes.
 */
export function getGemini(): GoogleGenAI {
  if (!client) {
    client = new GoogleGenAI({
      apiKey: requireEnv("GEMINI_API_KEY"),
      httpOptions: {
        timeout: 20000, // 20s bounded request timeout
      },
    });
  }
  return client;
}
