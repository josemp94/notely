import { TRPCProvider } from "@/trpc/react";
import { Sidebar } from "@/components/sidebar/Sidebar";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <TRPCProvider>
      <div className="flex">
        <Sidebar />
        <main className="h-dvh flex-1 overflow-y-auto">{children}</main>
      </div>
    </TRPCProvider>
  );
}
