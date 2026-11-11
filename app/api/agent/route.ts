import { NextResponse } from "next/server";
import { agentRequestSchema } from "@/lib/schemas";
import { runAgent } from "@/lib/agent/runAgent";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/** POST /api/agent  body: { messages: [{ role: "user" | "model", text: string }] } */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = agentRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request", details: parsed.error.issues }, { status: 400 });
  }

  try {
    const result = await runAgent(parsed.data.messages);
    return NextResponse.json(result);
  } catch (err) {
    const rawMessage = err instanceof Error ? err.message : "Agent failed";
    console.error("[agent]", rawMessage);

    let extractedMessage = rawMessage;
    let statusCode = 500;

    // Check if Gemini error is returned as a JSON string
    try {
      const parsedJson = JSON.parse(rawMessage);
      if (parsedJson.error?.message) {
        extractedMessage = parsedJson.error.message;
        if (parsedJson.error.code) statusCode = parsedJson.error.code;
      }
    } catch {
      // not JSON string
    }

    const isHighDemand = /503|UNAVAILABLE|high demand|overloaded/i.test(extractedMessage) || statusCode === 503;
    const isQuota = /429|quota|RESOURCE_EXHAUSTED/i.test(extractedMessage) || statusCode === 429;

    let userMessage = extractedMessage;
    if (isHighDemand) {
      userMessage = "This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again in a few moments.";
      statusCode = 503;
    } else if (isQuota) {
      userMessage = "Gemini quota reached. Wait a minute and try again.";
      statusCode = 429;
    }

    return NextResponse.json(
      { error: userMessage },
      { status: statusCode }
    );
  }
}
