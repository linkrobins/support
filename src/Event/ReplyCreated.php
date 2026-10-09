<?php

namespace LinkRobins\Support\Event;

use Flarum\User\User;
use LinkRobins\Support\SupportReply;

/**
 * A follow-up reply or internal note was posted on a ticket. A ticket's
 * opening message is announced by TicketCreated instead, not by this. Check
 * $reply->is_internal_note before showing a reply to anyone but staff.
 */
class ReplyCreated
{
    public function __construct(
        public readonly SupportReply $reply,
        public readonly ?User $actor = null,
    ) {
    }
}
