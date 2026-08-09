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
        // Eager-load what the notifier and the blueprint go on to read:
        // the author (staff check), the ticket, and the ticket's owner
        // (the recipient when staff reply). Loading the reply bare meant
        // each of those resolved as its own primary-key lookup, re-reading
        // rows the request had already read moments earlier.
        $reply = SupportReply::query()
            ->with(['user', 'ticket', 'ticket.user'])
            ->find($this->replyId);

        if ($reply) {
            $notifier->notifyNewReply($reply);
        }
    }
}
