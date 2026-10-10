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
 * Every status and assignment change lands in the ticket's history, whoever
 * or whatever made it, and each viewer sees only what they should: staff see
 * everything, the owner sees status changes but not internal routing, and
 * nobody else sees anything.
 */
class TicketHistoryTest extends TestCase
{
    use RetrievesAuthorizedUsers;

    /**
     * Notifying the owner costs a user lookup inside Flarum's email driver;
     * see StatusNotificationTest.
     *
     * @return string[]
     */
    protected function allowedRepeatedQueries(): array
    {
        return [
            '`id` = ? limit ?',
            '"id" = ? limit ?',
        ];
    }

    public function setUp(): void
    {
        parent::setUp();

        $this->extension('linkrobins-support');

        $this->prepareDatabase([
            'users' => [
                $this->normalUser(), // id 2, owns the ticket
                ['id' => 3, 'username' => 'staffa', 'email' => 'staffa@machine.local', 'is_email_confirmed' => 1, 'password' => 'too-obscure'],
                ['id' => 4, 'username' => 'stranger', 'email' => 'stranger@machine.local', 'is_email_confirmed' => 1, 'password' => 'too-obscure'],
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
            'linkrobins_support_tickets' => [
                ['id' => 1, 'category_id' => 1, 'user_id' => 2, 'subject' => 'Mine', 'status' => 'open', 'last_reply_at' => Carbon::now(), 'created_at' => Carbon::now(), 'updated_at' => Carbon::now()],
            ],
        ]);
    }

    private function patch(int $actor, array $data): int
    {
        $response = $this->send(
            $this->request('PATCH', '/api/linkrobins-support-tickets/1', [
                'authenticatedAs' => $actor,
                'json' => ['data' => array_merge(['type' => 'linkrobins-support-tickets', 'id' => '1'], $data)],
            ])
        );

        return $response->getStatusCode();
    }

    /** @return list<array<string, mixed>> */
    private function historyAs(?int $actor): array
    {
        $options = $actor === null ? [] : ['authenticatedAs' => $actor];
        $response = $this->send(
            $this->request('GET', '/api/linkrobins-support-events', $options)
                ->withQueryParams(['filter' => ['ticketId' => '1'], 'sort' => 'createdAt'])
        );

        if ($response->getStatusCode() !== 200) {
            return [['status' => $response->getStatusCode()]];
        }

        return json_decode((string) $response->getBody(), true)['data'];
    }

    #[Test]
    public function a_staff_status_change_is_recorded_with_who_made_it(): void
    {
        $this->assertEquals(200, $this->patch(3, ['attributes' => ['status' => 'resolved']]));

        $row = $this->database()->table('linkrobins_support_events')->first();
        $this->assertEquals('status', $row->type);
        $this->assertEquals('open', $row->from_status);
        $this->assertEquals('resolved', $row->to_status);
        $this->assertEquals(3, (int) $row->user_id);
    }

    #[Test]
    public function an_assignment_is_recorded_with_both_sides(): void
    {
        $this->patch(3, ['relationships' => ['assignedStaff' => ['data' => ['type' => 'users', 'id' => '3']]]]);

        $row = $this->database()->table('linkrobins_support_events')->where('type', 'assignment')->first();
        $this->assertNotNull($row);
        $this->assertNull($row->from_user_id);
        $this->assertEquals(3, (int) $row->to_user_id);
        $this->assertEquals(3, (int) $row->user_id);
    }

    #[Test]
    public function a_reply_that_moves_the_status_is_recorded_as_its_author(): void
    {
        $this->patch(3, ['attributes' => ['status' => 'resolved']]);

        // The owner replies to the resolved ticket, which reopens it.
        $response = $this->send(
            $this->request('POST', '/api/linkrobins-support-replies', [
                'authenticatedAs' => 2,
                'json' => ['data' => [
                    'type' => 'linkrobins-support-replies',
                    'attributes' => ['content' => 'Actually, it is back.'],
                    'relationships' => ['ticket' => ['data' => ['type' => 'linkrobins-support-tickets', 'id' => '1']]],
                ]],
            ])
        );
        $this->assertEquals(201, $response->getStatusCode(), (string) $response->getBody());

        $row = $this->database()->table('linkrobins_support_events')
            ->where('from_status', 'resolved')->where('to_status', 'in_progress')->first();
        $this->assertNotNull($row);
        $this->assertEquals(2, (int) $row->user_id);
        $this->assertTrue((bool) $row->is_automatic);
    }

    #[Test]
    public function a_staff_reply_to_an_open_ticket_moves_it_automatically(): void
    {
        $response = $this->send(
            $this->request('POST', '/api/linkrobins-support-replies', [
                'authenticatedAs' => 3,
                'json' => ['data' => [
                    'type' => 'linkrobins-support-replies',
                    'attributes' => ['content' => 'Looking into it.'],
                    'relationships' => ['ticket' => ['data' => ['type' => 'linkrobins-support-tickets', 'id' => '1']]],
                ]],
            ])
        );
        $this->assertEquals(201, $response->getStatusCode(), (string) $response->getBody());

        $event = collect($this->historyAs(3))->firstWhere('attributes.type', 'status');
        $this->assertNotNull($event);
        $this->assertEquals('in_progress', $event['attributes']['toStatus']);
        $this->assertTrue($event['attributes']['isAutomatic']);
    }

    #[Test]
    public function a_status_picked_by_hand_is_not_automatic(): void
    {
        $this->patch(3, ['attributes' => ['status' => 'awaiting_user']]);

        $this->assertFalse((bool) $this->database()->table('linkrobins_support_events')->value('is_automatic'));
        $this->assertFalse($this->historyAs(3)[0]['attributes']['isAutomatic']);
    }

    #[Test]
    public function resolving_stamps_when_the_status_changed(): void
    {
        $this->patch(3, ['attributes' => ['status' => 'resolved']]);

        $this->assertNotNull(
            $this->database()->table('linkrobins_support_tickets')->where('id', 1)->value('status_changed_at')
        );
    }

    #[Test]
    public function staff_see_status_and_assignment_history(): void
    {
        $this->patch(3, ['relationships' => ['assignedStaff' => ['data' => ['type' => 'users', 'id' => '3']]]]);
        $this->patch(3, ['attributes' => ['status' => 'resolved']]);

        $types = array_map(fn ($e) => $e['attributes']['type'], $this->historyAs(3));
        sort($types);
        $this->assertEquals(['assignment', 'status'], $types);
    }

    #[Test]
    public function the_owner_sees_status_changes_but_not_assignments(): void
    {
        $this->patch(3, ['relationships' => ['assignedStaff' => ['data' => ['type' => 'users', 'id' => '3']]]]);
        $this->patch(3, ['attributes' => ['status' => 'resolved']]);

        $types = array_map(fn ($e) => $e['attributes']['type'], $this->historyAs(2));
        $this->assertEquals(['status'], $types);
    }

    #[Test]
    public function another_member_sees_none_of_it(): void
    {
        $this->patch(3, ['attributes' => ['status' => 'resolved']]);

        $this->assertEquals([], $this->historyAs(4));
    }

    #[Test]
    public function a_guest_cannot_list_history(): void
    {
        $this->patch(3, ['attributes' => ['status' => 'resolved']]);

        $this->assertEquals([['status' => 401]], $this->historyAs(null));
    }

    #[Test]
    public function saving_without_changing_status_or_assignee_records_nothing(): void
    {
        $this->patch(3, ['attributes' => ['subject' => 'Renamed']]);

        $this->assertEquals(0, $this->database()->table('linkrobins_support_events')->count());
    }
}
