"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, CheckCircle2, XCircle, Sparkles, Info } from "lucide-react";
import { cn, formatDateTime } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

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

function getNotifTone(type: string): "success" | "destructive" | "info" | "neutral" {
  if (type.includes("fail") || type.includes("error")) return "destructive";
  if (type.includes("complete") || type.includes("success") || type.includes("ready")) return "success";
  if (type.includes("ai") || type.includes("generate")) return "info";
  return "neutral";
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
        "flex h-10 w-10 shrink-0 items-center justify-center rounded-full",
        tone === "success" && "bg-emerald-100 text-emerald-700",
        tone === "destructive" && "bg-destructive/10 text-destructive",
        tone === "info" && "bg-blue-100 text-blue-700",
        tone === "neutral" && "bg-muted text-muted-foreground"
      )}
    >
      <Icon className="h-4.5 w-4.5" />
    </div>
  );
}

export function NotificationsClient() {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["notifications-all"],
    queryFn: async () => {
      const res = await fetch("/api/notifications?take=200");
      if (!res.ok) return { notifications: [], unreadCount: 0 };
      return res.json() as Promise<{ notifications: Notification[]; unreadCount: number }>;
    },
  });

  const notifications = data?.notifications ?? [];
  const unreadCount = data?.unreadCount ?? 0;

  const markAllRead = async () => {
    await fetch("/api/notifications", { method: "PATCH" });
    queryClient.invalidateQueries({ queryKey: ["notifications-all"] });
    queryClient.invalidateQueries({ queryKey: ["notifications"] });
  };

  const markOneRead = async (id: string) => {
    await fetch(`/api/notifications/${id}`, { method: "PATCH" });
    queryClient.invalidateQueries({ queryKey: ["notifications-all"] });
    queryClient.invalidateQueries({ queryKey: ["notifications"] });
  };

  if (isLoading) {
    return (
      <div className="mx-auto max-w-2xl space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-20" />
        ))}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {notifications.length} notification{notifications.length !== 1 ? "s" : ""}
          {unreadCount > 0 && ` · ${unreadCount} unread`}
        </p>
        {unreadCount > 0 && (
          <Button variant="outline" size="sm" onClick={markAllRead}>
            Mark all read
          </Button>
        )}
      </div>

      {notifications.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-sm text-muted-foreground">
            No notifications yet.
          </CardContent>
        </Card>
      ) : (
        <Card className="divide-y overflow-hidden p-0">
          {notifications.map((n) => {
            const tone = getNotifTone(n.type);
            return (
              <div
                key={n.id}
                className={cn(
                  "flex cursor-pointer gap-4 px-5 py-4 transition-colors hover:bg-muted/60",
                  !n.read && "bg-muted/30"
                )}
                onClick={() => !n.read && markOneRead(n.id)}
              >
                <NotifIcon tone={tone} notifType={n.type} />
                <div className="min-w-0 flex-1">
                  <div
                    className={cn(
                      "text-sm leading-snug text-foreground",
                      !n.read ? "font-semibold" : "font-normal"
                    )}
                  >
                    {n.title}
                  </div>
                  <div className="mt-0.5 text-sm text-muted-foreground">{n.body}</div>
                  <div className="mt-1 text-xs text-muted-foreground/70">
                    {formatDateTime(n.createdAt)}
                  </div>
                </div>
                {!n.read && (
                  <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-primary" />
                )}
              </div>
            );
          })}
        </Card>
      )}
    </div>
  );
}
