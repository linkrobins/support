<?php

namespace LinkRobins\Support\Event;

use Flarum\User\User;
use LinkRobins\Support\SupportTicket;

/**
 * A ticket was opened. Fired once its opening message is saved too, after the
 * transaction commits, so a listener never sees a ticket that is then rolled
 * back. The ticket's own first reply does not also fire ReplyCreated.
 */
class TicketCreated
{
    public function __construct(
        public readonly SupportTicket $ticket,
        public readonly ?User $actor = null,
    ) {
    }
}
