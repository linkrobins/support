<?php

namespace LinkRobins\Support\Event;

use Flarum\User\User;
use LinkRobins\Support\SupportTicket;

/**
 * Dispatched when a ticket's status has been modified.
 */
class TicketStatusChanged
{
    public function __construct(
        public SupportTicket $ticket,
        public ?User $actor,
        public ?string $oldStatus,
        public string $newStatus,
    ) {
    }
}
