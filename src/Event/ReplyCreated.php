<?php

namespace LinkRobins\Support\Event;

use Flarum\User\User;
use LinkRobins\Support\SupportReply;

/**
 * Dispatched when a new reply (or internal note) has been added to a ticket.
 */
class ReplyCreated
{
    public function __construct(
        public SupportReply $reply,
        public ?User $actor = null,
    ) {
    }
}
