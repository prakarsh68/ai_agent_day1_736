# CampusBite: Live Demo Script (about 10 minutes)

## Setup (before students arrive)

1. Supabase SQL Editor: run `seed/campusbite.sql` (this also resets all data)
2. `npm run dev` (or open the Vercel link) and log in
3. Open two browser windows side by side:
   - Left: the student screen `/`
   - Right: the kitchen screen `/kitchen`
4. Check `/api/health` shows `ok (CampusBite tables found)`

Starting data: S001 Priya has Rs 150. Chicken Biryani has 2 left. Paneer Butter Masala is sold out. The 12:30 slot is full and 1:00 is almost full.

## The 6 moments

| # | Type or do | What happens | What to say |
| --- | --- | --- | --- |
| 1 | "What's veg under Rs 80 today?" | `getMenu` with filters. Paneer is not listed. | "The agent chose the tool and the filters by itself." |
| 2 | "I have Rs 150. Get me lunch with something sweet, pick up at 1:15." | `getMenu` → `getWalletBalance` → `getPickupSlots` → `placeOrder`. Wallet drops to Rs 50, the order appears in the kitchen. | "One sentence, four tools, three tables changed. That is an agent, not a chatbot." |
| 3 | "Add a chicken biryani too." | Refused: Rs 120 is more than Rs 50. Suggests something cheaper. | "The rule is in the database. The AI cannot talk its way around it." |
| 4 | Kitchen screen: click **Start preparing** | Status changes to Preparing on the student screen within 5 seconds. | "The kitchen and the student see the same live data." |
| 5 | "Cancel my order." | Refused: the kitchen has already started. | "Business rules protect the canteen, not just the student." |
| 6 | "Order a filter coffee for 2 pm." then "Cancel it." | Order placed, then cancelled with a refund. Stock goes back. | "Every write is undone correctly: wallet, stock and slot." |

Click a grey tool step in the chat to show the arguments Gemini sent and the result your code returned.

## Bonus moments (if time allows)

- "Can I pick up at 12:30?" → the slot is full, the agent offers another time
- "Get me 2 chicken biryanis and 2 more for my friends" → stock and the 5-item limit
- "Write me a poem" → the agent politely stays on the canteen topic

## Reset between rehearsals

Run `seed/campusbite.sql` again. It drops and recreates everything with fresh stock, wallets and slots.

## If something fails live

| Problem | Do this |
| --- | --- |
| Gemini 429 / quota | Wait 1 minute; say "this is why free tiers have limits" |
| Agent does not call a tool | Ask more directly: "Use the menu tool to show veg items under Rs 80" |
| Wi-Fi drops | Switch to a mobile hotspot, or play the backup recording |
| Live build code breaks | `git checkout lib/agent/tools.ts` to restore the finished tools |
