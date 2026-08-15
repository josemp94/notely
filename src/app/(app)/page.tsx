"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { trpc } from "@/trpc/react";

export default function AppHome() {
  const router = useRouter();
  const { data: pages, isLoading } = trpc.pages.tree.useQuery();

  useEffect(() => {
    if (pages && pages.length > 0) {
      const firstRoot = pages.find((p) => p.parentId === null) ?? pages[0];
      router.replace(`/p/${firstRoot.id}`);
    }
  }, [pages, router]);

  return (
    <div className="flex h-dvh items-center justify-center text-[var(--muted)]">
      {isLoading ? "Cargando…" : pages && pages.length === 0 ? "Crea tu primera página →" : ""}
    </div>
  );
}
