<?php

namespace LinkRobins\Support\Job;

use Flarum\Queue\AbstractJob;
use Flarum\User\User;
use LinkRobins\Support\SupportNotifier;
use LinkRobins\Support\SupportTicket;

/**
 * Queued: tells a staff member a ticket has been handed to them.
 */
class NotifyAssigned extends AbstractJob
{
    public function __construct(
        public readonly int $ticketId,
        public readonly ?int $actorId,
    ) {
    }

    public function handle(SupportNotifier $notifier): void
    {
        $ticket = SupportTicket::query()
            ->with(['user', 'assignedStaff'])
            ->find($this->ticketId);

        if (! $ticket) {
            return;
        }

        $actor = $this->actorId === null ? null : User::query()->find($this->actorId);

        $notifier->notifyAssigned($ticket, $actor);
    }
}
