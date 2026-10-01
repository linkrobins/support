<?php

namespace LinkRobins\Support\Event;

use Flarum\User\User;
use LinkRobins\Support\SupportTicket;

/**
 * Dispatched when a decision is set or changed on an appeal ticket (e.g. pending -> accepted/rejected).
 */
class TicketDecided
{
    public function __construct(
        public SupportTicket $ticket,
        public ?User $actor,
        public ?string $oldDecision,
        public ?string $newDecision,
    ) {
    }
}
