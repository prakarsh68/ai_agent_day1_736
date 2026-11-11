/** Today's date in India (YYYY-MM-DD). Used in the system prompt so "tomorrow" works. */
export function todayInIndia(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
}

export function weekdayInIndia(): string {
  return new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", weekday: "long" }).format(
    new Date()
  );
}
