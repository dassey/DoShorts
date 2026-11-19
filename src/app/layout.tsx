import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AiProvider } from "@/components/AiProvider";
import { AppProvider } from "@/components/AppProvider";
import { Shell } from "@/components/Shell";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "DoShorts: plan and improve your Shorts", template: "%s · DoShorts" },
  description:
    "An AI toolkit for short-form video: titles, hooks, thumbnail ideas, scripts, Short analysis, trending topics and a 7-day content plan.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
      <body className="min-h-dvh">
        <AppProvider>
          <AiProvider>
            <Shell>{children}</Shell>
          </AiProvider>
        </AppProvider>
      </body>
    </html>
  );
}
