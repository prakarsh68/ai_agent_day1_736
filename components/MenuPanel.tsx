"use client";

import { useEffect, useState, useCallback } from "react";
import type { MenuItem } from "@/lib/campusbite";

const CATEGORY_LABELS: Record<string, { label: string; icon: string }> = {
  meal: { label: "Meals", icon: "🍱" },
  snack: { label: "Snacks", icon: "🥟" },
  sweet: { label: "Sweets", icon: "🍮" },
  drink: { label: "Drinks", icon: "☕" },
};

const CATEGORY_ORDER = ["meal", "snack", "sweet", "drink"];

export default function MenuPanel({ refreshKey }: { refreshKey: number }) {
  const [items, setItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchMenu = useCallback(async () => {
    try {
      const res = await fetch("/api/menu");
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error ?? "Failed to load menu");
      }
      const data = await res.json();
      setItems(data.items ?? []);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error loading menu");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMenu();
    // Auto-refresh every 5 seconds so live stock updates appear
    const interval = setInterval(fetchMenu, 5000);
    return () => clearInterval(interval);
  }, [fetchMenu, refreshKey]);

  // Group items by category
  const grouped = CATEGORY_ORDER.map((cat) => ({
    key: cat,
    meta: CATEGORY_LABELS[cat] ?? { label: cat, icon: "🍽️" },
    items: items.filter((item) => item.category === cat),
  }));

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <div className="border-b border-slate-200 bg-slate-50/70 px-4 py-3 flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-slate-800 text-sm">Today&apos;s Live Menu</h2>
          <p className="text-xs text-slate-500">Real-time canteen stock &amp; prices</p>
        </div>
        <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          Live
        </span>
      </div>

      {error && <div className="p-4 text-xs text-rose-600 bg-rose-50">{error}</div>}

      {loading && items.length === 0 && (
        <div className="p-6 text-center text-xs text-slate-400">Loading canteen menu...</div>
      )}

      <div className="max-h-[calc(70vh-210px)] min-h-[260px] overflow-y-auto divide-y divide-slate-100">
        {grouped.map(({ key, meta, items: groupItems }) => {
          if (groupItems.length === 0) return null;
          return (
            <div key={key} className="p-3">
              <div className="mb-2 flex items-center gap-1.5">
                <span className="text-sm">{meta.icon}</span>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  {meta.label}
                </h3>
              </div>

              <div className="space-y-1.5">
                {groupItems.map((item) => {
                  const isSoldOut = item.stock === 0;
                  const isLowStock = item.stock > 0 && item.stock <= 3;

                  return (
                    <div
                      key={item.id}
                      className={`flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-xs transition-colors ${
                        isSoldOut ? "bg-slate-50 text-slate-400 opacity-60" : "hover:bg-slate-50 text-slate-700"
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        {/* Veg / Non-veg indicator dot */}
                        <span
                          className={`flex-shrink-0 h-2.5 w-2.5 rounded-full border ${
                            item.is_veg
                              ? "bg-emerald-600 border-emerald-700"
                              : "bg-rose-600 border-rose-700"
                          }`}
                          title={item.is_veg ? "Vegetarian" : "Non-Vegetarian"}
                        />

                        <div className="min-w-0 truncate">
                          <span className={`font-medium ${isSoldOut ? "line-through text-slate-400" : "text-slate-800"}`}>
                            {item.name}
                          </span>
                          {item.description && (
                            <p className="truncate text-[10px] text-slate-400">{item.description}</p>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 flex-shrink-0">
                        {isSoldOut ? (
                          <span className="rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-semibold text-rose-700">
                            Sold out
                          </span>
                        ) : isLowStock ? (
                          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
                            Only {item.stock} left
                          </span>
                        ) : null}

                        <span className="font-semibold text-slate-900 w-12 text-right">
                          Rs {item.price}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
