import { notFound } from "next/navigation";
import { getTool, TOOLS } from "@/lib/tools";
import { Workspace } from "@/components/workspace";

export function generateStaticParams() {
  return TOOLS.map((t) => ({ slug: t.slug }));
}

export default function ToolPage({ params }: { params: { slug: string } }) {
  const tool = getTool(params.slug);
  if (!tool) notFound();
  return <Workspace tool={tool} />;
}
