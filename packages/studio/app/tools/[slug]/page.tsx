import { notFound } from "next/navigation";
import { getTool, TOOLS } from "@/lib/tools";
import { Workspace } from "@/components/workspace";

export function generateStaticParams() {
  return TOOLS.map((t) => ({ slug: t.slug }));
}

export default async function ToolPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const tool = getTool(slug);
  if (!tool) notFound();
  return <Workspace tool={tool} />;
}
