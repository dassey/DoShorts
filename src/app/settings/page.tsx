import type { Metadata } from "next";
import { Settings } from "@/components/Settings";

export const metadata: Metadata = { title: "AI settings" };

export default function SettingsPage() {
  return <Settings />;
}
