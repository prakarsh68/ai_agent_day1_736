import { z } from "zod";

/** Shared Zod schemas for CampusBite. */

export const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD format")
  .describe("Date in YYYY-MM-DD format");

export const chatMessageSchema = z.object({
  role: z.enum(["user", "model"]),
  text: z.string().min(1).max(4000),
});

export const agentRequestSchema = z.object({
  messages: z.array(chatMessageSchema).min(1).max(30),
});

export type ChatMessage = z.infer<typeof chatMessageSchema>;

export const orderItemSchema = z.object({
  menu_item_id: z.number().int().positive(),
  quantity: z.number().int().min(1).max(5),
});

export const placeOrderSchema = z.object({
  items: z.array(orderItemSchema).min(1).max(5),
  slot_id: z.number().int().positive(),
});

export const updateOrderStatusSchema = z.object({
  order_id: z.number().int().positive(),
  status: z.enum(["preparing", "ready", "collected"]),
});
