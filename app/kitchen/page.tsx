"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";

type KitchenOrder = {
  id: number;
  student_id: string;
  student_name: string;
  status: "placed" | "preparing" | "ready" | "collected" | "cancelled";
  total: number;
  created_at: string;
  pickup_time: string;
  items: string[];
};

export default function KitchenPage() {
  const [orders, setOrders] = useState<KitchenOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const [error, setError] = useState("");

  const fetchKitchenOrders = useCallback(async () => {
    try {
      const res = await fetch("/api/kitchen");
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error ?? "Failed to fetch kitchen orders");
      }
      const data = await res.json();
      setOrders(data.orders ?? []);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error fetching orders");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchKitchenOrders();
    // Kitchen screen reloads every 3 seconds for live updates
    const interval = setInterval(fetchKitchenOrders, 3000);
    return () => clearInterval(interval);
  }, [fetchKitchenOrders]);

  async function updateStatus(orderId: number, nextStatus: "preparing" | "ready" | "collected") {
    setUpdatingId(orderId);
    setError("");
    try {
      const res = await fetch("/api/kitchen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order_id: orderId, status: nextStatus }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Status update failed");
      }
      // Instantly refresh list
      await fetchKitchenOrders();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update order");
    } finally {
      setUpdatingId(null);
    }
  }

  const placedOrders = orders.filter((o) => o.status === "placed");
  const preparingOrders = orders.filter((o) => o.status === "preparing");
  const readyOrders = orders.filter((o) => o.status === "ready");

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Top Header */}
      <header className="border-b border-slate-800 bg-slate-900/90 px-6 py-3.5 backdrop-blur-sm sticky top-0 z-10 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-lg">
            🍳
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold tracking-tight text-white">CampusBite Kitchen</h1>
              {/* Green Live Badge */}
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/20 px-2.5 py-0.5 text-xs font-semibold text-emerald-400 border border-emerald-500/30">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                Live
              </span>
            </div>
            <p className="text-xs text-slate-400">SRM Canteen Order Fulfillment Board · Polling every 3s</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-400">
            Active: <strong className="text-white">{orders.length}</strong> orders
          </span>
          <button
            onClick={() => fetchKitchenOrders()}
            className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-700 hover:text-white transition"
          >
            Refresh
          </button>
          <Link
            href="/"
            className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-700 hover:text-white transition flex items-center gap-1"
          >
            <span>Student App</span>
            <span>↗</span>
          </Link>
        </div>
      </header>

      {/* Global Error Banner */}
      {error && (
        <div className="mx-6 mt-4 rounded-lg bg-rose-500/15 border border-rose-500/30 px-4 py-2.5 text-xs text-rose-300 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError("")} className="text-rose-400 hover:text-white">✕</button>
        </div>
      )}

      {/* Main 3-Column Board */}
      <main className="flex-1 p-6 grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
        {/* Column 1: New Orders (placed) */}
        <section className="flex flex-col rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden min-h-[500px]">
          <div className="flex items-center justify-between border-b border-slate-800 bg-slate-900 px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-blue-500"></span>
              <h2 className="font-semibold text-sm text-slate-100">New Orders</h2>
            </div>
            <span className="rounded-full bg-blue-500/20 border border-blue-500/30 px-2 py-0.5 text-xs font-mono font-bold text-blue-300">
              {placedOrders.length}
            </span>
          </div>

          <div className="p-3 space-y-3 flex-1 overflow-y-auto">
            {loading && placedOrders.length === 0 ? (
              <p className="py-8 text-center text-xs text-slate-500">Loading orders...</p>
            ) : placedOrders.length === 0 ? (
              <p className="py-12 text-center text-xs text-slate-500">No new orders waiting.</p>
            ) : (
              placedOrders.map((order) => (
                <div
                  key={order.id}
                  className="rounded-lg border border-blue-900/40 bg-slate-900 p-3.5 shadow-sm space-y-2.5 hover:border-blue-700/60 transition"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-sm font-bold text-white">
                      Order #{order.id}
                    </span>
                    <span className="rounded bg-blue-500/20 px-2 py-0.5 text-[11px] font-semibold text-blue-300">
                      Pickup: {order.pickup_time || "Today"}
                    </span>
                  </div>

                  <div>
                    <p className="text-xs font-semibold text-slate-200">
                      {order.student_name}{" "}
                      <span className="text-[11px] font-normal text-slate-400">({order.student_id})</span>
                    </p>
                  </div>

                  <div className="rounded bg-slate-950/60 p-2 text-xs">
                    <ul className="space-y-1">
                      {order.items.map((item, idx) => (
                        <li key={idx} className="font-medium text-slate-200">
                          • {item}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <span className="text-xs font-bold text-slate-300">Rs {order.total}</span>
                    <button
                      onClick={() => updateStatus(order.id, "preparing")}
                      disabled={updatingId === order.id}
                      className="rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 px-3.5 py-1.5 text-xs font-semibold text-white shadow transition flex items-center gap-1.5"
                    >
                      {updatingId === order.id ? "Updating..." : "Start preparing →"}
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        {/* Column 2: Preparing */}
        <section className="flex flex-col rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden min-h-[500px]">
          <div className="flex items-center justify-between border-b border-slate-800 bg-slate-900 px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-amber-500 animate-pulse"></span>
              <h2 className="font-semibold text-sm text-slate-100">Preparing</h2>
            </div>
            <span className="rounded-full bg-amber-500/20 border border-amber-500/30 px-2 py-0.5 text-xs font-mono font-bold text-amber-300">
              {preparingOrders.length}
            </span>
          </div>

          <div className="p-3 space-y-3 flex-1 overflow-y-auto">
            {loading && preparingOrders.length === 0 ? (
              <p className="py-8 text-center text-xs text-slate-500">Loading orders...</p>
            ) : preparingOrders.length === 0 ? (
              <p className="py-12 text-center text-xs text-slate-500">No orders currently preparing.</p>
            ) : (
              preparingOrders.map((order) => (
                <div
                  key={order.id}
                  className="rounded-lg border border-amber-900/40 bg-slate-900 p-3.5 shadow-sm space-y-2.5 hover:border-amber-700/60 transition"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-sm font-bold text-white">
                      Order #{order.id}
                    </span>
                    <span className="rounded bg-amber-500/20 px-2 py-0.5 text-[11px] font-semibold text-amber-300">
                      Pickup: {order.pickup_time || "Today"}
                    </span>
                  </div>

                  <div>
                    <p className="text-xs font-semibold text-slate-200">
                      {order.student_name}{" "}
                      <span className="text-[11px] font-normal text-slate-400">({order.student_id})</span>
                    </p>
                  </div>

                  <div className="rounded bg-slate-950/60 p-2 text-xs">
                    <ul className="space-y-1">
                      {order.items.map((item, idx) => (
                        <li key={idx} className="font-medium text-slate-200">
                          • {item}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <span className="text-xs font-bold text-slate-300">Rs {order.total}</span>
                    <button
                      onClick={() => updateStatus(order.id, "ready")}
                      disabled={updatingId === order.id}
                      className="rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-50 px-3.5 py-1.5 text-xs font-semibold text-white shadow transition flex items-center gap-1.5"
                    >
                      {updatingId === order.id ? "Updating..." : "Mark ready →"}
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        {/* Column 3: Ready for Pickup */}
        <section className="flex flex-col rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden min-h-[500px]">
          <div className="flex items-center justify-between border-b border-slate-800 bg-slate-900 px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500"></span>
              <h2 className="font-semibold text-sm text-slate-100">Ready for Pickup</h2>
            </div>
            <span className="rounded-full bg-emerald-500/20 border border-emerald-500/30 px-2 py-0.5 text-xs font-mono font-bold text-emerald-300">
              {readyOrders.length}
            </span>
          </div>

          <div className="p-3 space-y-3 flex-1 overflow-y-auto">
            {loading && readyOrders.length === 0 ? (
              <p className="py-8 text-center text-xs text-slate-500">Loading orders...</p>
            ) : readyOrders.length === 0 ? (
              <p className="py-12 text-center text-xs text-slate-500">No orders waiting for pickup.</p>
            ) : (
              readyOrders.map((order) => (
                <div
                  key={order.id}
                  className="rounded-lg border border-emerald-900/40 bg-slate-900 p-3.5 shadow-sm space-y-2.5 hover:border-emerald-700/60 transition"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-sm font-bold text-white">
                      Order #{order.id}
                    </span>
                    <span className="rounded bg-emerald-500/20 px-2 py-0.5 text-[11px] font-semibold text-emerald-300">
                      Pickup: {order.pickup_time || "Today"}
                    </span>
                  </div>

                  <div>
                    <p className="text-xs font-semibold text-slate-200">
                      {order.student_name}{" "}
                      <span className="text-[11px] font-normal text-slate-400">({order.student_id})</span>
                    </p>
                  </div>

                  <div className="rounded bg-slate-950/60 p-2 text-xs">
                    <ul className="space-y-1">
                      {order.items.map((item, idx) => (
                        <li key={idx} className="font-medium text-slate-200">
                          • {item}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <span className="text-xs font-bold text-slate-300">Rs {order.total}</span>
                    <button
                      onClick={() => updateStatus(order.id, "collected")}
                      disabled={updatingId === order.id}
                      className="rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 px-3.5 py-1.5 text-xs font-semibold text-white shadow transition flex items-center gap-1.5"
                    >
                      {updatingId === order.id ? "Updating..." : "Collected ✓"}
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
