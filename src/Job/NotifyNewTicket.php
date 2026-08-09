<?php

namespace LinkRobins\Support\Job;

use Flarum\Queue\AbstractJob;
use LinkRobins\Support\SupportNotifier;
use LinkRobins\Support\SupportTicket;

/**
 * Queued: notifies staff of a new ticket off the request thread (the
 * staff-recipient lookup used to run synchronously on every ticket save).
 */
class NotifyNewTicket extends AbstractJob
{
    public function __construct(public readonly int $ticketId)
    {
    }

    public function handle(SupportNotifier $notifier): void
    {
        // The notifier only needs `user_id`, but NewSupportTicketBlueprint
        // reads the submitter to attribute the notification, so load it here
        // rather than paying a separate lookup for a row already in memory.
        $ticket = SupportTicket::query()
            ->with('user')
            ->find($this->ticketId);

        if ($ticket) {
            $notifier->notifyNewTicket($ticket);
        }
    }
}
