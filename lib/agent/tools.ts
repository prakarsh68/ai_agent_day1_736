import "server-only";
import { z } from "zod";
import { defineTool, type AgentTool } from "./defineTool";
import { getSupabase } from "../supabase";
import { CURRENT_STUDENT_ID, formatSlot } from "../campusbite";

/*
 * CAMPUSBITE AGENT TOOLS
 * 4 read tools + 2 write tools.
 * All write tools use Supabase RPC functions so wallet, stock, and slot
 * transactional integrity is enforced by the database.
 */

const getMenu = defineTool({
  name: "getMenu",
  description:
    "Use this when the student asks about the canteen menu, available food, prices, or wants food suggestions. Only returns items currently in stock.",
  schema: z.object({
    category: z
      .enum(["meal", "snack", "drink", "sweet"])
      .optional()
      .describe("Filter by category: meal, snack, drink, or sweet"),
    veg_only: z.boolean().optional().describe("If true, show only vegetarian items"),
    max_price: z.number().int().positive().optional().describe("Maximum price in rupees"),
  }),
  run: async ({ category, veg_only, max_price }) => {
    let query = getSupabase()
      .from("menu_items")
      .select("id, name, category, price, is_veg, stock, description")
      .gt("stock", 0)
      .order("category", { ascending: true })
      .order("price", { ascending: true });

    if (category) query = query.eq("category", category);
    if (veg_only) query = query.eq("is_veg", true);
    if (max_price !== undefined) query = query.lte("price", max_price);

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return { items: data ?? [] };
  },
});

const getWalletBalance = defineTool({
  name: "getWalletBalance",
  description:
    "Use this when checking the student's canteen wallet balance or student name before or during ordering.",
  schema: z.object({}),
  run: async () => {
    const { data, error } = await getSupabase()
      .from("wallets")
      .select("name, balance")
      .eq("student_id", CURRENT_STUDENT_ID)
      .single();

    if (error) throw new Error(error.message);
    if (!data) throw new Error(`Wallet not found for student ${CURRENT_STUDENT_ID}`);
    return { student_id: CURRENT_STUDENT_ID, name: data.name, balance: data.balance, balance_display: `Rs ${data.balance}` };
  },
});

const getPickupSlots = defineTool({
  name: "getPickupSlots",
  description:
    "Use this when checking available pickup time slots for today. Returns only slots with free capacity.",
  schema: z.object({}),
  run: async () => {
    const { data, error } = await getSupabase()
      .from("pickup_slots")
      .select("id, slot_time, capacity, booked")
      .order("slot_time", { ascending: true });

    if (error) throw new Error(error.message);

    const slots = (data ?? [])
      .map((s) => ({
        slot_id: s.id,
        time: formatSlot(s.slot_time),
        free: s.capacity - s.booked,
      }))
      .filter((s) => s.free > 0);

    return { slots };
  },
});

const getMyOrders = defineTool({
  name: "getMyOrders",
  description:
    "Use this when the student asks about their past or current orders, order status, or wants to check what they have ordered today.",
  schema: z.object({}),
  run: async () => {
    const { data, error } = await getSupabase()
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
      .limit(10);

    if (error) throw new Error(error.message);

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

    const orders = ((data ?? []) as unknown as OrderRow[]).map((o) => {
      const slotTimeRaw = Array.isArray(o.pickup_slots)
        ? o.pickup_slots[0]?.slot_time
        : o.pickup_slots?.slot_time;
      const pickupTime = slotTimeRaw ? formatSlot(slotTimeRaw) : "unknown";

      const items = (o.order_items ?? []).map((oi) => {
        const itemName = Array.isArray(oi.menu_items)
          ? oi.menu_items[0]?.name
          : oi.menu_items?.name;
        return `${oi.quantity}x ${itemName ?? "Item"}`;
      });

      return {
        id: o.id,
        status: o.status,
        total: `Rs ${o.total}`,
        pickup_time: pickupTime,
        items,
      };
    });

    return { orders };
  },
});

const placeOrder = defineTool({
  name: "placeOrder",
  description:
    "Use this when placing a confirmed food order for the student. Requires the item IDs with quantities (1 to 5) and the chosen slot ID.",
  writes: true,
  schema: z.object({
    items: z
      .array(
        z.object({
          menu_item_id: z.number().int().positive().describe("Menu item ID"),
          quantity: z.number().int().min(1).max(5).describe("Quantity of this item (1 to 5)"),
        })
      )
      .min(1)
      .describe("Array of items and quantities to order"),
    slot_id: z.number().int().positive().describe("The pickup slot ID for today"),
  }),
  run: async ({ items, slot_id }) => {
    const { data, error } = await getSupabase().rpc("place_order", {
      p_student_id: CURRENT_STUDENT_ID,
      p_slot_id: slot_id,
      p_items: items,
    });
    if (error) throw new Error(error.message);
    return data;
  },
});

const cancelOrder = defineTool({
  name: "cancelOrder",
  description:
    "Use this when the student wants to cancel an order. Only orders in 'placed' status can be cancelled; preparing or ready orders cannot be cancelled.",
  writes: true,
  schema: z.object({
    order_id: z.number().int().positive().describe("The ID of the order to cancel"),
  }),
  run: async ({ order_id }) => {
    const { data, error } = await getSupabase().rpc("cancel_order", {
      p_student_id: CURRENT_STUDENT_ID,
      p_order_id: order_id,
    });
    if (error) throw new Error(error.message);
    return data;
  },
});

/** Exactly 6 CampusBite tools passed to Gemini */
export const tools: AgentTool[] = [
  getMenu,
  getWalletBalance,
  getPickupSlots,
  getMyOrders,
  placeOrder,
  cancelOrder,
];
