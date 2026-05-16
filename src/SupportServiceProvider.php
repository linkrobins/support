<?php

namespace LinkRobins\Support;

use Carbon\Carbon;
use Flarum\Foundation\AbstractServiceProvider;
use Flarum\Formatter\Formatter;
use Flarum\Group\Group;
use Flarum\Notification\NotificationSyncer;
use Flarum\User\User;
use LinkRobins\Support\Notification\NewSupportReplyBlueprint;
use LinkRobins\Support\Notification\NewSupportTicketBlueprint;

class SupportServiceProvider extends AbstractServiceProvider
{
    public function boot(Formatter $formatter): void
    {
        // Plug Flarum's formatter into the reply model so calling
        // setContentAttribute() runs Markdown/BBCode through the same
        // pipeline discussions use. The parsed source ends up in
        // `content`; rendered HTML is produced on demand via
        // formatContent() at serialize time (no content_html column).
        SupportReply::setFormatter($formatter);

        // Bump the parent ticket's last_reply_at whenever a reply is
        // created, advance status per the rules below, and dispatch a
        // notification to the appropriate party.
        //
        // Status rules:
        //   - If a staff member replies to an `open` ticket, mark it
        //     `in_progress`.
        //   - If the creator replies to an `awaiting_user` ticket, flip
        //     it back to `in_progress` (creator answered the question).
        //   - If anyone replies to a `resolved` ticket, reopen it to
        //     `in_progress`. Closed tickets reject replies at the policy
        //     level, so we never see them here.
        SupportReply::created(function (SupportReply $reply) {
            try {
                $ticket = $reply->ticket;
                if (! $ticket) {
                    return;
                }
                $ticket->last_reply_at = Carbon::now();

                $isStaff = static::actorIsStaff($reply->user);

                if (! $reply->is_internal_note) {
                    if ($ticket->status === SupportTicket::STATUS_RESOLVED) {
                        $ticket->status = SupportTicket::STATUS_IN_PROGRESS;
                    } elseif ($isStaff && $ticket->status === SupportTicket::STATUS_OPEN) {
                        $ticket->status = SupportTicket::STATUS_IN_PROGRESS;
                    } elseif (! $isStaff && $ticket->status === SupportTicket::STATUS_AWAITING_USER) {
                        $ticket->status = SupportTicket::STATUS_IN_PROGRESS;
                    }
                }

                // Auto-claim the ticket when a staff member replies on a
                // currently-unassigned ticket. The replier becomes the
                // assignee. We deliberately do NOT override an existing
                // assignment -- if Alice is handling the ticket and Bob
                // chimes in with a single reply, the ticket stays Alice's.
                // That handles the "second pair of eyes" case where one
                // staff member is the owner and another pitches in for one
                // comment without taking it over.
                //
                // Internal notes also trigger auto-claim, on the theory
                // that if you're posting an internal note about a
                // currently-unowned ticket, you're effectively picking it
                // up. (The status-bump logic above intentionally skips
                // internal notes, but assignment is independent of status:
                // the status reflects the user-visible state of the
                // conversation, while assignment is staff routing.)
                if ($isStaff && $reply->user_id && ! $ticket->assigned_staff_id) {
                    $ticket->assigned_staff_id = $reply->user_id;
                }

                $ticket->save();

                // Notifications: dispatched only for user-facing replies.
                // Internal notes are staff coordination -- the ticket
                // owner shouldn't see they exist.
                if (! $reply->is_internal_note) {
                    static::dispatchReplyNotification($reply, $ticket, $isStaff);
                }
            } catch (\Throwable $e) {
                error_log('[linkrobins/support] reply post-save hook failed: ' . $e->getMessage());
            }
        });

        // When a ticket is opened, notify staff so they can pick it up.
        // The actor themselves is excluded so a staff member filing a
        // ticket doesn't get notified about their own ticket.
        SupportTicket::created(function (SupportTicket $ticket) {
            try {
                static::dispatchTicketNotification($ticket);
            } catch (\Throwable $e) {
                error_log('[linkrobins/support] ticket post-save hook failed: ' . $e->getMessage());
            }
        });
    }

    /**
     * Send a new-reply notification.
     *
     *   - Staff replies on a user-owned ticket  → notify the owner only
     *   - User replies on their own ticket      → notify all staff
     *   - Edge case: staff reply on a ticket they themselves opened
     *     (admin testing) → notify other staff, not themselves
     */
    protected static function dispatchReplyNotification(SupportReply $reply, SupportTicket $ticket, bool $authorIsStaff): void
    {
        $syncer = static::tryResolveSyncer();
        if (! $syncer) {
            return;
        }
        $blueprint = new NewSupportReplyBlueprint($reply);

        if (! $authorIsStaff) {
            // Owner replied. Notify staff (minus the owner if they
            // somehow also count as staff -- defense in depth).
            $recipients = static::staffRecipients(exceptId: $reply->user_id);
        } elseif ($ticket->user) {
            // Staff replied. Notify the ticket owner unless the
            // owner *is* the replying staff member.
            if ((int) $ticket->user_id === (int) $reply->user_id) {
                $recipients = static::staffRecipients(exceptId: $reply->user_id);
            } else {
                $recipients = [$ticket->user];
            }
        } else {
            // No owner (deleted user) -- notify staff.
            $recipients = static::staffRecipients(exceptId: $reply->user_id);
        }

        if (! empty($recipients)) {
            static::trySyncNotification($syncer, $blueprint, $recipients, 'reply');
        }
    }

    /**
     * Send a new-ticket notification to all staff. The submitter is
     * excluded -- a staff member filing a ticket doesn't need to be
     * notified about it.
     */
    protected static function dispatchTicketNotification(SupportTicket $ticket): void
    {
        $syncer = static::tryResolveSyncer();
        if (! $syncer) {
            return;
        }
        $recipients = static::staffRecipients(exceptId: $ticket->user_id);
        if (empty($recipients)) {
            return;
        }
        static::trySyncNotification($syncer, new NewSupportTicketBlueprint($ticket), $recipients, 'ticket');
    }

    /**
     * Run the syncer with isolated error handling so an email-send
     * failure (broken mailer, full disk, transient SMTP issue) doesn't
     * bubble up and pollute the data-save logs.
     *
     * `NotificationSyncer::sync()` writes alert rows BEFORE attempting
     * to send emails -- if the email send fails partway through, the
     * alerts have already landed and the user will still see them in
     * the bell-icon dropdown. The right log message is "email failed",
     * not "notification failed" (which would imply the alerts didn't
     * make it either).
     */
    protected static function trySyncNotification(NotificationSyncer $syncer, $blueprint, array $recipients, string $kind): void
    {
        try {
            $syncer->sync($blueprint, $recipients);
        } catch (\Throwable $e) {
            // Distinguish mailer failures from genuine sync bugs. A
            // mailer error from Symfony Mailer / Swift / Laravel mail
            // typically contains "sendmail", "SMTP", "stream", or
            // "Connection". Anything else we log as a real bug so it
            // gets surfaced.
            $msg = $e->getMessage();
            $isMailerError = (
                stripos($msg, 'sendmail') !== false
                || stripos($msg, 'smtp')   !== false
                || stripos($msg, 'mailer') !== false
                || stripos($msg, 'mail server') !== false
            );
            if ($isMailerError) {
                error_log('[linkrobins/support] alert ' . $kind . ' notification stored OK, but email send failed: ' . $msg);
            } else {
                error_log('[linkrobins/support] ' . $kind . ' notification sync failed: ' . $msg);
            }
        }
    }

    /**
     * Resolve NotificationSyncer from the container.
     *
     * Wrapped in try/catch because container is only available at
     * runtime, not during e.g. migrations or some test contexts. A
     * failure here is non-fatal -- the data is still saved, just
     * without notifications.
     */
    protected static function tryResolveSyncer(): ?NotificationSyncer
    {
        try {
            return resolve(NotificationSyncer::class);
        } catch (\Throwable $e) {
            error_log('[linkrobins/support] could not resolve NotificationSyncer: ' . $e->getMessage());
            return null;
        }
    }

    /**
     * Build the list of staff users who should receive notifications.
     *
     * "Staff" = admin group (id=1) members + users with the
     * `linkrobins-support.handle_tickets` permission.
     *
     * @param int|null $exceptId Optional user id to exclude (typically the actor).
     * @return User[]
     */
    protected static function staffRecipients(?int $exceptId = null): array
    {
        try {
            // Users who are either admins or hold the
            // `linkrobins-support.handle_tickets` permission via any
            // of their groups.
            $permGroups = function ($q) {
                $q->whereIn('groups.id', function ($sub) {
                    $sub->select('group_id')
                        ->from('group_permission')
                        ->where('permission', 'linkrobins-support.handle_tickets');
                });
            };

            $query = User::query()
                ->where(function ($q) use ($permGroups) {
                    $q->whereHas('groups', function ($q) {
                        $q->where('groups.id', Group::ADMINISTRATOR_ID);
                    })->orWhereHas('groups', $permGroups);
                });

            if ($exceptId !== null) {
                $query->where('id', '!=', $exceptId);
            }

            return $query->distinct()->get()->all();
        } catch (\Throwable $e) {
            error_log('[linkrobins/support] staffRecipients failed: ' . $e->getMessage());
            return [];
        }
    }

    /**
     * Lightweight staff check used during the post-save hook where we
     * don't want to drag in the full policy machinery. Mirrors the
     * isStaff() helper in SupportTicketPolicy.
     */
    protected static function actorIsStaff(?User $user): bool
    {
        if (! $user) {
            return false;
        }
        if ($user->isAdmin()) {
            return true;
        }
        return $user->hasPermission('linkrobins-support.handle_tickets');
    }
}
