import type { Metadata } from "next";
import { IBM_Plex_Mono, Outfit } from "next/font/google";
import type { ReactNode } from "react";
import "./tailwind.css";

const display = Outfit({
  subsets: ["latin"],
  variable: "--font-display",
});

const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-sans",
});

export const metadata: Metadata = {
  title: "Sportz Live",
  description: "Next.js frontend for the Sportz match and commentary API.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${mono.variable}`}>
      <body className="min-h-screen bg-[#f7f7f5] text-slate-100 antialiased">
        <main className="app-shell">{children}</main>
      </body>
    </html>
  );
}
