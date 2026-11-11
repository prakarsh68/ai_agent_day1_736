import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/health
 * Shows which settings are missing (never their values), which Supabase project
 * the app is connected to, and whether the CampusBite tables can be read.
 */
export async function GET() {
  // GEMINI_MODEL is optional (it has a default), so it is not checked here.
  const names = ["GEMINI_API_KEY", "SUPABASE_URL", "SUPABASE_SECRET_KEY", "APP_PASSCODE"];
  const settings = Object.fromEntries(names.map((n) => [n, Boolean(process.env[n]?.trim())]));

  // The project id is the first part of the Supabase URL. It is not a secret.
  let supabaseProject: string | null = null;
  try {
    supabaseProject = new URL(process.env.SUPABASE_URL ?? "").hostname.split(".")[0] || null;
  } catch {
    supabaseProject = "SUPABASE_URL is not a valid URL";
  }

  let databaseCheck = "skipped (Supabase settings missing)";
  if (settings.SUPABASE_URL && settings.SUPABASE_SECRET_KEY) {
    const { error } = await getSupabase().from("menu_items").select("id").limit(1);
    databaseCheck = error ? `failed: ${error.message}` : "ok (CampusBite tables found)";
  }

  return NextResponse.json({
    ok: Object.values(settings).every(Boolean) && databaseCheck.startsWith("ok"),
    settings,
    supabaseProject,
    databaseCheck,
  });
}
