<?php

/*
 * This file is part of linkrobins/support.
 *
 * For detailed copyright and license information, please view the
 * LICENSE file that was distributed with this source code.
 */

namespace LinkRobins\Support\Tests\integration\api;

use Carbon\Carbon;
use Flarum\Group\Group;
use Flarum\Testing\integration\RetrievesAuthorizedUsers;
use Flarum\Testing\integration\TestCase;
use PHPUnit\Framework\Attributes\Test;

/**
 * A category can route its new tickets to one staff member. When it does, that
 * person is assigned the ticket and is the only one notified; when it does
 * not, the ticket arrives unassigned and every staff member is notified.
 *
 * The notification half is the part worth guarding: the failure mode is a
 * ticket nobody is told about, which is invisible until a customer complains.
 */
class CategoryDefaultAssigneeTest extends TestCase
{
    use RetrievesAuthorizedUsers;

    /**
     * Notifying N people costs N user lookups inside Flarum itself:
     * EmailNotificationDriver walks the recipient list and queues a mail job
     * per user, each of which loads that user. This is the first test case
     * here to notify a whole staff list rather than one or two people, so it
     * is the first to cross the repeated-query threshold -- on core's query,
     * not ours. The extension's own contribution to this shape is a single
     * lookup of the category's configured assignee, and only when one is set.
     *
     * Scoped to that one shape so everything else in these requests stays
     * covered by the detector.
     *
     * @return string[]
     */
    protected function allowedRepeatedQueries(): array
    {
        return ['from `users` where `users`.`id` ='];
    }

    public function setUp(): void
    {
        parent::setUp();

        $this->extension('linkrobins-support');

        $this->prepareDatabase([
            'users' => [
                $this->normalUser(), // id 2, the person filing tickets
                ['id' => 3, 'username' => 'staffa', 'email' => 'staffa@machine.local', 'is_email_confirmed' => 1, 'password' => 'too-obscure'],
                ['id' => 4, 'username' => 'staffb', 'email' => 'staffb@machine.local', 'is_email_confirmed' => 1, 'password' => 'too-obscure'],
                ['id' => 5, 'username' => 'civilian', 'email' => 'civilian@machine.local', 'is_email_confirmed' => 1, 'password' => 'too-obscure'],
            ],
            // Users 3 and 4 are staff through the moderator group's
            // handle_tickets permission, not by being administrators -- the
            // notifier has to find both kinds.
            'groups' => [
                ['id' => 100, 'name_singular' => 'Support', 'name_plural' => 'Support', 'is_hidden' => 0],
            ],
            'group_user' => [
                ['user_id' => 3, 'group_id' => 100],
                ['user_id' => 4, 'group_id' => 100],
            ],
            'group_permission' => [
                ['group_id' => 100, 'permission' => 'linkrobins-support.handle_tickets'],
            ],
            'linkrobins_support_categories' => [
                ['id' => 1, 'name' => 'Unrouted', 'slug' => 'unrouted', 'is_appeal' => 0, 'position' => 0, 'default_assignee_id' => null, 'created_at' => Carbon::now(), 'updated_at' => Carbon::now()],
                ['id' => 2, 'name' => 'Routed', 'slug' => 'routed', 'is_appeal' => 0, 'position' => 1, 'default_assignee_id' => 4, 'created_at' => Carbon::now(), 'updated_at' => Carbon::now()],
                ['id' => 3, 'name' => 'Stale', 'slug' => 'stale', 'is_appeal' => 0, 'position' => 2, 'default_assignee_id' => 5, 'created_at' => Carbon::now(), 'updated_at' => Carbon::now()],
            ],
        ]);
    }

    private function openTicketIn(int $categoryId, int $actorId = 2): int
    {
        $response = $this->send(
            $this->request('POST', '/api/linkrobins-support-tickets', [
                'authenticatedAs' => $actorId,
                'json' => [
                    'data' => [
                        'attributes' => ['subject' => 'Help', 'firstPost' => 'Please help.'],
                        'relationships' => [
                            'category' => ['data' => ['type' => 'linkrobins-support-categories', 'id' => (string) $categoryId]],
                        ],
                    ],
                ],
            ])
        );

        // Read the stream once: getContents() leaves the pointer at EOF, so a
        // second call returns an empty string and the id silently becomes 0.
        $body = (string) $response->getBody();

        $this->assertEquals(201, $response->getStatusCode(), $body);

        return (int) json_decode($body, true)['data']['id'];
    }

    /**
     * @return list<int> user ids notified about the given ticket, sorted
     */
    private function notifiedAbout(int $ticketId): array
    {
        $ids = $this->database()->table('notifications')
            ->where('type', 'linkrobinsSupportNewTicket')
            ->where('subject_id', $ticketId)
            ->pluck('user_id')
            ->map(fn ($id) => (int) $id)
            ->all();

        sort($ids);

        return $ids;
    }

    private function assigneeOf(int $ticketId): ?int
    {
        $value = $this->database()->table('linkrobins_support_tickets')
            ->where('id', $ticketId)
            ->value('assigned_staff_id');

        return $value === null ? null : (int) $value;
    }

    #[Test]
    public function a_routed_category_assigns_the_ticket_to_its_default_assignee(): void
    {
        $ticketId = $this->openTicketIn(2);

        $this->assertEquals(4, $this->assigneeOf($ticketId));
    }

    #[Test]
    public function a_routed_category_notifies_only_the_assignee(): void
    {
        $ticketId = $this->openTicketIn(2);

        $this->assertEquals([4], $this->notifiedAbout($ticketId), 'Routing a category should keep the rest of the staff out of it.');
    }

    #[Test]
    public function an_unrouted_category_leaves_the_ticket_unassigned(): void
    {
        $ticketId = $this->openTicketIn(1);

        $this->assertNull($this->assigneeOf($ticketId));
    }

    #[Test]
    public function an_unrouted_category_notifies_every_staff_member(): void
    {
        $ticketId = $this->openTicketIn(1);

        // 1 is the default administrator; 3 and 4 hold handle_tickets. 2 filed
        // it and 5 is not staff, so neither hears about it.
        $this->assertEquals([1, 3, 4], $this->notifiedAbout($ticketId));
    }

    #[Test]
    public function a_default_assignee_who_is_no_longer_staff_falls_back_to_everyone(): void
    {
        // Category 3 points at user 5, who has no staff permission at all --
        // the state you land in by removing someone from the support group
        // months after routing a category to them. The ticket must not be
        // parked on them with only them notified.
        $ticketId = $this->openTicketIn(3);

        $this->assertNull($this->assigneeOf($ticketId), 'A non-staff default assignee must not be applied.');
        $this->assertEquals([1, 3, 4], $this->notifiedAbout($ticketId), 'Stale routing must fail open to the whole staff list.');
    }

    #[Test]
    public function a_staff_member_filing_into_their_own_queue_is_not_notified(): void
    {
        // User 4 files into the category routed to user 4. They are assigned
        // it, as configured, but notifying them about their own ticket would
        // be noise -- and the all-staff fallback would be worse, since the
        // routing is working exactly as intended.
        $ticketId = $this->openTicketIn(2, actorId: 4);

        $this->assertEquals(4, $this->assigneeOf($ticketId));
        $this->assertEquals([], $this->notifiedAbout($ticketId));
    }

    #[Test]
    public function opening_a_ticket_sends_exactly_one_notification_per_recipient(): void
    {
        // The opening message is posted as a reply, so before this was guarded
        // every new ticket produced both a new-ticket and a new-reply
        // notification for the same words -- two alerts and two emails. On a
        // routed category the reply half also went to the whole staff list,
        // which would have quietly undone the routing.
        $ticketId = $this->openTicketIn(2);

        $rows = $this->database()->table('notifications')
            ->where('subject_id', $ticketId)
            ->orWhereIn('type', ['linkrobinsSupportNewReply'])
            ->get();

        $this->assertCount(1, $rows, 'A new ticket should notify each recipient once, not once per notification type.');
        $this->assertEquals('linkrobinsSupportNewTicket', $rows[0]->type);
        $this->assertEquals(4, (int) $rows[0]->user_id);
    }

    #[Test]
    public function a_later_reply_still_notifies(): void
    {
        // Guards the opening-message suppression against over-reaching: only
        // the first reply is covered by the new-ticket notification.
        $ticketId = $this->openTicketIn(1);

        $response = $this->send(
            $this->request('POST', '/api/linkrobins-support-replies', [
                'authenticatedAs' => 2,
                'json' => [
                    'data' => [
                        'attributes' => ['content' => 'Any news?'],
                        'relationships' => [
                            'ticket' => ['data' => ['type' => 'linkrobins-support-tickets', 'id' => (string) $ticketId]],
                        ],
                    ],
                ],
            ])
        );

        $this->assertEquals(201, $response->getStatusCode(), (string) $response->getBody());

        $replyNotifications = $this->database()->table('notifications')
            ->where('type', 'linkrobinsSupportNewReply')
            ->pluck('user_id')
            ->map(fn ($id) => (int) $id)
            ->all();
        sort($replyNotifications);

        $this->assertEquals([1, 3, 4], $replyNotifications);
    }

    #[Test]
    public function an_admin_can_route_a_category_at_a_staff_member(): void
    {
        $response = $this->send(
            $this->request('PATCH', '/api/linkrobins-support-categories/1', [
                'authenticatedAs' => 1,
                'json' => [
                    'data' => [
                        'relationships' => [
                            'defaultAssignee' => ['data' => ['type' => 'users', 'id' => '3']],
                        ],
                    ],
                ],
            ])
        );

        $this->assertEquals(200, $response->getStatusCode(), (string) $response->getBody());
        $this->assertEquals(3, (int) $this->database()->table('linkrobins_support_categories')->where('id', 1)->value('default_assignee_id'));
    }

    #[Test]
    public function a_category_cannot_be_routed_at_a_non_staff_user(): void
    {
        $response = $this->send(
            $this->request('PATCH', '/api/linkrobins-support-categories/1', [
                'authenticatedAs' => 1,
                'json' => [
                    'data' => [
                        'relationships' => [
                            'defaultAssignee' => ['data' => ['type' => 'users', 'id' => '5']],
                        ],
                    ],
                ],
            ])
        );

        $this->assertEquals(400, $response->getStatusCode());
        $this->assertNull($this->database()->table('linkrobins_support_categories')->where('id', 1)->value('default_assignee_id'));
    }

    #[Test]
    public function routing_can_be_cleared_back_to_nobody(): void
    {
        $response = $this->send(
            $this->request('PATCH', '/api/linkrobins-support-categories/2', [
                'authenticatedAs' => 1,
                'json' => [
                    'data' => [
                        'relationships' => [
                            'defaultAssignee' => ['data' => null],
                        ],
                    ],
                ],
            ])
        );

        $this->assertEquals(200, $response->getStatusCode(), (string) $response->getBody());
        $this->assertNull($this->database()->table('linkrobins_support_categories')->where('id', 2)->value('default_assignee_id'));
    }

    #[Test]
    public function a_non_staff_user_cannot_see_who_a_category_routes_to(): void
    {
        // The category list is public to anyone opening a ticket. Which human
        // is behind a queue is internal routing, not part of that.
        $response = $this->send(
            $this->request('GET', '/api/linkrobins-support-categories', ['authenticatedAs' => 2])
        );

        $this->assertEquals(200, $response->getStatusCode());

        $body = json_decode((string) $response->getBody(), true);
        foreach ($body['data'] as $category) {
            $this->assertArrayNotHasKey('defaultAssignee', $category['relationships'] ?? []);
        }
    }

    #[Test]
    public function staff_can_see_who_a_category_routes_to(): void
    {
        $response = $this->send(
            $this->request('GET', '/api/linkrobins-support-categories', ['authenticatedAs' => 3])
        );

        $this->assertEquals(200, $response->getStatusCode());

        $body = json_decode((string) $response->getBody(), true);
        $routed = collect($body['data'])->firstWhere('id', '2');

        $this->assertEquals('4', $routed['relationships']['defaultAssignee']['data']['id'] ?? null);
    }

    #[Test]
    public function the_staff_filter_lists_staff_only(): void
    {
        $response = $this->send(
            $this->request('GET', '/api/users', ['authenticatedAs' => 1])
                ->withQueryParams(['filter' => ['supportStaff' => '1']])
        );

        $this->assertEquals(200, $response->getStatusCode());

        $ids = array_map(
            fn ($user) => (int) $user['id'],
            json_decode((string) $response->getBody(), true)['data']
        );
        sort($ids);

        $this->assertEquals([1, 3, 4], $ids, 'The picker must offer exactly the users the notifier treats as staff.');
    }

    #[Test]
    public function the_staff_filter_is_ignored_for_non_staff(): void
    {
        // Otherwise it is a free "list every moderator on this forum" query.
        // Ignoring the filter (rather than erroring) matches how the
        // appeal-ban filter behaves, so the response is an unfiltered list.
        $response = $this->send(
            $this->request('GET', '/api/users', ['authenticatedAs' => 2])
                ->withQueryParams(['filter' => ['supportStaff' => '1']])
        );

        $this->assertEquals(200, $response->getStatusCode());

        $ids = array_map(
            fn ($user) => (int) $user['id'],
            json_decode((string) $response->getBody(), true)['data']
        );

        $this->assertContains(5, $ids, 'A non-staff actor must not get a filtered-down staff list.');
    }

    #[Test]
    public function group_ids_used_by_this_test_match_flarum(): void
    {
        // Guards the fixtures above: if core ever renumbered the admin group,
        // `notifies every staff member` would silently stop covering admins.
        $this->assertEquals(1, Group::ADMINISTRATOR_ID);
    }
}
