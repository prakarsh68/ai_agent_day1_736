import { NextResponse } from "next/server";
import { agentRequestSchema } from "@/lib/schemas";
import { runAgent } from "@/lib/agent/runAgent";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/** POST /api/agent  body: { messages: [{ role: "user" | "model", text: string }] } */
export async function POST(request: Request) {
  const startTime = Date.now();
  console.log(`[STAGE A] API route received request at ${new Date().toISOString()}`);

  const body = await request.json().catch(() => null);
  const parsed = agentRequestSchema.safeParse(body);
  if (!parsed.success) {
    console.warn("[STAGE B] Request body validation failed:", JSON.stringify(parsed.error.issues));
    return NextResponse.json({ error: "Invalid request payload", details: parsed.error.issues }, { status: 400 });
  }

  const latestText = parsed.data.messages[parsed.data.messages.length - 1]?.text ?? "";
  console.log(
    `[STAGE B] Request body parsed. Messages count: ${parsed.data.messages.length}, latest: "${latestText.slice(0, 80)}"`
  );

  try {
    const result = await runAgent(parsed.data.messages);
    const duration = Date.now() - startTime;
    console.log(`[STAGE H] Final response returned to API route in ${duration}ms. Reply preview: "${result.reply.slice(0, 80)}..."`);
    return NextResponse.json(result);
  } catch (err: unknown) {
    const duration = Date.now() - startTime;
    const rawMessage = err instanceof Error ? err.message : String(err);
    console.error(`[STAGE H] Final response returned ERROR to API route after ${duration}ms. Error:`, rawMessage);

    let extractedMessage = rawMessage;
    let statusCode = 500;

    // Check if error is serialized JSON from Google GenAI SDK
    try {
      const parsedJson = JSON.parse(rawMessage);
      if (parsedJson.error?.message) {
        extractedMessage = parsedJson.error.message;
        if (parsedJson.error.code) statusCode = parsedJson.error.code;
      }
    } catch {
      // Not a JSON string
    }

    const isHighDemand = /503|UNAVAILABLE|high demand|overloaded/i.test(extractedMessage) || statusCode === 503;
    const isQuota = /429|quota|RESOURCE_EXHAUSTED/i.test(extractedMessage) || statusCode === 429;
    const isTimeout = /timeout|DEADLINE_EXCEEDED|504/i.test(extractedMessage) || statusCode === 504;

    let userMessage = extractedMessage;
    if (isHighDemand) {
      userMessage = "The AI canteen service is currently experiencing high demand. Please try again in a moment.";
      statusCode = 503;
    } else if (isQuota) {
      userMessage = "Gemini free-tier quota limit reached. Please wait a moment or try again later.";
      statusCode = 429;
    } else if (isTimeout) {
      userMessage = "The request took too long to complete. Please try asking a simpler question.";
      statusCode = 504;
    }

    return NextResponse.json(
      { error: userMessage },
      { status: statusCode }
    );
  }
}
