<?php

namespace LinkRobins\Support\Job;

use Flarum\Queue\AbstractJob;
use Flarum\User\User;
use LinkRobins\Support\SupportNotifier;
use LinkRobins\Support\SupportTicket;

/**
 * Queued: tells the other side that a ticket's status moved.
 *
 * Ids rather than models, like the other support jobs, so the payload stays
 * small and the job reads current state when it runs.
 */
class NotifyStatusChanged extends AbstractJob
{
    public function __construct(
        public readonly int $ticketId,
        public readonly string $status,
        public readonly ?string $previousStatus,
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

        $notifier->notifyStatusChanged($ticket, $this->status, $this->previousStatus, $actor);
    }
}
