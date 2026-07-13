"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Upload,
  Users,
  List,
  Mail,
  BarChart3,
  Settings,
  type LucideIcon,
} from "lucide-react";
import { useSidebar } from "@/lib/sidebar-context";
import { cn } from "@/lib/utils";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

const navItems: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/campaigns", label: "Campaigns", icon: Mail },
  { href: "/lists", label: "Lists", icon: List },
  { href: "/contacts", label: "Contacts", icon: Users },
  { href: "/upload", label: "Upload CSV", icon: Upload },
  { href: "/reports", label: "Reports", icon: BarChart3 },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <div className="flex h-full flex-col gap-1 bg-sidebar px-3.5 py-6 text-sidebar-foreground">
      {/* Logo */}
      <Link
        href="/dashboard"
        onClick={onNavigate}
        className="mb-4 flex items-center gap-2.5 rounded-md px-2 py-1.5 outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logo.png"
          alt="Mailwave"
          width={28}
          height={28}
          className="rounded-md"
        />
        <span className="text-[15px] font-semibold tracking-tight text-white">Mailwave</span>
      </Link>

      {/* Section label */}
      <div className="px-2.5 pb-1 pt-2 text-[10.5px] font-medium uppercase tracking-wider text-white/40">
        Main
      </div>

      {/* Nav items */}
      <nav className="flex flex-col gap-0.5">
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13.5px] font-normal transition-colors",
                "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
                active
                  ? "bg-sidebar-accent font-semibold text-sidebar-accent-foreground"
                  : "text-sidebar-foreground"
              )}
            >
              <Icon className="h-[18px] w-[18px] shrink-0" />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Version + credits */}
      <div className="mt-auto flex flex-col items-center gap-0.5 pb-1 pt-4 text-center">
        <span className="text-[11px] text-white/30">
          Version v1.1
        </span>
        <span className="text-[11px] text-white/30">
          Created by Alejandro Pujols
        </span>
      </div>
    </div>
  );
}

/** Desktop sidebar (hidden on small screens). */
export function Sidebar() {
  return (
    <aside className="sticky top-0 hidden h-screen w-60 shrink-0 md:block">
      <SidebarContent />
    </aside>
  );
}

/** Mobile sidebar (Sheet). Renders nothing on desktop. */
export function MobileSidebar() {
  const { isOpen, close } = useSidebar();
  return (
    <MobileSidebarInner isOpen={isOpen} close={close} />
  );
}

// Inner component kept separate to keep the Sheet import client-side only
import { Sheet, SheetContent } from "@/components/ui/sheet";

function MobileSidebarInner({ isOpen, close }: { isOpen: boolean; close: () => void }) {
  return (
    <Sheet open={isOpen} onOpenChange={(o) => !o && close()}>
      <SheetContent side="left" className="w-64 p-0" hideClose>
        <SidebarContent onNavigate={close} />
      </SheetContent>
    </Sheet>
  );
}
