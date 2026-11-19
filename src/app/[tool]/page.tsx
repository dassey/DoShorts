import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Analyzer } from "@/components/tools/Analyzer";
import { Copilot } from "@/components/tools/Copilot";
import { Planner } from "@/components/tools/Planner";
import { ScriptWriter } from "@/components/tools/ScriptWriter";
import { Titles } from "@/components/tools/Titles";
import { Trends } from "@/components/tools/Trends";
import { TOOLS, getTool, type ToolSlug } from "@/lib/tools";

const SCREENS: Record<ToolSlug, React.ComponentType> = {
  copilot: Copilot,
  titles: Titles,
  script: ScriptWriter,
  analyze: Analyzer,
  trends: Trends,
  planner: Planner,
};

type Props = { params: Promise<{ tool: string }> };

export function generateStaticParams() {
  return TOOLS.map((t) => ({ tool: t.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const tool = getTool((await params).tool);
  return tool ? { title: tool.name, description: tool.tagline } : {};
}

export default async function ToolPage({ params }: Props) {
  const tool = getTool((await params).tool);
  if (!tool) notFound();
  const Screen = SCREENS[tool.slug];
  return (
    // Screens read prefilled inputs from the query string, which is only known at request time.
    <Suspense>
      <Screen />
    </Suspense>
  );
}
