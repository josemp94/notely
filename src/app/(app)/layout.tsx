import { TRPCProvider } from "@/trpc/react";
import { AppShell } from "@/components/AppShell";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <TRPCProvider>
      <AppShell>{children}</AppShell>
    </TRPCProvider>
  );
}
