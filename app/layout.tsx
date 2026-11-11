import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CampusBite · SRM Canteen Ordering Agent",
  description: "AI-powered canteen food ordering with real-time stock, wallet checkout and live kitchen display system",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
