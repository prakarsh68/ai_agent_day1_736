import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { CURRENT_STUDENT_ID, formatSlot } from "@/lib/campusbite";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type OrderRow = {
  id: number;
  status: string;
  total: number;
  created_at: string;
  pickup_slots: { slot_time: string } | { slot_time: string }[] | null;
  order_items: Array<{
    quantity: number;
    price: number;
    menu_items: { name: string } | { name: string }[] | null;
  }>;
};

/**
 * GET /api/me
 * Returns wallet of CURRENT_STUDENT_ID and their last 5 orders with pickup time and items.
 */
export async function GET() {
  const supabase = getSupabase();

  // 1. Fetch wallet
  const { data: wallet, error: walletError } = await supabase
    .from("wallets")
    .select("student_id, name, balance")
    .eq("student_id", CURRENT_STUDENT_ID)
    .single();

  if (walletError) {
    console.error("[GET /api/me] wallet error:", walletError.message);
    return NextResponse.json({ error: walletError.message }, { status: 500 });
  }

  // 2. Fetch last 5 orders with joined items and pickup slot
  const { data: rawOrders, error: ordersError } = await supabase
    .from("orders")
    .select(`
      id,
      status,
      total,
      created_at,
      pickup_slots ( slot_time ),
      order_items (
        quantity,
        price,
        menu_items ( name )
      )
    `)
    .eq("student_id", CURRENT_STUDENT_ID)
    .order("created_at", { ascending: false })
    .limit(5);

  if (ordersError) {
    console.error("[GET /api/me] orders error:", ordersError.message);
    return NextResponse.json({ error: ordersError.message }, { status: 500 });
  }

  const orders = ((rawOrders ?? []) as unknown as OrderRow[]).map((o) => {
    const slotTimeRaw = Array.isArray(o.pickup_slots)
      ? o.pickup_slots[0]?.slot_time
      : o.pickup_slots?.slot_time;
    const pickupTime = slotTimeRaw ? formatSlot(slotTimeRaw) : "";

    const items = (o.order_items ?? []).map((oi) => {
      const itemName = Array.isArray(oi.menu_items)
        ? oi.menu_items[0]?.name
        : oi.menu_items?.name;
      return `${oi.quantity}x ${itemName ?? "Item"}`;
    });

    return {
      id: o.id,
      status: o.status,
      total: o.total,
      created_at: o.created_at,
      pickup_time: pickupTime,
      items,
    };
  });

  return NextResponse.json({
    wallet,
    orders,
  });
}
