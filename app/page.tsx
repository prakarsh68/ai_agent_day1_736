"use client";

import { useState } from "react";
import Link from "next/link";
import AgentChat from "@/components/AgentChat";
import WalletOrders from "@/components/WalletOrders";
import MenuPanel from "@/components/MenuPanel";

/*
 * CAMPUSBITE STUDENT SCREEN
 * Left: AI ordering assistant. Right: Live wallet, orders, and real-time menu.
 */
export default function HomePage() {
  // Changes every time the agent writes data, so the list on the right reloads.
  const [refreshKey, setRefreshKey] = useState(0);

  async function logout() {
    await fetch("/api/logout", { method: "POST" });
    window.location.href = "/login";
  }

  return (
    <main className="mx-auto max-w-6xl p-4 md:p-6">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-2xl">🍛</span>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">
              CampusBite · SRM canteen ordering agent
            </h1>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Order food in plain English · AI checks menu, wallet &amp; slots automatically
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/kitchen"
            target="_blank"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 hover:text-slate-900"
          >
            <span>👨‍🍳</span>
            <span>Open kitchen screen</span>
            <span className="text-slate-400">↗</span>
          </Link>
          <button
            onClick={logout}
            className="text-xs text-slate-500 transition hover:text-slate-900"
          >
            Log out
          </button>
        </div>
      </header>

      <div className="grid gap-4 md:grid-cols-5 items-start">
        <section className="md:col-span-3">
          <AgentChat onDataChanged={() => setRefreshKey((k) => k + 1)} />
        </section>
        <section className="md:col-span-2 space-y-4">
          <WalletOrders refreshKey={refreshKey} />
          <MenuPanel refreshKey={refreshKey} />
        </section>
      </div>
    </main>
  );
}
