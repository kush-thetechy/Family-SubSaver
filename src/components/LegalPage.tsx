import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { getLegalConfig, type LegalConfig } from "@/lib/legal";

export function LegalPage({
  title,
  children,
  requires,
}: {
  title: string;
  children: (c: LegalConfig) => ReactNode;
  requires?: (c: LegalConfig) => boolean;
}) {
  const c = getLegalConfig();
  if (!c || (requires && !requires(c))) notFound();
  return (
    <main className="mx-auto max-w-2xl px-5 py-10 text-sm leading-6 text-slate-800 space-y-4">
      <h1 className="text-2xl font-semibold">{title}</h1>
      {children(c)}
      <p className="text-xs text-slate-500">Operator: {c.operator}. Contact: {c.contact}.</p>
    </main>
  );
}
