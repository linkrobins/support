<?php

namespace LinkRobins\Support\Listener;

use LinkRobins\Support\Event\TicketDecided;
use Psr\Log\LoggerInterface;

class NotifyTicketTypeDecision
{
    public function __construct(
        protected LoggerInterface $log,
    ) {
    }

    public function __invoke(TicketDecided $event): void
    {
        $category = $event->ticket->currentCategory();
        if (! $category || $event->newDecision === null) {
            return;
        }

        try {
            $category->ticketType()->onDecided(
                $event->ticket,
                $event->newDecision,
                $event->oldDecision,
                $event->actor,
            );
        } catch (\Throwable $e) {
            $this->log->error('[linkrobins/support] ticket type onDecided failed', ['exception' => $e]);
        }
    }
}
