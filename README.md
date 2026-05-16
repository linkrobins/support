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
  can see.
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
- **Assignment.** Staff can claim or unassign tickets. The assigned
  staff member shows in the staff control bar.
- **Notifications.** In-app and email. The ticket owner is notified
  when staff replies; staff are notified when a new ticket is opened
  or when the owner replies. Internal notes never produce
  notifications. Users can toggle these per driver in their
  notification preferences.
- **Decisions on appeals.** Resolved appeal tickets record a
  `decision` field (approved / rejected / null).
- **File attachments.** Optional integration with `fof/upload`. When
  installed, the compose and reply forms surface an "Attach files"
  button that uploads through `fof/upload`'s normal pipeline. No
  configuration here; the button respects whatever `fof/upload`
  permissions you've set.

## Requirements

- Flarum 2.0.0+
- PHP 8.2+

## Installation

```bash
composer require linkrobins/support
php flarum migrate
php flarum cache:clear
```

Then enable the extension in admin → Extensions.

## Permissions

The extension adds one permission:

- `linkrobins-support.handle_tickets` (default: moderate group) -- grants
  the ability to see all tickets, reply on any ticket, post internal
  notes, change ticket status, set decisions, and claim tickets.

Anyone in the admin group bypasses this check.

Filing tickets requires being authenticated; the policy doesn't add
a separate permission for it.

## Admin UI

Settings live at admin → Extensions → Link Robins Support, with three
tabs:

- **Categories.** CRUD for ticket categories.
- **Rate limits.** Configurable values for the appeal and general
  limits described above.
- **Appeal bans.** Search users and toggle their permanent appeal-ban
  flag.

## Forum UI

Users see:

- `/support` -- their tickets list, with filter chips for status.
- `/support/new` -- compose form. Banned-from-appeals users see only
  general categories; suspended users see only appeal categories.
- `/support/:id` -- the ticket page, with reply form and reply thread.

Staff additionally see:

- The "All" filter on the index, with status chips for cross-cutting
  views (open, in_progress, awaiting_user, resolved, closed).
- The staff control bar on each ticket: set status, claim/unassign, post
  internal notes via the reply form's "Internal note" toggle.

## Data model

Three tables:

- `linkrobins_support_categories` -- name, slug, description, color,
  icon, position, is_appeal.
- `linkrobins_support_tickets` -- category_id, user_id,
  assigned_staff_id, subject, status, decision, last_reply_at.
- `linkrobins_support_replies` -- ticket_id, user_id, content
  (parsed-source XML), is_internal_note.

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

## API summary

| Endpoint | Method | Auth |
|---|---|---|
| `/api/linkrobins-support-categories` | GET | public |
| `/api/linkrobins-support-categories` | POST | admin |
| `/api/linkrobins-support-categories/:id` | PATCH/DELETE | admin |
| `/api/linkrobins-support-tickets` | GET | authenticated |
| `/api/linkrobins-support-tickets` | POST | authenticated |
| `/api/linkrobins-support-tickets/:id` | GET/PATCH/DELETE | per-policy |
| `/api/linkrobins-support-replies` | GET | authenticated |
| `/api/linkrobins-support-replies` | POST | authenticated |

Supported filters (use `filter[name]=value` shape; Flarum 2 rejects
unrecognized top-level params):

- On tickets: `filter[mine]=1`, `filter[status]=open`,
  `filter[categoryId]=N`
- On replies: `filter[ticketId]=N`

## License

MIT.
