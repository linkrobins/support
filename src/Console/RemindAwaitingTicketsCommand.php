<?php

namespace LinkRobins\Support\Console;

use Carbon\Carbon;
use Flarum\Notification\NotificationSyncer;
use Flarum\Settings\SettingsRepositoryInterface;
use Illuminate\Console\Command;
use LinkRobins\Support\Notification\AwaitingReplyReminderBlueprint;
use LinkRobins\Support\SupportTicket;

/**
 * Remind a ticket's owner, once, when staff have been waiting on their reply
 * for the configured number of days (setting
 * `linkrobins-support.awaiting_reminder_days`, default 3, 0 turns it off).
 *
 * "Waiting" means the ticket is in Awaiting response and neither its status
 * nor its last reply has moved within the window. One reminder per wait: the
 * ticket is only reminded again after its status changes and it comes back
 * to Awaiting response.
 */
class RemindAwaitingTicketsCommand extends Command
{
    public const SETTING = 'linkrobins-support.awaiting_reminder_days';

    protected $signature = 'lr-support:remind-awaiting';

    protected $description = 'Remind ticket owners once when staff have been waiting on their reply for the configured number of days.';

    /** An emptied field means the default; only an explicit 0 turns it off. */
    public static function days(mixed $value): int
    {
        if ($value === null || $value === '' || ! is_numeric($value)) {
            return 3;
        }

        return max(0, (int) $value);
    }

    public function handle(SettingsRepositoryInterface $settings, NotificationSyncer $notifications): int
    {
        $days = self::days($settings->get(self::SETTING));

        if ($days <= 0) {
            $this->info('Reminders are turned off.');

            return self::SUCCESS;
        }

        $cutoff = Carbon::now()->subDays($days);
        $sent = 0;

        SupportTicket::query()
            ->with('user')
            ->where('status', SupportTicket::STATUS_AWAITING_USER)
            ->whereNotNull('user_id')
            ->whereNotNull('status_changed_at')
            ->where('status_changed_at', '<=', $cutoff)
            ->where(fn ($q) => $q->whereNull('last_reply_at')->orWhere('last_reply_at', '<=', $cutoff))
            ->where(fn ($q) => $q->whereNull('reminded_at')->orWhereColumn('reminded_at', '<', 'status_changed_at'))
            ->chunkById(100, function ($tickets) use ($notifications, &$sent) {
                foreach ($tickets as $ticket) {
                    /** @var SupportTicket $ticket */
                    if (! $ticket->user) {
                        continue;
                    }

                    $notifications->sync(new AwaitingReplyReminderBlueprint($ticket), [$ticket->user]);

                    // A direct update, not a model save: this is bookkeeping,
                    // not a change anyone should see in the ticket's history.
                    SupportTicket::query()->whereKey($ticket->id)->update(['reminded_at' => Carbon::now()]);
                    $sent++;
                }
            });

        $this->info("Sent $sent ".($sent === 1 ? 'reminder' : 'reminders').'.');

        return self::SUCCESS;
    }
}
