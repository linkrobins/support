<?php

namespace LinkRobins\Support\Listener;

use LinkRobins\Support\Event\TicketStatusChanged;
use LinkRobins\Support\SupportEvent;
use Psr\Log\LoggerInterface;

class RecordStatusChangeTimeline
{
    public function __construct(
        protected LoggerInterface $log,
    ) {
    }

    public function __invoke(TicketStatusChanged $event): void
    {
        try {
            SupportEvent::recordStatusChange(
                ticket: $event->ticket,
                actor: $event->actor,
                fromStatus: $event->oldStatus,
                toStatus: $event->newStatus,
                isAutomatic: $event->isAutomatic,
            );
        } catch (\Throwable $e) {
            $this->log->warning('[linkrobins/support] could not record status timeline event', [
                'ticket_id' => $event->ticket->id,
                'exception' => $e,
            ]);
        }
    }
}
