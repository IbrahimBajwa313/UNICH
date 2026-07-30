import { Sidebar } from "@/components/layout/Sidebar";
import { TopBar } from "@/components/layout/TopBar";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-canvas flex h-screen overflow-hidden bg-canvas">
      <div className="app-shell flex h-full w-full">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col bg-transparent">
          <TopBar />
          <main className="scrollbar-thin flex-1 overflow-y-auto px-6 py-6">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
