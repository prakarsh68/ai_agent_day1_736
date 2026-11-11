# CampusBite project rules
- Goal: turn this starter into CampusBite, the SRM campus canteen ordering agent. Students order food in plain English; the agent checks the menu, wallet and pickup slots, then places the order. A kitchen screen shows live orders.
- The logged-in student is always CURRENT_STUDENT_ID = "S001" (create it in lib/campusbite.ts). Never take a student id as a tool argument.
- Stack: Next.js App Router, React, TypeScript, Tailwind CSS, Supabase, Gemini function calling, Zod.
- Agent tools live in lib/agent/tools.ts. Each tool uses defineTool() with a Zod schema, like the existing listTasks example.
- Database (already created from seed/campusbite.sql): tables menu_items, wallets, pickup_slots, orders, order_items.
- Placing and cancelling orders must use the database functions place_order(p_student_id, p_slot_id, p_items) and cancel_order(p_student_id, p_order_id) through getSupabase().rpc(). Never update wallets or stock directly from TypeScript.
- Only files in lib/ and app/api/ may call getSupabase(). Never use the Supabase secret key in components.
- Prices are whole rupees, shown as "Rs 70". Keep code simple, with short comments.
