import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/menu
 * Returns all menu_items (including sold out), ordered by category and price.
 */
export async function GET() {
  const { data, error } = await getSupabase()
    .from("menu_items")
    .select("id, name, category, price, is_veg, stock, prep_minutes, description")
    .order("category", { ascending: true })
    .order("price", { ascending: true });

  if (error) {
    console.error("[GET /api/menu]", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ items: data ?? [] });
}
