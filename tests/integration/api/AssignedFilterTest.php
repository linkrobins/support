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
 * The staff work queues: "Assigned to me" and "Unassigned". Also that the
 * filter cannot be used to see tickets a member could not see anyway.
 */
class AssignedFilterTest extends TestCase
{
    use RetrievesAuthorizedUsers;

    public function setUp(): void
    {
        parent::setUp();

        $this->extension('linkrobins-support');

        $now = Carbon::now();

        $this->prepareDatabase([
            'users' => [
                $this->normalUser(), // id 2
                ['id' => 3, 'username' => 'staffa', 'email' => 'staffa@machine.local', 'is_email_confirmed' => 1, 'password' => 'too-obscure'],
                ['id' => 4, 'username' => 'staffb', 'email' => 'staffb@machine.local', 'is_email_confirmed' => 1, 'password' => 'too-obscure'],
            ],
            'groups' => [
                ['id' => 100, 'name_singular' => 'Support', 'name_plural' => 'Support', 'is_hidden' => 0],
            ],
            'group_user' => [
                ['user_id' => 3, 'group_id' => 100],
                ['user_id' => 4, 'group_id' => 100],
            ],
            'group_permission' => [
                ['group_id' => 100, 'permission' => 'lr-support.handle_tickets'],
            ],
            'linkrobins_support_categories' => [
                ['id' => 1, 'name' => 'General', 'slug' => 'general', 'is_appeal' => 0, 'position' => 0, 'created_at' => $now, 'updated_at' => $now],
            ],
            'linkrobins_support_tickets' => [
                ['id' => 1, 'category_id' => 1, 'user_id' => 2, 'assigned_staff_id' => 3, 'subject' => 'Mine to handle', 'status' => 'open', 'last_reply_at' => $now, 'created_at' => $now, 'updated_at' => $now],
                ['id' => 2, 'category_id' => 1, 'user_id' => 2, 'assigned_staff_id' => 4, 'subject' => 'Someone else', 'status' => 'open', 'last_reply_at' => $now, 'created_at' => $now, 'updated_at' => $now],
                ['id' => 3, 'category_id' => 1, 'user_id' => 2, 'assigned_staff_id' => null, 'subject' => 'Nobody yet', 'status' => 'open', 'last_reply_at' => $now, 'created_at' => $now, 'updated_at' => $now],
                ['id' => 4, 'category_id' => 1, 'user_id' => 2, 'assigned_staff_id' => 3, 'subject' => 'Done', 'status' => 'closed', 'last_reply_at' => $now, 'created_at' => $now, 'updated_at' => $now],
            ],
        ]);
    }

    /**
     * @param array<string, string> $filter
     * @return list<int>
     */
    private function idsFor(int $actor, array $filter): array
    {
        $response = $this->send(
            $this->request('GET', '/api/linkrobins-support-tickets', ['authenticatedAs' => $actor])
                ->withQueryParams(['filter' => $filter])
        );
        $this->assertEquals(200, $response->getStatusCode());

        $ids = array_map(fn ($t) => (int) $t['id'], json_decode((string) $response->getBody(), true)['data']);
        sort($ids);

        return $ids;
    }

    #[Test]
    public function assigned_to_me_lists_only_the_actors_tickets(): void
    {
        $this->assertEquals([1, 4], $this->idsFor(3, ['assigned' => 'me']));
        $this->assertEquals([2], $this->idsFor(4, ['assigned' => 'me']));
    }

    #[Test]
    public function unassigned_lists_tickets_nobody_has_claimed(): void
    {
        $this->assertEquals([3], $this->idsFor(3, ['assigned' => 'none']));
    }

    #[Test]
    public function the_queue_view_can_leave_closed_tickets_out(): void
    {
        // What the forum's "Assigned to me" view sends.
        $this->assertEquals([1], $this->idsFor(3, ['assigned' => 'me', '-status' => 'closed']));
    }

    #[Test]
    public function a_member_still_sees_only_their_own_tickets(): void
    {
        // Member 2 owns all four. The filter narrows, it never widens.
        $this->assertEquals([3], $this->idsFor(2, ['assigned' => 'none']));
        $this->assertEquals([], $this->idsFor(2, ['assigned' => 'me']));
    }
}
