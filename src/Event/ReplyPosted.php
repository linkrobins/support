<?php

namespace LinkRobins\Support\Event;

use Flarum\User\User;
use LinkRobins\Support\SupportReply;

/**
 * A reply (or internal note) was posted on a ticket. flarum/realtime listens
 * for it when installed; who may receive it is decided by the reply API's own
 * visibility rules, so internal notes never reach the ticket owner.
 */
class ReplyPosted
{
    public function __construct(
        public readonly SupportReply $reply,
        public readonly ?User $actor = null,
    ) {
    }
}
