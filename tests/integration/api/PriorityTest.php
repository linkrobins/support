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
 * Priority is staff triage: staff set it and see urgent work first; members
 * never see it and cannot set it.
 */
class PriorityTest extends TestCase
{
    use RetrievesAuthorizedUsers;

    protected function allowedRepeatedQueries(): array
    {
        return ['`id` = ? limit ?', '"id" = ? limit ?'];
    }

    public function setUp(): void
    {
        parent::setUp();

        $this->extension('linkrobins-support');

        $t = fn (int $id, int $hoursAgo) => [
            'id' => $id, 'category_id' => 1, 'user_id' => 2, 'subject' => "T$id", 'status' => 'open',
            'last_reply_at' => Carbon::now()->subHours($hoursAgo), 'created_at' => Carbon::now()->subDay(), 'updated_at' => Carbon::now(),
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
                ['id' => 1, 'name' => 'General', 'slug' => 'general', 'is_appeal' => 0, 'position' => 0, 'created_at' => Carbon::now(), 'updated_at' => Carbon::now()],
            ],
            // Newest activity first by default: 1, 2, 3.
            'linkrobins_support_tickets' => [$t(1, 1), $t(2, 2), $t(3, 3)],
        ]);
    }

    private function setPriority(int $actor, int $ticket, string $priority): int
    {
        return $this->send($this->request('PATCH', "/api/linkrobins-support-tickets/$ticket", [
            'authenticatedAs' => $actor,
            'json' => ['data' => ['type' => 'linkrobins-support-tickets', 'id' => (string) $ticket, 'attributes' => ['priority' => $priority]]],
        ]))->getStatusCode();
    }

    /** @return list<array{id: int, priority: mixed}> */
    private function listAs(int $actor): array
    {
        $response = $this->send(
            $this->request('GET', '/api/linkrobins-support-tickets', ['authenticatedAs' => $actor])->withQueryParams(['sort' => '-lastReplyAt'])
        );

        return array_map(
            fn ($t) => ['id' => (int) $t['id'], 'priority' => $t['attributes']['priority'] ?? null],
            json_decode((string) $response->getBody(), true)['data']
        );
    }

    #[Test]
    public function tickets_start_as_normal(): void
    {
        $this->assertEquals(['normal', 'normal', 'normal'], array_column($this->listAs(3), 'priority'));
    }

    #[Test]
    public function staff_lists_put_urgent_first_and_low_last_keeping_activity_order_within(): void
    {
        $this->assertEquals(200, $this->setPriority(3, 3, 'urgent'));
        $this->assertEquals(200, $this->setPriority(3, 1, 'low'));

        $this->assertEquals([3, 2, 1], array_column($this->listAs(3), 'id'));
    }

    #[Test]
    public function an_unknown_priority_is_ignored(): void
    {
        $this->setPriority(3, 1, 'critical');

        $this->assertEquals('normal', $this->database()->table('linkrobins_support_tickets')->where('id', 1)->value('priority'));
    }

    #[Test]
    public function members_never_see_priority_or_the_reordering(): void
    {
        $this->setPriority(3, 3, 'urgent');

        $list = $this->listAs(2);
        $this->assertEquals([1, 2, 3], array_column($list, 'id'));
        $this->assertEquals([null, null, null], array_column($list, 'priority'));
    }

    #[Test]
    public function a_member_cannot_set_priority(): void
    {
        $this->setPriority(2, 1, 'urgent');

        $this->assertEquals('normal', $this->database()->table('linkrobins_support_tickets')->where('id', 1)->value('priority'));
    }
}
