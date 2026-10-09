<?php

namespace LinkRobins\Support\Event;

use Flarum\User\User;
use LinkRobins\Support\SupportTicket;

/**
 * The decision on an appeal ticket changed (pending, accepted, rejected).
 */
class TicketDecided
{
    public function __construct(
        public readonly SupportTicket $ticket,
        public readonly ?User $actor,
        public readonly ?string $oldDecision,
        public readonly ?string $newDecision,
    ) {
    }
}
