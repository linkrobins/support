<?php

namespace LinkRobins\Support;

use Flarum\Group\Group;
use Flarum\Notification\NotificationSyncer;
use Flarum\User\User;
use LinkRobins\Support\Access\SupportAbilities;
use LinkRobins\Support\Notification\NewSupportReplyBlueprint;
use LinkRobins\Support\Notification\NewSupportTicketBlueprint;
use Psr\Log\LoggerInterface;

/**
 * Builds recipient lists and sends support notifications.
 *
 * Instance-based with its dependencies injected (no static methods, no
 * resolve()). Invoked from queued jobs (NotifyNewReply / NotifyNewTicket)
 * so the staff lookup never runs synchronously on the request that saved
 * the ticket or reply.
 */
class SupportNotifier
{
    public function __construct(
        protected NotificationSyncer $syncer,
        protected LoggerInterface $log,
    ) {
    }

    /**
     * New-reply notification (user-facing replies only):
     *   - staff reply on a user's ticket  → notify the owner
     *   - user reply on their own ticket   → notify all staff
     *   - staff reply on their own ticket  → notify other staff (admin testing)
     */
    public function notifyNewReply(SupportReply $reply): void
    {
        $ticket = $reply->ticket;
        if (! $ticket || $reply->is_internal_note) {
            return;
        }

        $authorIsStaff = $this->isStaff($reply->user);

        if (! $authorIsStaff) {
            $recipients = $this->staffRecipients($reply->user_id);
        } elseif ($ticket->user) {
            $recipients = ((int) $ticket->user_id === (int) $reply->user_id)
                ? $this->staffRecipients($reply->user_id)
                : [$ticket->user];
        } else {
            $recipients = $this->staffRecipients($reply->user_id);
        }

        if (! empty($recipients)) {
            $this->trySync(new NewSupportReplyBlueprint($reply), $recipients, 'reply');
        }
    }

    /**
     * New-ticket notification. The radius depends on whether the ticket
     * arrived with an assignee:
     *
     *   - auto-assigned (the category has a default assignee) → only that
     *     person hears about it. That is the point of routing a category to
     *     someone: the rest of the staff should not have to read past it.
     *   - unassigned → every staff member, so somebody picks it up.
     *
     * The submitter is excluded either way, so a staff member filing their
     * own ticket is not notified about it. When the assignee *is* the
     * submitter that leaves nobody, which is correct -- the one person who
     * would be told already knows, they wrote it.
     */
    public function notifyNewTicket(SupportTicket $ticket): void
    {
        $recipients = $this->newTicketRecipients($ticket);

        if (! empty($recipients)) {
            $this->trySync(new NewSupportTicketBlueprint($ticket), $recipients, 'ticket');
        }
    }

    /**
     * @return list<User>
     */
    protected function newTicketRecipients(SupportTicket $ticket): array
    {
        $assignee = $ticket->assignedStaff;

        // Re-check the permission rather than trusting the stored id. The
        // assignment was validated when the ticket was created, but this runs
        // from a queued job -- on a busy queue that can be minutes later, and
        // the account may have lost its staff group in between. Notifying only
        // a person who can no longer open the ticket would lose it silently,
        // so fall back to telling everyone.
        if ($assignee && $this->isStaff($assignee)) {
            return ((int) $assignee->id === (int) $ticket->user_id) ? [] : [$assignee];
        }

        return $this->staffRecipients($ticket->user_id);
    }

    /**
     * Sync with isolated error handling: alerts are written before emails
     * are sent, so an email-send failure still leaves the bell-icon alert.
     * We distinguish mailer failures from genuine sync bugs in the log.
     *
     * @param \Flarum\Notification\Blueprint\BlueprintInterface $blueprint
     * @param list<\Flarum\User\User> $recipients
     */
    protected function trySync($blueprint, array $recipients, string $kind): void
    {
        // Respect each recipient's notification preference. Flarum's alert
        // driver creates the bell-icon alert for EVERY recipient passed to
        // sync() (only the email driver filters, by shouldEmail), so we must
        // drop users here who have switched this notification off in their
        // /settings -- otherwise it can't be suppressed.
        $type = $blueprint::getType();
        $recipients = array_values(array_filter(
            $recipients,
            fn ($user) => $user->shouldAlert($type) || $user->shouldEmail($type)
        ));

        if (empty($recipients)) {
            return;
        }

        try {
            $this->syncer->sync($blueprint, $recipients);
        } catch (\Throwable $e) {
            $msg = $e->getMessage();
            $isMailerError = stripos($msg, 'sendmail') !== false
                || stripos($msg, 'smtp') !== false
                || stripos($msg, 'mailer') !== false
                || stripos($msg, 'mail server') !== false;

            $this->log->warning($isMailerError
                ? "[linkrobins/support] {$kind} notification stored, but email send failed: {$msg}"
                : "[linkrobins/support] {$kind} notification sync failed: {$msg}");
        }
    }

    /**
     * Staff = admin-group members + users holding the handle_tickets
     * permission via any group.
     *
     * @return User[]
     */
    protected function staffRecipients(?int $exceptId = null): array
    {
        try {
            $query = User::query()->where(function ($q) {
                $q->whereHas('groups', function ($q) {
                    $q->where('groups.id', Group::ADMINISTRATOR_ID);
                })->orWhereHas('groups', function ($q) {
                    $q->whereIn('groups.id', function ($sub) {
                        $sub->select('group_id')
                            ->from('group_permission')
                            ->where('permission', SupportAbilities::HANDLE_TICKETS);
                    });
                });
            });

            if ($exceptId !== null) {
                $query->where('id', '!=', $exceptId);
            }

            // No distinct() here: the staff filter is built from EXISTS
            // subqueries (whereHas/orWhereHas), not joins, so a user can
            // never appear twice -- distinct() is redundant. It also breaks
            // on PostgreSQL, where "SELECT DISTINCT *" over the users table
            // fails (the json `preferences` column has no equality operator,
            // SQLSTATE 42883). On MySQL that query merely worked by accident.
            return $query->get()->all();
        } catch (\Throwable $e) {
            $this->log->warning('[linkrobins/support] staffRecipients failed', ['exception' => $e]);

            return [];
        }
    }

    protected function isStaff(?User $user): bool
    {
        return $user !== null && SupportAbilities::isStaff($user);
    }
}
