<?php

namespace LinkRobins\Support\Event;

use Flarum\User\User;
use LinkRobins\Support\SupportTicket;

/**
 * A ticket's status changed, by whatever route: a staff member or the owner
 * picking it, a reply moving it on (for example a staff reply to an open
 * ticket), or the scheduled auto-close. $actor is null for the auto-close.
 */
class TicketStatusChanged
{
    public function __construct(
        public readonly SupportTicket $ticket,
        public readonly ?User $actor,
        public readonly ?string $oldStatus,
        public readonly string $newStatus,
    ) {
    }
}
