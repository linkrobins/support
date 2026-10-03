# Link Robins Support

A private support-desk extension for Flarum 2. Lets registered users open
support tickets with staff, with an emphasis on workflows that keep
forum-wide moderation actions (suspensions, bans) honest.

## Features

- **Private tickets.** Tickets are NOT Flarum discussions. A user's
  ticket is visible only to that user and to staff. Other users never
  see it, even if they know the URL.
- **Categories.** Admin-configurable, each with name, slug, color, icon,
  position, and an `is_appeal` flag.
- **Appeal flow.** Categories marked as appeals follow stricter rate
  limits and are filable by suspended users so they can plead their
  case. General categories are blocked for suspended users so a ban
  isn't trivially worked around.
- **Internal notes.** Staff can add replies marked as internal. These
  are filtered out at the database level for non-staff users -- the
  ticket owner doesn't see them in their list, can't fetch them
  directly, and the replyCount on the ticket reflects only what they
  can see. Visually, internal notes get a subtle background tint on
  the reply card for staff.
- **Reply moderation.** Staff can edit, soft-delete, restore, and
  permanently delete any reply via a `⋯` menu in the reply header.
  Edits stamp `edited_at` and `edited_by_user_id` so other staff can
  see the audit info; permanent deletion requires the reply to be
  soft-deleted first (no accidental single-click destruction).
- **Ticket moderation.** Staff can soft-delete tickets via a `⋯`
  menu in the ticket title row. Soft-deleted tickets are hidden from
  the index for both the owner and staff but remain reachable via
  direct URL for staff to restore. Permanent deletion is admin-only
  and cascades to all replies.
- **Rate limits.** Per-user, configurable. Defaults:
  - 3 appeals per 30 days
  - 1 concurrent open appeal at a time
  - 10 general tickets per 24 hours
- **Permanent appeal-ban.** A per-user flag (`support_appeal_banned`)
  that blocks appeals while leaving general tickets available. Toggled
  from the admin's "Appeal bans" tab.
- **Status workflow.** open → in_progress → awaiting_user → resolved
  → closed. Auto-advances based on who replies (staff to open ⇒
  in_progress; user to awaiting_user ⇒ in_progress). Closed tickets
  reject replies.
- **"Did this solve your problem?"** When staff mark a ticket resolved,
  the person who opened it can confirm it and close it straight away, or
  say they still need help, which opens the reply box. Staff are told
  when an owner confirms a ticket solved.
- **Assignment.** Staff assign a ticket to anyone on the support team
  (themselves included) or unassign it, from "Assign..." in the ticket's
  menu. The assigned staff member shows in the ticket header and on each
  row of the staff ticket list, so nobody has to open a ticket to see
  who has it.
- **Staff queues.** "Assigned to me" and "Unassigned" views list the
  open tickets waiting on you and the ones nobody has picked up yet.
  "My tickets" is still the tickets you opened yourself.
- **Ticket history.** Every status and assignment change appears in the
  ticket between the replies, with who made it and when: "Karl changed
  the status from Open to Resolved". Staff see all of it; the person who
  opened the ticket sees status changes but not internal assignment.
- **Automatic closing.** Tickets left Resolved with no further activity
  close themselves after 7 days (configurable, or off). A reply from
  either side reopens a resolved ticket first, so this only closes
  tickets nobody came back to. Nobody is notified, the history shows it
  was closed automatically, and the owner can still reopen it. Needs the
  Flarum scheduler (`php flarum schedule:run` in cron).
- **Reminders.** When a ticket has waited on its owner (Awaiting
  response) for 3 days with no activity, they get one reminder by
  notification and email (configurable, or off). Once per wait. Also
  needs the Flarum scheduler.
- **Search.** A search box beside the list title finds tickets by
  subject, by the text of a reply, or by ticket number, as you type.
  Members search only their own tickets and never match the text of a
  staff internal note.
- **Unread markers.** Tickets with a reply you have not seen yet show a
  dot and a bold subject, the way Flarum marks unread discussions.
  Opening the ticket clears it. Internal notes never mark a member's
  ticket unread.
- **Sidebar counts.** Staff see how much open work sits in each queue
  and status view ("Unassigned 7"); everyone sees how many of their own
  tickets have an unread reply.
- **Priority.** Staff can mark a ticket urgent or low priority from its
  menu. Urgent tickets carry a red chip and come first in every staff
  list. Members never see priority.
- **Saved replies.** Admins keep a library of common answers; staff
  insert one into a reply from the composer and edit it before sending.
  Members never see the list.
- **Support stats.** Staff can open a stats view from the support
  sidebar or their account menu: tickets opened and closed, typical
  first-response and resolution times with the slowest tenth, opened
  versus closed over time, the current backlog, how resolved tickets
  were closed, and a breakdown per staff member, over 7, 30 or 90 days.
- **Live updates.** With the bundled `flarum/realtime` extension
  enabled, new replies and status changes appear on an open ticket, and
  new tickets in the staff lists, without reloading. Each person only
  ever receives what they could already see: never another member's
  ticket, never an internal note.
- **Notifications.** In-app and email. The ticket owner is notified
  when staff replies or changes the ticket's status; staff are notified
  when a new ticket is opened, when the owner replies, reopens a ticket
  or confirms it solved, and when a ticket is assigned to them. A
  category can route its new tickets to one staff member. Internal notes
  never produce notifications. Users can toggle each of these per driver
  in their notification preferences.
- **Decisions on appeals.** Resolved appeal tickets record a
  `decision` field (approved / rejected / null).
- **File attachments.** Optional integration with `fof/upload`. When
  installed, the compose and reply forms surface an "Attach files"
  button that uploads through `fof/upload`'s normal pipeline. No
  configuration here; the button respects whatever `fof/upload`
  permissions you've set.

## Requirements

- Flarum 2.0.0+
- PHP 8.3+

## Installation

```bash
composer require linkrobins/support
php flarum migrate
php flarum cache:clear
```

Then enable the extension in admin → Extensions.

## Permissions

The extension adds one permission:

- `lr-support.handle_tickets` (default: moderate group) -- grants
  the ability to see all tickets, reply on any ticket, post internal
  notes, change ticket status, set decisions, and claim tickets.

Anyone in the admin group bypasses this check.

Filing tickets requires being authenticated; the policy doesn't add
a separate permission for it.

## Admin UI

Settings live at admin → Extensions → LR Support, in these sections:

- **Categories.** CRUD for ticket categories, including an optional
  staff member who receives each category's new tickets.
- **Saved replies.** The answers staff can insert into a reply: a title,
  the text, and an optional position.
- **Navigation.** Whether the Support link appears in the forum sidebar
  and the account menu, and whether support pages also show the forum's
  own navigation.
- **Reminders and automatic closing.** How many days a resolved ticket
  may sit with no activity before it closes, and how many days a ticket
  may wait on its owner before they are reminded. 0 turns either off.
- **Rate limits.** Configurable values for the appeal and general
  limits described above.
- **Appeal bans.** Search users and toggle their permanent appeal-ban
  flag.

## Forum UI

Users see:

- `/support` -- their tickets list, with a search box and unread
  markers.
- `/support/new` -- compose form. Banned-from-appeals users see only
  general categories; suspended users see only appeal categories.
- `/support/:id` -- the ticket page, with reply form and reply thread.

Staff additionally see:

- The "Assigned to me" and "Unassigned" queues, and the "All" filter
  with status views (open, in_progress, awaiting_user, resolved,
  closed).
- On each ticket: the status pill is a dropdown for changing status (and
  the appeal decision works the same way), the ticket's menu holds
  "Assign..." (the team picker) and the priority options, and the reply
  form has the "Internal note" toggle and the saved replies menu.
- "Support stats" in the sidebar and the account menu.

## Data model

Seven tables:

- `linkrobins_support_categories` -- name, slug, description, color,
  icon, position, is_appeal.
- `linkrobins_support_tickets` -- category_id, user_id,
  assigned_staff_id, subject, status, decision, priority,
  last_reply_at, status_changed_at, reminded_at, deleted_at.
- `linkrobins_support_replies` -- ticket_id, user_id, content
  (parsed-source XML), is_internal_note, deleted_at, edited_at,
  edited_by_user_id.
- `linkrobins_support_events` -- the ticket history: ticket_id,
  user_id (who made the change; null for automatic changes), type
  (`status` or `assignment`), from/to status, from/to assignee.
- `linkrobins_support_reads` -- when each person last opened each
  ticket, for the unread markers.
- `linkrobins_support_saved_replies` -- title, content (raw Markdown or
  BBCode), position.

One column added to the existing `users` table:

- `support_appeal_banned` (boolean, default 0).

Replies use Flarum's content formatter via the `HasFormattedContent`
trait. The rendered HTML is computed at serialize time via
`formatContent()`, NOT cached in a `content_html` column -- this means
formatter extensions like mentions and emoji apply to older replies the
moment they're installed.

## File attachments (fof/upload integration)

If [fof/upload](https://packagist.org/packages/fof/upload) is installed
and enabled, the compose form and reply form get an "Attach files"
button. Uploaded files are stored, validated, and rendered by
`fof/upload`; this extension only inserts the resulting BBCode marker
into the message body. No additional configuration is needed -- if
the user has permission to upload via `fof/upload`, the button
appears.

### Privacy caveat

`fof/upload`'s download URLs act as capabilities: anyone who has the
URL to a file can download it. CSRF protection limits direct
hot-linking, but if a staff member copies a file URL out of a ticket
and shares it elsewhere, that link works for anyone who clicks it.

This is identical to how `fof/upload` behaves on regular discussions,
so it isn't unique to this extension. If you need a hard guarantee
that ticket attachments can be read only by ticket-eligible users,
`fof/upload` would need to be patched to gate downloads against
per-resource policies. That's out of scope for v1.

In practice, for the support-desk use case, the risk is small:
attachments tend to be screenshots and logs from the ticket-opener
themselves, who is also the only non-staff party with the URL.

## Security notes

- The `creating()` hooks on both tickets and replies overwrite
  `user_id` with the authenticated actor's id. Even if the client
  sends `relationships.user`, JSON:API rejects it because the field
  isn't declared writable, AND the hook would overwrite it anyway.
- Visibility is enforced in two places that must stay in sync: the
  resource's `scope()` (for single-resource Show endpoints) and the
  Searcher's `getQuery()` (for list Index endpoints). Both use the
  same rules.
- Internal notes are filtered at the database level (a WHERE clause
  on `is_internal_note`), not at render time. A non-staff user
  hitting the API directly cannot bypass the filter.
- The "Update" endpoint is gated by `->can('update')`, which routes
  to `SupportTicketPolicy::update`. Field setters add a second layer
  of defense: even if the gate ever loosened, status / decision /
  assignment changes wouldn't take effect for a non-staff actor.
- Soft-deleted rows are hidden from non-staff at the DB query level
  (Eloquent's default SoftDeletes scope). Staff see them via
  `withTrashed()` in the resource scope, but Index/Searcher
  queries deliberately stay on the active set so the staff index
  isn't cluttered. Force-delete on a live (non-trashed) row is
  rejected by the `deleting()` hook -- a soft-delete must come
  first.

## API summary

| Endpoint | Method | Auth |
|---|---|---|
| `/api/linkrobins-support-categories` | GET | public |
| `/api/linkrobins-support-categories` | POST | admin |
| `/api/linkrobins-support-categories/:id` | PATCH/DELETE | admin |
| `/api/linkrobins-support-tickets` | GET | authenticated |
| `/api/linkrobins-support-tickets` | POST | authenticated |
| `/api/linkrobins-support-tickets/:id` | GET | per-policy |
| `/api/linkrobins-support-tickets/:id` | PATCH | staff (handle_tickets) |
| `/api/linkrobins-support-tickets/:id` | DELETE | admin, soft-deleted only |
| `/api/linkrobins-support-replies` | GET | authenticated |
| `/api/linkrobins-support-replies` | POST | authenticated |
| `/api/linkrobins-support-replies/:id` | PATCH | staff (handle_tickets) |
| `/api/linkrobins-support-replies/:id` | DELETE | staff, soft-deleted only |
| `/api/linkrobins-support-events` | GET | authenticated (staff: all; owner: status changes on own tickets) |
| `/api/linkrobins-support-tickets/:id/read` | POST | anyone who can see the ticket |
| `/api/linkrobins-support-counts` | GET | authenticated (staff get the queue counts) |
| `/api/linkrobins-support-stats` | GET | staff (handle_tickets); `?days=7\|30\|90` |
| `/api/linkrobins-support-staff` | GET | staff (handle_tickets) |
| `/api/linkrobins-support-saved-replies` | GET | staff (handle_tickets) |
| `/api/linkrobins-support-saved-replies` | POST/PATCH/DELETE | admin |

Moderation patterns:

- PATCH a ticket or reply with `{ attributes: { content: "..." } }` to
  edit (replies only). Stamps `edited_at` + `edited_by_user_id`.
- PATCH with `{ attributes: { isDeleted: true } }` to soft-delete.
  PATCH with `{ isDeleted: false }` to restore.
- DELETE permanently removes -- but only if the row is already
  soft-deleted; otherwise returns 400.

Supported filters (use `filter[name]=value` shape; Flarum 2 rejects
unrecognized top-level params):

- On tickets: `filter[q]=...` (search), `filter[mine]=1`,
  `filter[status]=open`, `filter[categoryId]=N`, `filter[assigned]=me`
  or `filter[assigned]=none`
- On replies: `filter[ticketId]=N`
- On history: `filter[ticketId]=N`

## License

MIT.
