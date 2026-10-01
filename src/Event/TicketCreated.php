<?php

namespace LinkRobins\Support\Event;

use Flarum\User\User;
use LinkRobins\Support\SupportTicket;

/**
 * Dispatched immediately after a support ticket and its initial reply have been created.
 */
class TicketCreated
{
    public function __construct(
        public SupportTicket $ticket,
        public ?User $actor = null,
    ) {
    }
}
