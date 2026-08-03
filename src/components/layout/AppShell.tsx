"use client";

import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopBar } from "@/components/layout/TopBar";
import { clsx } from "@/lib/format";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isPos = pathname === "/pos" || pathname.startsWith("/pos/");

  return (
    <div className="app-canvas flex h-screen overflow-hidden bg-canvas">
      <div className="app-shell flex h-full w-full">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col bg-transparent">
          <TopBar />
          <main
            className={clsx(
              "flex-1 px-6",
              isPos
                ? "overflow-hidden py-4"
                : "scrollbar-hidden overflow-y-auto py-6",
            )}
          >
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
