<?php

namespace LinkRobins\Support\Listener;

use LinkRobins\Support\Event\TicketStatusChanged;
use Psr\Log\LoggerInterface;

class NotifyTicketTypeStatusChange
{
    public function __construct(
        protected LoggerInterface $log,
    ) {
    }

    public function __invoke(TicketStatusChanged $event): void
    {
        $category = $event->ticket->currentCategory();
        if (! $category) {
            return;
        }

        try {
            $category->ticketType()->onStatusChanged(
                $event->ticket,
                $event->newStatus,
                $event->oldStatus,
                $event->actor,
            );
        } catch (\Throwable $e) {
            $this->log->error('[linkrobins/support] ticket type onStatusChanged failed', ['exception' => $e]);
        }
    }
}
