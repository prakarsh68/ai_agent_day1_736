"use client";

import { useEffect, useState, useCallback } from "react";
import type { OrderStatus } from "@/lib/campusbite";

type Wallet = {
  student_id: string;
  name: string;
  balance: number;
};

type Order = {
  id: number;
  status: OrderStatus;
  total: number;
  created_at: string;
  pickup_time: string;
  items: string[];
};

export default function WalletOrders({ refreshKey }: { refreshKey: number }) {
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/me");
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error ?? "Failed to load wallet data");
      }
      const data = await res.json();
      setWallet(data.wallet);
      setOrders(data.orders ?? []);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error loading data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    // Auto-refresh every 5 seconds so kitchen status updates appear live
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, [fetchData, refreshKey]);

  const getStatusBadge = (status: OrderStatus) => {
    switch (status) {
      case "placed":
        return (
          <span className="inline-flex items-center rounded-full bg-blue-500/20 px-2 py-0.5 text-xs font-medium text-blue-300 border border-blue-500/30">
            Placed
          </span>
        );
      case "preparing":
        return (
          <span className="inline-flex items-center rounded-full bg-amber-500/20 px-2 py-0.5 text-xs font-medium text-amber-300 border border-amber-500/30 animate-pulse">
            Preparing
          </span>
        );
      case "ready":
        return (
          <span className="inline-flex items-center rounded-full bg-emerald-500/20 px-2 py-0.5 text-xs font-semibold text-emerald-300 border border-emerald-500/30">
            Ready for Pickup
          </span>
        );
      case "collected":
        return (
          <span className="inline-flex items-center rounded-full bg-slate-700 px-2 py-0.5 text-xs font-medium text-slate-300">
            Collected
          </span>
        );
      case "cancelled":
        return (
          <span className="inline-flex items-center rounded-full bg-rose-500/20 px-2 py-0.5 text-xs font-medium text-rose-300 border border-rose-500/30">
            Cancelled
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center rounded-full bg-slate-800 px-2 py-0.5 text-xs text-slate-400">
            {status}
          </span>
        );
    }
  };

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-4 text-white shadow-sm">
      {/* Wallet balance header */}
      <div className="flex items-start justify-between border-b border-slate-800 pb-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold">{wallet?.name ?? "Student"}</h2>
            <span className="rounded bg-slate-800 px-1.5 py-0.5 text-xs font-mono text-slate-400">
              {wallet?.student_id ?? "S001"}
            </span>
          </div>
          <p className="text-xs text-slate-400">SRM Student Campus Card</p>
        </div>
        <div className="text-right">
          <p className="text-xs uppercase tracking-wider text-slate-400">Wallet</p>
          <p className="text-xl font-bold text-emerald-400">
            {wallet ? `Rs ${wallet.balance}` : "..."}
          </p>
        </div>
      </div>

      {/* Orders section */}
      <div className="mt-3">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            My Orders Today
          </h3>
          <span className="text-[11px] text-slate-500">Auto-refreshes 5s</span>
        </div>

        {error && <p className="py-2 text-xs text-rose-400">{error}</p>}

        {loading && !wallet && (
          <p className="py-4 text-center text-xs text-slate-500">Loading wallet & orders...</p>
        )}

        {!loading && orders.length === 0 && (
          <p className="py-4 text-center text-xs text-slate-500">No orders placed yet today.</p>
        )}

        <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
          {orders.map((order) => (
            <div
              key={order.id}
              className="rounded-lg border border-slate-800 bg-slate-950/60 p-2.5 text-xs transition-colors hover:border-slate-700"
            >
              <div className="flex items-center justify-between">
                <span className="font-mono font-semibold text-slate-200">Order #{order.id}</span>
                {getStatusBadge(order.status)}
              </div>

              <div className="mt-1 text-slate-300">
                {order.items.length > 0 ? (
                  <p className="line-clamp-2">{order.items.join(", ")}</p>
                ) : (
                  <p className="text-slate-500 italic">Food items</p>
                )}
              </div>

              <div className="mt-2 flex items-center justify-between border-t border-slate-800/80 pt-1.5 text-[11px] text-slate-400">
                <span>Pickup: <strong className="text-slate-200">{order.pickup_time || "Today"}</strong></span>
                <span className="font-semibold text-slate-200">Rs {order.total}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
