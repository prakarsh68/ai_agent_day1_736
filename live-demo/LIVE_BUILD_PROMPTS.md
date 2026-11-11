# CampusBite: Build It Live with AI Prompts

Start from this plain starter and turn it into CampusBite in front of students, using GitHub Copilot (Agent mode) or Claude Code.

Prepared by Sathish Kumar K., AI Educator

| Step | What happens | Time |
| --- | --- | --- |
| 0 | Setup (done before the session) | – |
| 1 | Plan with AI | 3 min |
| 2–4 | Agent tools and system prompt | 12 min |
| 5–7 | API routes, student screen, kitchen screen | 15 min |
| 8 | Build, fix, deploy | 5 min |
| 9 | Live demo (see DEMO_SCRIPT.md) | 10 min |

**Tool choice:** use Copilot for Steps 1–4 and Claude Code for Steps 5–8. Students see both tools, and Claude Code runs the build and fixes errors by itself.

**After every prompt:** read the changes, click **Keep** (Copilot) or approve (Claude Code), then test.

---

## Step 0: Setup before the session

1. `npm install`
2. Copy your `.env.local` into this folder (5 values: Gemini key, `GEMINI_MODEL=gemini-3.8-flash`, Supabase URL, Supabase secret key, passcode)
3. In Supabase **SQL Editor**, run `seed/00_starter_example.sql`, then `seed/campusbite.sql`
4. `npm run dev`, open `localhost:3000/api/health`, then log in and try "Which tasks are still open?"
5. Keep the finished `campusbite-demo` app ready in another folder as a backup

The project rules for the AI are already in `.github/copilot-instructions.md` (Copilot) and `CLAUDE.md` (Claude Code).

To reset the data at any time, run `seed/campusbite.sql` again.

---

## Step 1: Plan (Copilot Ask mode)

```text
#codebase Read this Next.js starter and seed/campusbite.sql.
I want to turn this starter into CampusBite, an SRM canteen ordering agent.
Students order food in plain English; the AI agent checks the menu, wallet and pickup slots, then places the order. A kitchen screen shows live orders.
Give me a short build plan: which files to create or change, which agent tools we need, and which API routes and pages. Do not write code yet.
```

**Say:** "Good developers plan before they code, even with AI."

---

## Step 2: Read tools (Copilot Agent mode)

```text
In #file:lib/agent/tools.ts replace the 3 task example tools with 4 read tools for CampusBite, using defineTool like the existing examples.
- Create lib/campusbite.ts with: export const CURRENT_STUDENT_ID = "S001"; and a helper formatSlot("13:15:00") -> "1:15 pm".
- getMenu: reads menu_items where stock > 0. Optional args: category (meal, snack, drink, sweet), veg_only (boolean), max_price (integer). Order by category, then price. Return id, name, category, price, is_veg, stock, description.
- getWalletBalance: no args. Returns name and balance for CURRENT_STUDENT_ID from wallets.
- getPickupSlots: no args. Reads pickup_slots, returns slot_id, time (formatted) and free (capacity - booked), only slots with free > 0.
- getMyOrders: no args. Returns the student's last 10 orders with id, status, total, pickup time and item names (join order_items and menu_items).
Descriptions must start with "Use this when...". Never take a student id as an argument.
```

**Check before Keep:** student id comes from `CURRENT_STUDENT_ID`; `getMenu` filters `stock > 0`.

**Test:** "What's veg under Rs 80 today?"

---

## Step 3: Write tools (Copilot Agent mode)

```text
In #file:lib/agent/tools.ts add 2 write tools (writes: true):
- placeOrder: args items (array of { menu_item_id, quantity 1-5 }, at least 1) and slot_id. Call getSupabase().rpc("place_order", { p_student_id: CURRENT_STUDENT_ID, p_slot_id: slot_id, p_items: items }). Throw new Error(error.message) on error, else return data.
- cancelOrder: arg order_id. Call rpc("cancel_order", { p_student_id: CURRENT_STUDENT_ID, p_order_id: order_id }) the same way.
Do not update wallets or stock directly in TypeScript; the database functions do all checks.
The tools array must be exactly: getMenu, getWalletBalance, getPickupSlots, getMyOrders, placeOrder, cancelOrder.
```

**Check before Keep:** both use `rpc(...)`; no direct `update` on wallets or menu_items.

**Say:** "The money and stock rules live in the database, so the AI cannot break them."

---

## Step 4: System prompt (Copilot Edit mode)

```text
Rewrite buildSystemPrompt in #file:lib/agent/systemPrompt.ts for CampusBite:
- You are CampusBite, the friendly SRM canteen ordering assistant. The student is CURRENT_STUDENT_ID.
- Keep the line with today's date. Pickup is today only, 12:00 pm to 2:30 pm.
- Always use tools for menu, prices, stock, wallet and slots. Never invent them.
- Before ordering, check menu, wallet and free slots. If the student gives a budget, fit the total to it.
- If no pickup time is given, use the earliest free slot. If a time is full, offer the nearest free time.
- If an item is sold out or the wallet is too low, explain simply and suggest a cheaper or similar item.
- After ordering, reply with items, total, pickup time and wallet balance left. Prices like "Rs 70".
- If the kitchen has started an order, explain it cannot be cancelled.
- Keep replies short. Only help with the canteen.
```

**Test:** "I have Rs 150. Get me lunch with something sweet, pick up at 1:15." The order works in the chat already, before the new screens exist. Check the `orders` table in Supabase.

---

## Step 5: API routes (Claude Code or Copilot Agent mode)

```text
Create 3 API routes, following the pattern of app/api/tasks/route.ts:
1. app/api/menu/route.ts GET: all menu_items (including sold out), ordered by category and price.
2. app/api/me/route.ts GET: wallet of CURRENT_STUDENT_ID and their last 5 orders with pickup time and item names.
3. app/api/kitchen/route.ts GET: orders with status placed, preparing or ready, with student name, pickup time and items, oldest first.
   POST { order_id, status }: validate with Zod. Only allow the next step: placed -> preparing -> ready -> collected. Return 409 for any other change.
Add export const dynamic = "force-dynamic" to each. Log errors with console.error.
Also update app/api/health/route.ts to check the menu_items table instead of tasks.
```

**Test:** open `localhost:3000/api/menu` and `localhost:3000/api/kitchen` in the browser.

---

## Step 6: Student screen (Claude Code or Copilot Agent mode)

```text
Build the CampusBite student screen:
1. components/WalletOrders.tsx: a dark card showing the wallet balance (Rs) and student name, then "My orders today" with order number, pickup time, items, total and a coloured status badge. Loads /api/me.
2. components/MenuPanel.tsx: today's menu grouped by meals, snacks, sweets, drinks. Each row: green or red veg dot, name, stock ("Sold out" red badge at 0, "Only N left" amber badge at 3 or less), price. Loads /api/menu.
3. Both reload when refreshKey changes AND every 5 seconds, so kitchen updates appear.
4. In app/page.tsx replace TaskList with WalletOrders above MenuPanel on the right. Title "CampusBite · SRM canteen ordering agent", and an "Open kitchen screen" link to /kitchen.
5. In components/AgentChat.tsx set SAMPLE_PROMPTS to: "What's veg under Rs 80 today?", "I have Rs 150. Get me lunch with something sweet, pick up at 1:15.", "Add a chicken biryani too.", "Cancel my latest order."
Use Tailwind. Delete components/TaskList.tsx and app/api/tasks.
```

**Note:** Supabase can return a joined row as an object or a one-item array. If item names show as blank, ask: "Handle related rows that may be an object or an array."

---

## Step 7: Kitchen screen (Claude Code or Copilot Agent mode)

```text
Create app/kitchen/page.tsx: a dark full-screen kitchen board with 3 columns: New orders, Preparing, Ready for pickup.
Each order card shows order number, pickup time, student name, items and total, with one button:
"Start preparing" (placed), "Mark ready" (preparing), "Collected" (ready). The button calls POST /api/kitchen.
Reload /api/kitchen every 3 seconds. Show a green "Live" badge in the header. Use Tailwind.
```

---

## Step 8: Build, fix and deploy

Copilot (Ask mode, after running `npm run build`):

```text
#terminalLastCommand Explain these errors in one line each and fix them. Then tell me to run npm run build again.
```

Claude Code:

```text
Run npm run build and fix all errors until it passes. Explain each fix in one line.
```

Then commit (sparkle icon for the message), push, and Vercel deploys automatically. Before the demo, run `seed/campusbite.sql` again for fresh data.

---

## Step 9: Live demo

Follow `live-demo/DEMO_SCRIPT.md` (6 moments). Open the student screen and `/kitchen` side by side.

---

## Optional finale: Claude Code in one prompt

To show the power of an agentic coding tool, run this on a fresh copy of the starter (rehearse it first):

```text
Read CLAUDE.md and seed/campusbite.sql. Turn this starter into CampusBite:
6 agent tools (getMenu, getWalletBalance, getPickupSlots, getMyOrders, placeOrder and cancelOrder using rpc place_order / cancel_order),
a CampusBite system prompt, API routes /api/menu, /api/me and /api/kitchen (GET + POST status changes),
a student screen with wallet, my orders and live menu, and a /kitchen board with 3 columns.
Remove the tasks example. Run npm run build and fix all errors until it passes.
```

---

## If something goes wrong

| Problem | Do this |
| --- | --- |
| A prompt gives broken code | Undo and send it again, or ask "fix the errors in this file" |
| Agent does not call a tool | Check the tool is in the `tools` array and its description starts with "Use this when..." |
| `Could not find the function place_order` | Run `seed/campusbite.sql` again in Supabase |
| Chat limit reached in Copilot | Continue in Claude Code |
| Running out of time | Switch to the finished `campusbite-demo` backup |
| Wi-Fi drops | Mobile hotspot, then the backup |
