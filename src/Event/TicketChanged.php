<?php

namespace LinkRobins\Support\Event;

use Flarum\User\User;
use LinkRobins\Support\SupportTicket;

/**
 * A ticket was opened or changed (status, assignment, subject, a new reply
 * moving its activity time). Fired after the row is saved; flarum/realtime
 * listens for it when installed.
 */
class TicketChanged
{
    public function __construct(
        public readonly SupportTicket $ticket,
        public readonly ?User $actor = null,
    ) {
    }
}
