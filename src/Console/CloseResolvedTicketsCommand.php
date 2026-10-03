<?php

namespace LinkRobins\Support\Console;

use Carbon\Carbon;
use Flarum\Settings\SettingsRepositoryInterface;
use Illuminate\Console\Command;
use LinkRobins\Support\SupportTicket;

/**
 * Close tickets that have sat in Resolved with no activity for the
 * configured number of days (setting `linkrobins-support.auto_close_resolved_days`,
 * default 7, 0 turns it off).
 *
 * "No activity" means neither the status nor the last reply moved within the
 * window. Internal notes count as activity: staff still working on a ticket
 * should not have it closed under them. A public reply on a resolved ticket
 * already reopens it, so those never reach this command at all.
 *
 * Nobody is notified. The ticket's own timeline records it as closed
 * automatically, and the owner can reopen it as usual.
 */
class CloseResolvedTicketsCommand extends Command
{
    public const SETTING = 'linkrobins-support.auto_close_resolved_days';

    protected $signature = 'lr-support:close-resolved';

    protected $description = 'Close support tickets left Resolved with no activity for the configured number of days.';

    /**
     * The configured window in days. An emptied field is stored as '' and
     * means "use the default", not "off"; only an explicit 0 turns it off.
     */
    public static function days(mixed $value): int
    {
        if ($value === null || $value === '' || ! is_numeric($value)) {
            return 7;
        }

        return max(0, (int) $value);
    }

    public function handle(SettingsRepositoryInterface $settings): int
    {
        $days = self::days($settings->get(self::SETTING));

        if ($days <= 0) {
            $this->info('Auto-close is turned off.');

            return self::SUCCESS;
        }

        $cutoff = Carbon::now()->subDays($days);
        $closed = 0;

        SupportTicket::query()
            ->where('status', SupportTicket::STATUS_RESOLVED)
            ->whereNotNull('status_changed_at')
            ->where('status_changed_at', '<=', $cutoff)
            ->where(fn ($q) => $q->whereNull('last_reply_at')->orWhere('last_reply_at', '<=', $cutoff))
            ->chunkById(100, function ($tickets) use (&$closed) {
                foreach ($tickets as $ticket) {
                    /** @var SupportTicket $ticket */
                    // Re-check on the row itself: a reply may have reopened
                    // it since the chunk was read.
                    if ($ticket->fresh()?->status !== SupportTicket::STATUS_RESOLVED) {
                        continue;
                    }
                    $ticket->status = SupportTicket::STATUS_CLOSED;
                    $ticket->eventActorId = null;
                    $ticket->save();
                    $closed++;
                }
            });

        $this->info("Closed $closed resolved ".($closed === 1 ? 'ticket' : 'tickets').'.');

        return self::SUCCESS;
    }
}
