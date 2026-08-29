"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { track } from "@/lib/analytics/client";

export function TrackedLink({ href, className, source, children }: { href: string; className?: string; source: string; children: ReactNode }) {
  return <Link href={href} className={className} onClick={() => track("seo_cta_clicked", { source })}>{children}</Link>;
}
