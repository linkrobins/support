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
        $ticket = SupportTicket::query()->find($this->ticketId);

        if ($ticket) {
            $notifier->notifyNewTicket($ticket);
        }
    }
}
