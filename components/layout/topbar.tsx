"use client";

import { useSession, signOut } from "next-auth/react";
import { Bell, LogOut, Settings, Menu, CheckCircle2, XCircle, Sparkles, Info } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { cn, formatDateTime } from "@/lib/utils";
import { useSidebar } from "@/lib/sidebar-context";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface TopBarProps {
  title: string;
  actions?: React.ReactNode;
  hideTitleOnMobile?: boolean;
}

interface Notification {
  id: string;
  title: string;
  body: string;
  type: string;
  read: boolean;
  entityType: string | null;
  entityId: string | null;
  createdAt: string;
}

const PAGE_NAMES: Record<string, string> = {
  dashboard: "Dashboard",
  contacts: "Contacts",
  lists: "Lists",
  campaigns: "Campaigns",
  upload: "Upload CSV",
  settings: "Settings",
  reports: "Reports",
  import: "Import",
  create: "Create Campaign",
  review: "Review",
  add: "Add Contact",
  notifications: "Notifications",
};

function getBreadcrumbs(pathname: string): string {
  const segments = pathname.split("/").filter(Boolean);
  const named = segments.filter((s) => !s.match(/^[a-f0-9-]{36}$/i));
  const parts = named.map((s) => PAGE_NAMES[s] ?? s.charAt(0).toUpperCase() + s.slice(1));
  if (parts.length <= 1) return "MailWave";
  return parts.slice(0, -1).join(" / ");
}

function getInitials(name?: string | null, email?: string | null): string {
  if (name) {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return parts[0].slice(0, 2).toUpperCase();
  }
  if (email) return email.slice(0, 2).toUpperCase();
  return "MW";
}

function getNotifTone(type: string): "success" | "destructive" | "info" | "neutral" {
  if (type.includes("fail") || type.includes("error")) return "destructive";
  if (type.includes("complete") || type.includes("success") || type.includes("ready")) return "success";
  if (type.includes("ai") || type.includes("generate")) return "info";
  return "neutral";
}

export function TopBar({ title, actions, hideTitleOnMobile }: TopBarProps) {
  const { data: session } = useSession();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const { toggle: toggleSidebar } = useSidebar();

  const crumbs = getBreadcrumbs(pathname);
  const initials = getInitials(session?.user?.name, session?.user?.email);

  const { data: notifData } = useQuery({
    queryKey: ["notifications"],
    queryFn: async () => {
      const res = await fetch("/api/notifications");
      if (!res.ok) return { notifications: [], unreadCount: 0 };
      return res.json() as Promise<{ notifications: Notification[]; unreadCount: number }>;
    },
    refetchInterval: 30000,
  });

  const unreadCount = notifData?.unreadCount ?? 0;
  const notifications = notifData?.notifications ?? [];

  const { data: smtpStatus } = useQuery({
    queryKey: ["smtp-status"],
    queryFn: async () => {
      const res = await fetch("/api/settings/smtp");
      if (!res.ok) return "disconnected";
      const data = await res.json();
      return (data?.status ?? "disconnected") as string;
    },
    refetchInterval: 60000,
  });

  const { data: aiStatus } = useQuery({
    queryKey: ["ai-status"],
    queryFn: async () => {
      const res = await fetch("/api/settings/ai");
      if (!res.ok) return "disconnected";
      const data = await res.json();
      return (data?.status ?? "disconnected") as string;
    },
    refetchInterval: 60000,
  });

  const markAllRead = async () => {
    await fetch("/api/notifications", { method: "PATCH" });
    queryClient.invalidateQueries({ queryKey: ["notifications"] });
  };

  const markOneRead = async (id: string) => {
    await fetch(`/api/notifications/${id}`, { method: "PATCH" });
    queryClient.invalidateQueries({ queryKey: ["notifications"] });
  };

  const smtpConnected = smtpStatus === "connected";
  const aiConnected = aiStatus === "connected";

  return (
    <TooltipProvider delayDuration={200}>
      <header className="sticky top-0 z-40 flex h-16 shrink-0 items-center gap-4 border-b bg-background px-6">
        {/* Hamburger — mobile only */}
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden"
          onClick={toggleSidebar}
          aria-label="Toggle menu"
        >
          <Menu className="h-5 w-5" />
        </Button>

        {/* Title area */}
        <div className={cn("min-w-0 flex-1 overflow-hidden", hideTitleOnMobile && "hidden md:block")}>
          <div className="truncate text-[11px] text-muted-foreground">{crumbs}</div>
          <div className="truncate text-base font-semibold tracking-tight text-foreground">
            {title}
          </div>
        </div>


        {/* CTA slot */}
        {actions && <div className="shrink-0">{actions}</div>}

        {/* Notifications */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" className="relative" aria-label="Notifications">
              <Bell className="h-5 w-5" />
              {unreadCount > 0 && (
                <span className="absolute right-1 top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full border-2 border-background bg-destructive px-1 text-[9px] font-bold leading-none text-destructive-foreground">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80 p-0">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <span className="text-sm font-semibold">Notifications</span>
              {unreadCount > 0 && (
                <button
                  onClick={markAllRead}
                  className="text-xs font-medium text-primary hover:underline"
                >
                  Mark all read
                </button>
              )}
            </div>
            <ScrollArea className="max-h-96">
              {notifications.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  No notifications
                </div>
              ) : (
                <ul className="divide-y">
                  {notifications.map((n) => (
                    <li
                      key={n.id}
                      className={cn(
                        "flex cursor-pointer gap-3 px-4 py-3 transition-colors hover:bg-muted/60",
                        !n.read && "bg-muted/40"
                      )}
                      onClick={() => !n.read && markOneRead(n.id)}
                    >
                      <NotifIcon tone={getNotifTone(n.type)} notifType={n.type} />
                      <div className="min-w-0 flex-1">
                        <div
                          className={cn(
                            "text-[13px] leading-snug text-foreground",
                            !n.read ? "font-semibold" : "font-normal"
                          )}
                        >
                          {n.title}
                        </div>
                        <div className="mt-0.5 text-xs text-muted-foreground">
                          {n.body}
                        </div>
                        <div className="mt-1 text-[10.5px] text-muted-foreground/80">
                          {formatDateTime(n.createdAt)}
                        </div>
                      </div>
                      {!n.read && (
                        <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </ScrollArea>
            <div className="border-t bg-muted/40 px-4 py-2 text-center">
              <Link href="/notifications" className="text-xs font-medium text-primary hover:underline">
                View all notifications
              </Link>
            </div>
          </PopoverContent>
        </Popover>

        {/* Profile */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              aria-label="Account menu"
            >
              <Avatar className="h-9 w-9">
                <AvatarFallback>{initials}</AvatarFallback>
              </Avatar>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="normal-case">
              <div className="text-sm font-semibold text-foreground">
                {session?.user?.name || "User"}
              </div>
              <div className="mt-0.5 text-xs font-normal text-muted-foreground">
                {session?.user?.email || ""}
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/settings" className="cursor-pointer">
                <Settings className="h-4 w-4 text-muted-foreground" />
                Settings
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="cursor-pointer text-destructive focus:bg-destructive/10 focus:text-destructive"
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>
    </TooltipProvider>
  );
}

function StatusPill({
  label,
  connected,
  href,
}: {
  label: string;
  connected: boolean;
  href: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link href={href}>
          <Badge
            variant={connected ? "success" : "neutral"}
            className="cursor-pointer gap-1.5 py-1 hover:opacity-80"
          >
            <span
              className={cn(
                "inline-block h-1.5 w-1.5 rounded-full",
                connected ? "bg-emerald-600" : "bg-muted-foreground"
              )}
            />
            {label}
          </Badge>
        </Link>
      </TooltipTrigger>
      <TooltipContent>
        {label} {connected ? "connected" : "disconnected"} — click to configure
      </TooltipContent>
    </Tooltip>
  );
}

function NotifIcon({ tone, notifType }: { tone: "success" | "destructive" | "info" | "neutral"; notifType: string }) {
  const Icon =
    tone === "success" ? CheckCircle2 :
    tone === "destructive" ? XCircle :
    tone === "info" ? Sparkles :
    notifType.includes("import") || notifType.includes("upload") ? Info :
    Bell;

  return (
    <div
      className={cn(
        "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
        tone === "success" && "bg-emerald-100 text-emerald-700",
        tone === "destructive" && "bg-destructive/10 text-destructive",
        tone === "info" && "bg-blue-100 text-blue-700",
        tone === "neutral" && "bg-muted text-muted-foreground"
      )}
    >
      <Icon className="h-3.5 w-3.5" />
    </div>
  );
}
