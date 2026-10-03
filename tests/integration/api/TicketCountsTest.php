<?php

/*
 * This file is part of linkrobins/support.
 *
 * For detailed copyright and license information, please view the
 * LICENSE file that was distributed with this source code.
 */

namespace LinkRobins\Support\Tests\integration\api;

use Carbon\Carbon;
use Flarum\Testing\integration\RetrievesAuthorizedUsers;
use Flarum\Testing\integration\TestCase;
use PHPUnit\Framework\Attributes\Test;

/**
 * The sidebar counts: open work per queue and status for staff, unread own
 * tickets for everyone, and nothing about other people's tickets for members.
 */
class TicketCountsTest extends TestCase
{
    use RetrievesAuthorizedUsers;

    public function setUp(): void
    {
        parent::setUp();

        $this->extension('linkrobins-support');

        $earlier = Carbon::now()->subHour();
        $now = Carbon::now()->subMinute();
        $ticket = fn (int $id, ?int $assignee, string $status, ?string $deleted = null) => [
            'id' => $id, 'category_id' => 1, 'user_id' => 2, 'assigned_staff_id' => $assignee, 'subject' => "T$id",
            'status' => $status, 'last_reply_at' => $now, 'created_at' => $earlier, 'updated_at' => $now, 'deleted_at' => $deleted,
        ];

        $this->prepareDatabase([
            'users' => [
                $this->normalUser(), // id 2
                ['id' => 3, 'username' => 'staffa', 'email' => 'staffa@machine.local', 'is_email_confirmed' => 1, 'password' => 'too-obscure'],
            ],
            'groups' => [
                ['id' => 100, 'name_singular' => 'Support', 'name_plural' => 'Support', 'is_hidden' => 0],
            ],
            'group_user' => [
                ['user_id' => 3, 'group_id' => 100],
            ],
            'group_permission' => [
                ['group_id' => 100, 'permission' => 'lr-support.handle_tickets'],
            ],
            'linkrobins_support_categories' => [
                ['id' => 1, 'name' => 'General', 'slug' => 'general', 'is_appeal' => 0, 'position' => 0, 'created_at' => $earlier, 'updated_at' => $earlier],
            ],
            'linkrobins_support_tickets' => [
                $ticket(1, 3, 'open'),
                $ticket(2, 3, 'in_progress'),
                $ticket(3, 3, 'closed'),              // closed: never counted
                $ticket(4, null, 'open'),
                $ticket(5, null, 'resolved'),
                $ticket(6, null, 'open', $now->toDateTimeString()), // deleted: never counted
            ],
            'linkrobins_support_replies' => [
                // Staff answered ticket 1: unread for its owner.
                ['id' => 1, 'ticket_id' => 1, 'user_id' => 3, 'content' => '<t>Hi</t>', 'is_internal_note' => 0, 'created_at' => $now, 'updated_at' => $now],
                // Only an internal note on ticket 2: not unread for its owner.
                ['id' => 2, 'ticket_id' => 2, 'user_id' => 3, 'content' => '<t>Note</t>', 'is_internal_note' => 1, 'created_at' => $now, 'updated_at' => $now],
            ],
        ]);
    }

    /** @return array<string, int> */
    private function countsAs(int $actor): array
    {
        $response = $this->send($this->request('GET', '/api/linkrobins-support-counts', ['authenticatedAs' => $actor]));
        $this->assertEquals(200, $response->getStatusCode(), (string) $response->getBody());

        return json_decode((string) $response->getBody(), true)['data'];
    }

    #[Test]
    public function staff_get_open_work_per_queue_and_status(): void
    {
        $counts = $this->countsAs(3);

        $this->assertEquals(2, $counts['assigned_to_me']);
        $this->assertEquals(2, $counts['unassigned']);
        $this->assertEquals(2, $counts['open']);
        $this->assertEquals(1, $counts['in_progress']);
        $this->assertEquals(0, $counts['awaiting_user']);
        $this->assertEquals(1, $counts['resolved']);
        $this->assertArrayNotHasKey('closed', $counts);
    }

    #[Test]
    public function a_member_gets_only_their_unread_count(): void
    {
        $this->assertEquals(['mine_unread' => 1], $this->countsAs(2));
    }
}
