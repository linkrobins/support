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
 * Resolved tickets close themselves once nobody has touched them for the
 * configured number of days. What matters most is what it must NOT close:
 * a ticket resolved recently, or one somebody is still writing on.
 */
class CloseResolvedTicketsTest extends ConsoleTestCase
{
    use RetrievesAuthorizedUsers;

    public function setUp(): void
    {
        parent::setUp();

        $this->extension('linkrobins-support');

        $old = Carbon::now()->subDays(10);
        $recent = Carbon::now()->subDays(2);

        $this->prepareDatabase([
            'users' => [$this->normalUser()],
            'linkrobins_support_categories' => [
                ['id' => 1, 'name' => 'General', 'slug' => 'general', 'is_appeal' => 0, 'position' => 0, 'created_at' => $old, 'updated_at' => $old],
            ],
            'linkrobins_support_tickets' => [
                // Resolved and quiet for 10 days: closes.
                ['id' => 1, 'category_id' => 1, 'user_id' => 2, 'subject' => 'Quiet', 'status' => 'resolved', 'status_changed_at' => $old, 'last_reply_at' => $old, 'created_at' => $old, 'updated_at' => $old],
                // Resolved two days ago, last reply long before: stays. This is
                // the case last_reply_at alone would get wrong.
                ['id' => 2, 'category_id' => 1, 'user_id' => 2, 'subject' => 'Just resolved', 'status' => 'resolved', 'status_changed_at' => $recent, 'last_reply_at' => $old, 'created_at' => $old, 'updated_at' => $recent],
                // Resolved long ago but someone posted (an internal note) recently: stays.
                ['id' => 3, 'category_id' => 1, 'user_id' => 2, 'subject' => 'Still active', 'status' => 'resolved', 'status_changed_at' => $old, 'last_reply_at' => $recent, 'created_at' => $old, 'updated_at' => $recent],
                // Quiet, but not resolved: never touched.
                ['id' => 4, 'category_id' => 1, 'user_id' => 2, 'subject' => 'Waiting', 'status' => 'awaiting_user', 'status_changed_at' => $old, 'last_reply_at' => $old, 'created_at' => $old, 'updated_at' => $old],
            ],
        ]);
    }

    private function statusOf(int $id): string
    {
        return (string) $this->database()->table('linkrobins_support_tickets')->where('id', $id)->value('status');
    }

    #[Test]
    public function it_closes_only_resolved_tickets_quiet_for_the_whole_window(): void
    {
        $this->runCommand(['command' => 'lr-support:close-resolved']);

        $this->assertEquals('closed', $this->statusOf(1));
        $this->assertEquals('resolved', $this->statusOf(2));
        $this->assertEquals('resolved', $this->statusOf(3));
        $this->assertEquals('awaiting_user', $this->statusOf(4));
    }

    #[Test]
    public function the_close_is_recorded_in_history_as_the_forums_own_and_notifies_nobody(): void
    {
        $this->runCommand(['command' => 'lr-support:close-resolved']);

        $event = $this->database()->table('linkrobins_support_events')->where('ticket_id', 1)->first();
        $this->assertNotNull($event);
        $this->assertEquals('status', $event->type);
        $this->assertEquals('resolved', $event->from_status);
        $this->assertEquals('closed', $event->to_status);
        $this->assertNull($event->user_id);

        $this->assertEquals(0, $this->database()->table('notifications')->count());
    }

    #[Test]
    public function zero_days_turns_it_off(): void
    {
        $this->setting('linkrobins-support.auto_close_resolved_days', '0');

        $this->runCommand(['command' => 'lr-support:close-resolved']);

        $this->assertEquals('resolved', $this->statusOf(1));
    }

    #[Test]
    public function an_emptied_setting_falls_back_to_seven_days_rather_than_off(): void
    {
        $this->setting('linkrobins-support.auto_close_resolved_days', '');

        $this->runCommand(['command' => 'lr-support:close-resolved']);

        $this->assertEquals('closed', $this->statusOf(1));
    }

    #[Test]
    public function a_longer_window_spares_tickets_inside_it(): void
    {
        $this->setting('linkrobins-support.auto_close_resolved_days', '30');

        $this->runCommand(['command' => 'lr-support:close-resolved']);

        $this->assertEquals('resolved', $this->statusOf(1));
    }
}
