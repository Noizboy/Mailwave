import { Sidebar, MobileSidebar } from "@/components/layout/sidebar";
import { SidebarProvider } from "@/lib/sidebar-context";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <div className="flex h-screen overflow-hidden bg-background">
        <Sidebar />
        <MobileSidebar />
        <div className="flex min-w-0 flex-1 flex-col overflow-auto">
          {children}
        </div>
      </div>
    </SidebarProvider>
  );
}
