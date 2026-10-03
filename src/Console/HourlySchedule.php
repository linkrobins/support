<?php

namespace LinkRobins\Support\Console;

use Illuminate\Console\Scheduling\Event;

class HourlySchedule
{
    public function __invoke(Event $event): void
    {
        $event->hourly()->withoutOverlapping();
    }
}
