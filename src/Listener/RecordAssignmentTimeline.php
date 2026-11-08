<?php

namespace LinkRobins\Support\Listener;

use LinkRobins\Support\Event\TicketAssigned;
use LinkRobins\Support\SupportEvent;
use Psr\Log\LoggerInterface;

class RecordAssignmentTimeline
{
    public function __construct(
        protected LoggerInterface $log,
    ) {
    }

    public function __invoke(TicketAssigned $event): void
    {
        try {
            SupportEvent::recordAssignment(
                ticket: $event->ticket,
                actor: $event->actor,
                fromUser: $event->oldAssignee,
                toUser: $event->assignee,
                fromUserId: $event->oldAssigneeId,
                toUserId: $event->assigneeId,
            );
        } catch (\Throwable $e) {
            $this->log->warning('[linkrobins/support] could not record assignment timeline event', [
                'ticket_id' => $event->ticket->id,
                'exception' => $e,
            ]);
        }
    }
}
