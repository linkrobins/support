<?php

namespace LinkRobins\Support\Job;

use Flarum\Queue\AbstractJob;
use LinkRobins\Support\SupportNotifier;
use LinkRobins\Support\SupportReply;

/**
 * Queued: sends the new-reply notification off the request thread (the
 * staff-recipient lookup used to run synchronously on every reply post).
 */
class NotifyNewReply extends AbstractJob
{
    public function __construct(public readonly int $replyId)
    {
    }

    public function handle(SupportNotifier $notifier): void
    {
        $reply = SupportReply::query()->find($this->replyId);

        if ($reply) {
            $notifier->notifyNewReply($reply);
        }
    }
}
