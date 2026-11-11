/**
 * CampusBite canteen ordering shared constants and helpers.
 */

export const CURRENT_STUDENT_ID = "S001";

/**
 * Formats a time string like "13:15:00" or "13:15" into "1:15 pm".
 */
export function formatSlot(rawTime: string): string {
  if (!rawTime) return "";
  const parts = rawTime.split(":");
  let hours = parseInt(parts[0], 10);
  const minutes = parseInt(parts[1] ?? "0", 10);
  if (isNaN(hours)) return rawTime;

  const ampm = hours >= 12 ? "pm" : "am";
  hours = hours % 12;
  if (hours === 0) hours = 12;
  const minStr = minutes < 10 ? `0${minutes}` : `${minutes}`;
  return `${hours}:${minStr} ${ampm}`;
}

export type MenuItem = {
  id: number;
  name: string;
  category: "meal" | "snack" | "drink" | "sweet";
  price: number;
  is_veg: boolean;
  stock: number;
  prep_minutes: number;
  description: string;
};

export type OrderStatus = "placed" | "preparing" | "ready" | "collected" | "cancelled";
