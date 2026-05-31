<?php

namespace LinkRobins\Support;

use Carbon\Carbon;
use Flarum\Foundation\AbstractServiceProvider;
use Flarum\Formatter\Formatter;
use Flarum\User\User;
use Illuminate\Contracts\Bus\Dispatcher;
use LinkRobins\Support\Access\SupportAbilities;
use LinkRobins\Support\Job\NotifyNewReply;
use LinkRobins\Support\Job\NotifyNewTicket;
use Psr\Log\LoggerInterface;

class SupportServiceProvider extends AbstractServiceProvider
{
    public function boot(Formatter $formatter, Dispatcher $bus, LoggerInterface $log): void
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
        SupportReply::created(function (SupportReply $reply) use ($bus, $log) {
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
                    $bus->dispatch(new NotifyNewReply($reply->id));
                }
            } catch (\Throwable $e) {
                $log->warning('[linkrobins/support] reply post-save hook failed', ['exception' => $e]);
            }
        });

        // When a ticket is opened, notify staff so they can pick it up.
        // The actor themselves is excluded so a staff member filing a
        // ticket doesn't get notified about their own ticket.
        SupportTicket::created(function (SupportTicket $ticket) use ($bus, $log) {
            try {
                $bus->dispatch(new NotifyNewTicket($ticket->id));
            } catch (\Throwable $e) {
                $log->warning('[linkrobins/support] ticket post-save hook failed', ['exception' => $e]);
            }
        });
    }

    /**
     * Lightweight staff check used during the post-save hook where we
     * don't want to drag in the full policy machinery. Mirrors the
     * isStaff() helper in SupportTicketPolicy.
     */
    protected static function actorIsStaff(?User $user): bool
    {
        return $user !== null && SupportAbilities::isStaff($user);
    }
}
