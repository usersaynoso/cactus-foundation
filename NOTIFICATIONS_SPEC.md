# Core Per-User Notifications - Specification

Status: **DRAFT - Chris's review required before any implementation.**
This touches the core Prisma schema (init-migration edit) and member-facing
core UI, both protected categories. Nothing in this document is authorised to
build yet.

Companion to `BOARDS_SPEC.md` (section 5.7 and Protected Item 1): Boards is
the first consumer, but the design must be module-agnostic - core knows
nothing about any specific module's notification types.

---

## 1. What exists today

- `Notification` model in `prisma/schema.prisma`: `id`, `type`
  (`NotificationType` enum: deployment | core_update | module_update |
  message), `title`, `reasons` Json?, `link`, `dedupeKey`, `readAt`,
  `deployInitiatedAt`, timestamps. **No `userId`** - every row is global.
- `components/admin/NotificationBell.tsx` - bell in the admin shell, unread
  count badge.
- `/cactus-admin/notifications` - list page, gated on `config.manage`
  (admin-only).
- `lib/notifications/alerts.ts` - dedupe-keyed writer for on-demand alerts
  (core-update, module-update, contact-form messages).

These are operational alerts for site operators. They stay exactly as they
are.

## 2. What this adds

Per-user notifications: "someone replied to your thread", visible to the
individual member, with read/unread state, optional email delivery, and
digest batching. Written by modules through one shared helper.

## 3. Design

### 3.1 New table, not a rework

Add a separate `UserNotification` model rather than retrofitting `userId`
onto `Notification`. Rationale: the existing table's semantics (global,
dedupe-keyed, deploy-lifecycle columns) do not fit per-user fan-out, and the
admin bell/page keep working untouched.

```prisma
model UserNotification {
  id        String    @id @default(cuid())
  userId    String
  user      User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  // Namespaced by the writing module, e.g. "boards:reply". Core never
  // interprets it beyond display grouping.
  kind      String
  title     String
  // Site-relative link target
  link      String?
  // Optional idempotency handle, unique per user when present
  dedupeKey String?
  readAt    DateTime?
  createdAt DateTime  @default(now())

  @@unique([userId, dedupeKey])
  @@index([userId, readAt])
  @@index([userId, createdAt(sort: Desc)])
}
```

Plus per-user delivery preferences (core-level, so every module shares one
setting rather than inventing its own):

```prisma
model UserNotificationPrefs {
  userId       String   @id
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  // IMMEDIATE | DIGEST | OFF
  mode         String   @default("IMMEDIATE")
  emailEnabled Boolean  @default(true)
  lastDigestAt DateTime?
  updatedAt    DateTime @updatedAt
}
```

Schema change = edit the single core init migration
(`prisma/migrations/20260626000000_init/migration.sql`) in place **and**
apply the same idempotent DDL to the test DB via Neon, per standing rules.

Open question for review: with core-level prefs in place,
`brd_notification_prefs` in BOARDS_SPEC becomes redundant and should be
dropped from the Boards schema at implementation time - flagging rather than
silently diverging the two documents.

### 3.2 Shared write interface

New `lib/notifications/user.ts` (sibling of `alerts.ts`):

```ts
export async function notifyUsers(input: {
  userIds: string[]
  kind: string          // "boards:reply" - module-namespaced
  title: string
  link?: string
  dedupeKey?: string
}): Promise<void>
```

Behaviour: for each user, read prefs (default row semantics when absent);
`OFF` → skip; otherwise insert the `UserNotification` row (dedupe via the
unique constraint, insert-ignore); `IMMEDIATE` + `emailEnabled` → send one
email via `sendEmail` from `lib/email/index.ts` (fire-and-forget, failures
logged not thrown); `DIGEST` → row only, cron picks it up. Never throws into
the caller's request path.

Modules import it directly (`@/lib/notifications/user`) - same pattern as
every other core service modules reuse (`sendEmail`, `verifyTurnstile`,
media). No registration, no manifest field.

### 3.3 Bell UI

- Members-facing bell in the core shell for any logged-in user, showing the
  `UserNotification` unread count; the existing admin bell remains separate
  and admin-only. Where the member bell lives (public header vs a member
  area) is an open review point - the platform currently has no
  member-facing chrome, which is the main reason this document is a draft.
- Notification list (paginated), mark-read on click, mark-all-read, delete.
- Preferences screen: mode (immediate / daily digest / off) + email toggle.

### 3.4 API routes (core)

| Method + path | Auth | Purpose |
|---|---|---|
| GET `/api/notifications` | session | own notifications, paginated, unread count |
| POST `/api/notifications/read` | session | body `{ids}` or `{all: true}` |
| DELETE `/api/notifications/[id]` | session | own row only |
| GET/PATCH `/api/notifications/prefs` | session | own prefs |

### 3.5 Digest cron

Core cron `POST /api/cron/notifications-digest`, daily, `Bearer $CRON_SECRET`.
Selects users with `mode = 'DIGEST'`, `emailEnabled`, and unread rows created
since `lastDigestAt`; sends one summary email each (grouped by `kind`
namespace); advances `lastDigestAt`. Note: core cron entries live in the
committed `vercel.json` template alongside generated module entries - the
cron generator must merge, verify `scripts/generate-module-cron.mjs`
behaviour before adding.

### 3.6 GDPR

`onDelete: Cascade` on both models removes everything with the user. Rows
also join the core account JSON export.

## 4. Explicitly out of scope

Boards-specific trigger logic (who gets notified when - that is
`BOARDS_SPEC.md` 5.7), push/web-push, real-time delivery, admin broadcast
messages.

## 5. Review checklist for Chris

1. New tables vs `userId` on existing `Notification` - spec says new tables.
2. Member bell placement given no member-facing core chrome exists yet.
3. Core-level prefs supersede `brd_notification_prefs` - drop the Boards
   table?
4. Digest as core cron (adds a committed vercel.json entry) - acceptable?
