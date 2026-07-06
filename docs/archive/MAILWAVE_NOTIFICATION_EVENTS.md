# MailWave Notification Events

## Event taxonomy

Notifications are stored in the `Notification` model with a `type` field. In-app notifications appear in the TopBar bell popover.

| Event Type | Title | When fired |
|---|---|---|
| `campaign.generation_complete` | "Generation complete" | Campaign emails have all been generated |
| `campaign.generation_failed` | "Generation failed" | Campaign generation job failed |
| `campaign.sending_complete` | "Campaign sent" | All approved emails have been sent |
| `campaign.sending_failed` | "Campaign failed" | SMTP error prevents campaign from sending |
| `campaign.paused_rate_limit` | "Campaign paused" | Daily/hourly rate limit reached during send |
| `import.complete` | "Import complete" | CSV import saved to contacts |
| `smtp.connection_failed` | "SMTP disconnected" | SMTP test fails |
| `ai.connection_failed` | "AI disconnected" | AI test fails |

## Notification schema

```prisma
model Notification {
  id         String   // CUID
  userId     String   // owner
  type       String   // event type from table above
  title      String   // short display title
  body       String   // longer explanation
  entityType String?  // "campaign" | "import" | etc.
  entityId   String?  // ID of the related entity
  read       Boolean  // false until user reads it
  createdAt  DateTime
}
```

## Notification preferences

Users can configure per-event preferences in `NotificationPreference`:
- `inApp` (default: true) — show in TopBar popover
- `email` (default: false) — send to user's email address

Email delivery is not yet implemented; the preference flag is stored for future use.

## Creating notifications (in workers)

```ts
await prisma.notification.create({
  data: {
    userId,
    type: "campaign.generation_complete",
    title: "Generation complete",
    body: `${successCount} emails generated for campaign "${campaign.name}".`,
    entityType: "campaign",
    entityId: campaign.id,
  },
});
```

## Reading notifications (in UI)

`GET /api/notifications` returns the last 50 notifications and `unreadCount`. The TopBar polls this every 30 seconds and shows a badge when `unreadCount > 0`.

`PATCH /api/notifications` marks all notifications read.
`PATCH /api/notifications/[id]` marks one notification read.
