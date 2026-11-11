import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabase } from "@/lib/supabase";
import { formatSlot } from "@/lib/campusbite";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const updateStatusSchema = z.object({
  order_id: z.number().int().positive(),
  status: z.enum(["preparing", "ready", "collected"]),
});

type KitchenOrderRow = {
  id: number;
  student_id: string;
  status: string;
  total: number;
  created_at: string;
  wallets: { name: string } | { name: string }[] | null;
  pickup_slots: { slot_time: string } | { slot_time: string }[] | null;
  order_items: Array<{
    quantity: number;
    price: number;
    menu_items: { name: string } | { name: string }[] | null;
  }>;
};

/**
 * GET /api/kitchen
 * Returns orders with status placed, preparing, or ready, with student name,
 * pickup time and items, oldest first.
 */
export async function GET() {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from("orders")
    .select(`
      id,
      student_id,
      status,
      total,
      created_at,
      wallets ( name ),
      pickup_slots ( slot_time ),
      order_items (
        quantity,
        price,
        menu_items ( name )
      )
    `)
    .in("status", ["placed", "preparing", "ready"])
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[GET /api/kitchen]", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const orders = ((data ?? []) as unknown as KitchenOrderRow[]).map((o) => {
    const studentName = Array.isArray(o.wallets)
      ? o.wallets[0]?.name
      : o.wallets?.name ?? o.student_id;

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
      student_id: o.student_id,
      student_name: studentName,
      status: o.status,
      total: o.total,
      created_at: o.created_at,
      pickup_time: pickupTime,
      items,
    };
  });

  return NextResponse.json({ orders });
}

/**
 * POST /api/kitchen
 * Body: { order_id, status }
 * Enforces strict sequential transitions: placed -> preparing -> ready -> collected.
 * Returns 409 for any other transition.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = updateStatusSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid status update payload", details: parsed.error.issues },
      { status: 400 }
    );
  }

  const { order_id, status: targetStatus } = parsed.data;
  const supabase = getSupabase();

  // 1. Fetch current order
  const { data: order, error: fetchError } = await supabase
    .from("orders")
    .select("id, status")
    .eq("id", order_id)
    .maybeSingle();

  if (fetchError) {
    console.error("[POST /api/kitchen] fetch error:", fetchError.message);
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }

  if (!order) {
    return NextResponse.json({ error: `Order #${order_id} not found` }, { status: 404 });
  }

  // 2. Validate strict sequential transitions: placed -> preparing -> ready -> collected
  const validTransitions: Record<string, string> = {
    placed: "preparing",
    preparing: "ready",
    ready: "collected",
  };

  const allowedNext = validTransitions[order.status];
  if (allowedNext !== targetStatus) {
    console.error(
      `[POST /api/kitchen] Invalid transition for #${order_id}: ${order.status} -> ${targetStatus}`
    );
    return NextResponse.json(
      {
        error: `Cannot transition order #${order_id} from '${order.status}' to '${targetStatus}'. Next allowed status is '${allowedNext ?? "none"}'.`,
      },
      { status: 409 }
    );
  }

  // 3. Update status
  const { data: updated, error: updateError } = await supabase
    .from("orders")
    .update({ status: targetStatus })
    .eq("id", order_id)
    .select("id, status")
    .single();

  if (updateError) {
    console.error("[POST /api/kitchen] update error:", updateError.message);
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, order: updated });
}
