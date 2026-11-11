import "server-only";
import { GoogleGenAI } from "@google/genai";
import { requireEnv } from "./env";

let client: GoogleGenAI | null = null;

export function getGemini(): GoogleGenAI {
  if (!client) {
    client = new GoogleGenAI({ apiKey: requireEnv("GEMINI_API_KEY") });
  }
  return client;
}
