<?php

namespace LinkRobins\Support\Event;

use Flarum\User\User;
use LinkRobins\Support\SupportTicket;

/**
 * Dispatched when a ticket's assigned staff member changes.
 */
class TicketAssigned
{
    public function __construct(
        public SupportTicket $ticket,
        public ?User $actor,
        public ?User $assignee,
        public ?User $oldAssignee = null,
    ) {
    }
}
