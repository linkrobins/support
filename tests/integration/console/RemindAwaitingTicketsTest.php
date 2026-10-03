<?php

/*
 * This file is part of linkrobins/support.
 *
 * For detailed copyright and license information, please view the
 * LICENSE file that was distributed with this source code.
 */

namespace LinkRobins\Support\Tests\integration\console;

use Carbon\Carbon;
use Flarum\Testing\integration\ConsoleTestCase;
use Flarum\Testing\integration\RetrievesAuthorizedUsers;
use PHPUnit\Framework\Attributes\Test;

/**
 * One reminder per wait, to the owner, only once the ticket has been quiet
 * in Awaiting response for the whole window.
 */
class RemindAwaitingTicketsTest extends ConsoleTestCase
{
    use RetrievesAuthorizedUsers;

    public function setUp(): void
    {
        parent::setUp();

        $this->extension('linkrobins-support');

        $old = Carbon::now()->subDays(5);
        $recent = Carbon::now()->subDay();
        $t = fn (int $id, string $status, $changed, $lastReply, $reminded = null) => [
            'id' => $id, 'category_id' => 1, 'user_id' => 2, 'subject' => "T$id", 'status' => $status,
            'status_changed_at' => $changed, 'last_reply_at' => $lastReply, 'reminded_at' => $reminded,
            'created_at' => $old, 'updated_at' => $old,
        ];

        $this->prepareDatabase([
            'users' => [$this->normalUser()],
            'linkrobins_support_categories' => [
                ['id' => 1, 'name' => 'General', 'slug' => 'general', 'is_appeal' => 0, 'position' => 0, 'created_at' => $old, 'updated_at' => $old],
            ],
            'linkrobins_support_tickets' => [
                $t(1, 'awaiting_user', $old, $old),            // quiet 5 days: remind
                $t(2, 'awaiting_user', $recent, $old),         // only just asked: wait
                $t(3, 'awaiting_user', $old, $recent),         // staff wrote yesterday: wait
                $t(4, 'in_progress', $old, $old),              // not waiting on the owner
                $t(5, 'awaiting_user', $old, $old, $recent),   // already reminded this wait
                $t(6, 'awaiting_user', $recent->copy()->subDays(4)->addHour(), $old, $old->copy()->subDay()), // reminded in an earlier wait
            ],
        ]);
    }

    /** @return list<int> */
    private function remindedTickets(): array
    {
        return $this->database()->table('notifications')
            ->where('type', 'linkrobinsSupportAwaitingReminder')
            ->where('user_id', 2)
            ->pluck('subject_id')->map(fn ($id) => (int) $id)->sort()->values()->all();
    }

    #[Test]
    public function it_reminds_the_owner_of_tickets_quiet_for_the_whole_window(): void
    {
        $this->runCommand(['command' => 'lr-support:remind-awaiting']);

        $this->assertEquals([1, 6], $this->remindedTickets());
        $this->assertNotNull($this->database()->table('linkrobins_support_tickets')->where('id', 1)->value('reminded_at'));
    }

    #[Test]
    public function it_reminds_only_once_per_wait(): void
    {
        $this->runCommand(['command' => 'lr-support:remind-awaiting']);
        $this->database()->table('notifications')->delete();
        $this->runCommand(['command' => 'lr-support:remind-awaiting']);

        $this->assertEquals([], $this->remindedTickets());
    }

    #[Test]
    public function the_reminder_does_not_write_ticket_history(): void
    {
        $this->runCommand(['command' => 'lr-support:remind-awaiting']);

        $this->assertEquals(0, $this->database()->table('linkrobins_support_events')->count());
    }

    #[Test]
    public function zero_days_turns_it_off(): void
    {
        $this->setting('linkrobins-support.awaiting_reminder_days', '0');

        $this->runCommand(['command' => 'lr-support:remind-awaiting']);

        $this->assertEquals([], $this->remindedTickets());
    }
}
