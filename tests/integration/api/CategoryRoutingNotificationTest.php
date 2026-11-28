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

class CategoryRoutingNotificationTest extends TestCase
{
    use RetrievesAuthorizedUsers;

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
                $this->normalUser(), // id 2, the ticket author
                ['id' => 3, 'username' => 'supporta', 'email' => 'supporta@machine.local', 'is_email_confirmed' => 1, 'password' => 'too-obscure'],
                ['id' => 4, 'username' => 'supportb', 'email' => 'supportb@machine.local', 'is_email_confirmed' => 1, 'password' => 'too-obscure'],
                ['id' => 5, 'username' => 'billinga', 'email' => 'billinga@machine.local', 'is_email_confirmed' => 1, 'password' => 'too-obscure'],
                ['id' => 6, 'username' => 'civilian', 'email' => 'civilian@machine.local', 'is_email_confirmed' => 1, 'password' => 'too-obscure'],
            ],
            'groups' => [
                ['id' => 100, 'name_singular' => 'Support', 'name_plural' => 'Support', 'is_hidden' => 0],
                ['id' => 101, 'name_singular' => 'Billing', 'name_plural' => 'Billing', 'is_hidden' => 0],
                ['id' => 102, 'name_singular' => 'Sales', 'name_plural' => 'Sales', 'is_hidden' => 0],
            ],
            'group_user' => [
                ['user_id' => 3, 'group_id' => 100],
                ['user_id' => 4, 'group_id' => 100],
                ['user_id' => 5, 'group_id' => 101],
                ['user_id' => 6, 'group_id' => 102],
            ],
            'group_permission' => [
                ['group_id' => 100, 'permission' => 'lr-support.handle_tickets'],
                ['group_id' => 101, 'permission' => 'lr-support.handle_tickets'],
            ],
            'linkrobins_support_categories' => [
                [
                    'id' => 1,
                    'name' => 'General',
                    'slug' => 'general',
                    'ticket_type' => 'standard',
                    'position' => 0,
                    'default_assignee_id' => null,
                    'default_assigned_group_id' => null,
                    'is_silent' => 0,
                    'created_at' => Carbon::now(),
                    'updated_at' => Carbon::now(),
                ],
                [
                    'id' => 2,
                    'name' => 'Silent Feedback',
                    'slug' => 'silent-feedback',
                    'ticket_type' => 'standard',
                    'position' => 1,
                    'default_assignee_id' => null,
                    'default_assigned_group_id' => null,
                    'is_silent' => 1,
                    'created_at' => Carbon::now(),
                    'updated_at' => Carbon::now(),
                ],
                [
                    'id' => 3,
                    'name' => 'Billing',
                    'slug' => 'billing',
                    'ticket_type' => 'standard',
                    'position' => 2,
                    'default_assignee_id' => null,
                    'default_assigned_group_id' => 101,
                    'is_silent' => 0,
                    'created_at' => Carbon::now(),
                    'updated_at' => Carbon::now(),
                ],
                [
                    'id' => 4,
                    'name' => 'Non-Staff Routed',
                    'slug' => 'non-staff-routed',
                    'ticket_type' => 'standard',
                    'position' => 3,
                    'default_assignee_id' => null,
                    'default_assigned_group_id' => 102,
                    'is_silent' => 0,
                    'created_at' => Carbon::now(),
                    'updated_at' => Carbon::now(),
                ],
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
                        'attributes' => ['subject' => 'Need Help', 'firstPost' => 'Help description.'],
                        'relationships' => [
                            'category' => ['data' => ['type' => 'linkrobins-support-categories', 'id' => (string) $categoryId]],
                        ],
                    ],
                ],
            ])
        );

        $body = (string) $response->getBody();
        $this->assertEquals(201, $response->getStatusCode(), $body);

        return (int) json_decode($body, true)['data']['id'];
    }

    private function postReply(int $ticketId, int $actorId, string $content = 'Replying'): int
    {
        $response = $this->send(
            $this->request('POST', '/api/linkrobins-support-replies', [
                'authenticatedAs' => $actorId,
                'json' => [
                    'data' => [
                        'attributes' => ['content' => $content],
                        'relationships' => [
                            'ticket' => ['data' => ['type' => 'linkrobins-support-tickets', 'id' => (string) $ticketId]],
                        ],
                    ],
                ],
            ])
        );

        $body = (string) $response->getBody();
        $this->assertEquals(201, $response->getStatusCode(), $body);

        return (int) json_decode($body, true)['data']['id'];
    }

    private function setStatus(int $actorId, string $status, int $ticketId): int
    {
        $response = $this->send(
            $this->request('PATCH', '/api/linkrobins-support-tickets/' . $ticketId, [
                'authenticatedAs' => $actorId,
                'json' => [
                    'data' => [
                        'type' => 'linkrobins-support-tickets',
                        'id' => (string) $ticketId,
                        'attributes' => ['status' => $status],
                    ],
                ],
            ])
        );

        return $response->getStatusCode();
    }

    #[Test]
    public function ticket_in_silent_category_sends_no_staff_notifications(): void
    {
        $ticketId = $this->openTicketIn(2);

        $count = $this->database()->table('notifications')
            ->where('subject_id', $ticketId)
            ->where('type', 'linkrobinsSupportNewTicket')
            ->count();

        $this->assertEquals(0, $count, 'Silent category should produce zero new-ticket notifications.');
    }

    #[Test]
    public function user_reply_in_silent_category_sends_no_staff_notifications(): void
    {
        $ticketId = $this->openTicketIn(2);

        $this->postReply($ticketId, 2, 'Follow up from user');

        $count = $this->database()->table('notifications')
            ->where('type', 'linkrobinsSupportNewReply')
            ->count();

        $this->assertEquals(0, $count, 'User reply to unassigned ticket in silent category should produce zero notifications.');
    }

    #[Test]
    public function staff_reply_in_silent_category_still_notifies_ticket_owner(): void
    {
        $ticketId = $this->openTicketIn(2);

        // Staff (user 3) replies to the ticket
        $this->postReply($ticketId, 3, 'Hello, here is help from staff.');

        $recipients = $this->database()->table('notifications')
            ->where('type', 'linkrobinsSupportNewReply')
            ->pluck('user_id')
            ->map(fn ($id) => (int) $id)
            ->all();

        $this->assertEquals([2], $recipients, 'Staff reply in silent category must still notify the ticket owner.');
    }

    #[Test]
    public function ticket_in_group_routed_category_notifies_only_that_group(): void
    {
        $ticketId = $this->openTicketIn(3);

        $recipients = $this->database()->table('notifications')
            ->where('subject_id', $ticketId)
            ->where('type', 'linkrobinsSupportNewTicket')
            ->pluck('user_id')
            ->map(fn ($id) => (int) $id)
            ->all();
        sort($recipients);

        // Category 3 is routed to Group 101 (Billing). User 5 is the only staff in Group 101.
        // Users 1 (Admin), 3, and 4 (Support) must not be spammed.
        $this->assertEquals([5], $recipients, 'Group routed category should only notify members of that group.');
    }

    #[Test]
    public function user_reply_to_unassigned_group_routed_ticket_notifies_only_that_group(): void
    {
        $ticketId = $this->openTicketIn(3);

        $this->postReply($ticketId, 2, 'Follow up question for billing.');

        $recipients = $this->database()->table('notifications')
            ->where('type', 'linkrobinsSupportNewReply')
            ->pluck('user_id')
            ->map(fn ($id) => (int) $id)
            ->all();
        sort($recipients);

        $this->assertEquals([5], $recipients, 'User reply to unassigned ticket routed to a group should only notify that group.');
    }

    #[Test]
    public function admin_can_update_category_routing_options_via_api(): void
    {
        // 1. Set to silent
        $response1 = $this->send(
            $this->request('PATCH', '/api/linkrobins-support-categories/1', [
                'authenticatedAs' => 1,
                'json' => [
                    'data' => [
                        'attributes' => ['isSilent' => true],
                    ],
                ],
            ])
        );
        $this->assertEquals(200, $response1->getStatusCode());
        $this->assertEquals(1, (int) $this->database()->table('linkrobins_support_categories')->where('id', 1)->value('is_silent'));
        $data1 = json_decode((string) $response1->getBody(), true)['data'];
        $this->assertTrue($data1['attributes']['isSilent']);

        // 2. Route to group
        $response2 = $this->send(
            $this->request('PATCH', '/api/linkrobins-support-categories/1', [
                'authenticatedAs' => 1,
                'json' => [
                    'data' => [
                        'attributes' => ['isSilent' => false],
                        'relationships' => [
                            'defaultAssignedGroup' => ['data' => ['type' => 'groups', 'id' => '101']],
                        ],
                    ],
                ],
            ])
        );
        $this->assertEquals(200, $response2->getStatusCode());
        $this->assertEquals(0, (int) $this->database()->table('linkrobins_support_categories')->where('id', 1)->value('is_silent'));
        $this->assertEquals(101, (int) $this->database()->table('linkrobins_support_categories')->where('id', 1)->value('default_assigned_group_id'));

        // 3. Clear group routing back to null
        $response3 = $this->send(
            $this->request('PATCH', '/api/linkrobins-support-categories/1', [
                'authenticatedAs' => 1,
                'json' => [
                    'data' => [
                        'relationships' => [
                            'defaultAssignedGroup' => ['data' => null],
                        ],
                    ],
                ],
            ])
        );
        $this->assertEquals(200, $response3->getStatusCode());
        $this->assertNull($this->database()->table('linkrobins_support_categories')->where('id', 1)->value('default_assigned_group_id'));
    }

    #[Test]
    public function user_reopening_ticket_in_silent_category_sends_no_staff_notifications(): void
    {
        $ticketId = $this->openTicketIn(2);

        // Staff (user 3) closes it
        $this->assertEquals(200, $this->setStatus(3, 'closed', $ticketId));
        $this->database()->table('notifications')->delete();

        // Owner (user 2) reopens it
        $this->assertEquals(200, $this->setStatus(2, 'open', $ticketId));

        $count = $this->database()->table('notifications')
            ->where('type', 'linkrobinsSupportTicketStatusChanged')
            ->count();

        $this->assertEquals(0, $count, 'Reopening a ticket in a silent category must produce zero staff notifications.');
    }

    #[Test]
    public function user_reopening_ticket_in_group_routed_category_notifies_only_that_group(): void
    {
        $ticketId = $this->openTicketIn(3);

        // Staff (user 5) closes it
        $this->assertEquals(200, $this->setStatus(5, 'closed', $ticketId));
        $this->database()->table('notifications')->delete();

        // Owner (user 2) reopens it
        $this->assertEquals(200, $this->setStatus(2, 'open', $ticketId));

        $recipients = $this->database()->table('notifications')
            ->where('type', 'linkrobinsSupportTicketStatusChanged')
            ->pluck('user_id')
            ->map(fn ($id) => (int) $id)
            ->all();
        sort($recipients);

        $this->assertEquals([5], $recipients, 'Reopening ticket in group-routed category should only notify that group.');
    }

    #[Test]
    public function user_reply_to_assigned_ticket_in_silent_category_notifies_assignee(): void
    {
        $ticketId = $this->openTicketIn(2);

        // Staff assigns ticket to Support Staff A (user 3)
        $this->send(
            $this->request('PATCH', "/api/linkrobins-support-tickets/{$ticketId}", [
                'authenticatedAs' => 1,
                'json' => [
                    'data' => [
                        'relationships' => [
                            'assignedStaff' => ['data' => ['type' => 'users', 'id' => '3']],
                        ],
                    ],
                ],
            ])
        );
        $this->database()->table('notifications')->delete();

        // User 2 replies to their assigned ticket
        $this->postReply($ticketId, 2, 'Replying to assigned staff in silent category');

        $recipients = $this->database()->table('notifications')
            ->where('type', 'linkrobinsSupportNewReply')
            ->pluck('user_id')
            ->map(fn ($id) => (int) $id)
            ->all();

        $this->assertEquals([3], $recipients, 'User reply on assigned ticket in silent category should notify the assignee.');
    }

    #[Test]
    public function routed_group_with_no_staff_falls_back_to_all_staff(): void
    {
        // Category 4 routes to Group 102 (Sales), which contains only User 6 (lacks lr-support.handle_tickets).
        $ticketId = $this->openTicketIn(4);

        $recipients = $this->database()->table('notifications')
            ->where('subject_id', $ticketId)
            ->where('type', 'linkrobinsSupportNewTicket')
            ->pluck('user_id')
            ->map(fn ($id) => (int) $id)
            ->all();
        sort($recipients);

        // Staff members are 1 (Admin), 3 (Support), 4 (Support), 5 (Billing).
        // Since Group 102 has no staff members, it must fall back to all staff.
        $this->assertEquals([1, 3, 4, 5], $recipients, 'A routed group with no staff must fall back to notifying all staff.');
        $this->assertNotContains(6, $recipients, 'Non-staff members must not receive ticket notifications.');

        // User reply to this unassigned ticket should also fall back to all staff
        $this->database()->table('notifications')->delete();
        $this->postReply($ticketId, 2, 'Follow up from user');

        $replyRecipients = $this->database()->table('notifications')
            ->where('type', 'linkrobinsSupportNewReply')
            ->pluck('user_id')
            ->map(fn ($id) => (int) $id)
            ->all();
        sort($replyRecipients);

        $this->assertEquals([1, 3, 4, 5], $replyRecipients, 'Replies in category with staff-less group must fall back to all staff.');
    }

    #[Test]
    public function deleted_routed_group_falls_back_to_all_staff(): void
    {
        // Create a temporary group 103 and route Category 1 to it
        $this->database()->table('groups')->insert([
            'id' => 103,
            'name_singular' => 'Temporary',
            'name_plural' => 'Temporary',
            'is_hidden' => 0,
        ]);
        $this->database()->table('group_permission')->insert([
            'group_id' => 103,
            'permission' => 'lr-support.handle_tickets',
        ]);
        $this->database()->table('group_user')->insert([
            'user_id' => 3,
            'group_id' => 103,
        ]);

        $this->database()->table('linkrobins_support_categories')->where('id', 1)->update([
            'default_assigned_group_id' => 103,
        ]);

        // Delete group 103 from the database
        $this->database()->table('groups')->where('id', 103)->delete();

        // Opening a ticket in Category 1 should fall back to all staff rather than silencing notifications
        $ticketId = $this->openTicketIn(1);

        $recipients = $this->database()->table('notifications')
            ->where('subject_id', $ticketId)
            ->where('type', 'linkrobinsSupportNewTicket')
            ->pluck('user_id')
            ->map(fn ($id) => (int) $id)
            ->all();
        sort($recipients);

        $this->assertEquals([1, 3, 4, 5], $recipients, 'Deleted routed group must fall back to notifying all staff.');

        // Replies must also fall back to all staff
        $this->database()->table('notifications')->delete();
        $this->postReply($ticketId, 2, 'User replies to ticket with deleted group');

        $replyRecipients = $this->database()->table('notifications')
            ->where('type', 'linkrobinsSupportNewReply')
            ->pluck('user_id')
            ->map(fn ($id) => (int) $id)
            ->all();
        sort($replyRecipients);

        $this->assertEquals([1, 3, 4, 5], $replyRecipients, 'Replies in category with deleted routed group must fall back to all staff.');
    }

    #[Test]
    public function staff_filing_ticket_into_routed_group_is_not_self_notified(): void
    {
        // User 5 (Billing staff) opens a ticket in Category 3 (routed to Billing group).
        $ticketId = $this->openTicketIn(3, actorId: 5);

        $recipients = $this->database()->table('notifications')
            ->where('subject_id', $ticketId)
            ->where('type', 'linkrobinsSupportNewTicket')
            ->pluck('user_id')
            ->map(fn ($id) => (int) $id)
            ->all();

        // User 5 is the sole staff member in Billing and also the ticket author:
        // self-suppression must leave zero recipients rather than broadcasting to all staff.
        $this->assertEmpty($recipients, 'Sole staff member in a routed group filing a ticket must not self-notify or fall back to all staff.');

        // When another staff member (User 4) is also in Billing, only User 4 should be notified.
        $this->database()->table('group_user')->insert([
            'user_id' => 4,
            'group_id' => 101,
        ]);

        $secondTicketId = $this->openTicketIn(3, actorId: 5);

        $secondRecipients = $this->database()->table('notifications')
            ->where('subject_id', $secondTicketId)
            ->where('type', 'linkrobinsSupportNewTicket')
            ->pluck('user_id')
            ->map(fn ($id) => (int) $id)
            ->all();
        sort($secondRecipients);

        $this->assertEquals([4], $secondRecipients, 'Opening a ticket into a multi-member routed group should notify only the other group members.');
    }

    #[Test]
    public function unassigning_or_demoting_assignee_in_silent_category_falls_back_to_silent(): void
    {
        $ticketId = $this->openTicketIn(2);

        // 1. Explicitly assigning a ticket in a silent category notifies the assignee.
        $assignResponse = $this->send(
            $this->request('PATCH', "/api/linkrobins-support-tickets/{$ticketId}", [
                'authenticatedAs' => 1,
                'json' => [
                    'data' => [
                        'relationships' => [
                            'assignedStaff' => ['data' => ['type' => 'users', 'id' => '3']],
                        ],
                    ],
                ],
            ])
        );
        $this->assertEquals(200, $assignResponse->getStatusCode(), (string) $assignResponse->getBody());

        $assignedRecipients = $this->database()->table('notifications')
            ->where('subject_id', $ticketId)
            ->where('type', 'linkrobinsSupportTicketAssigned')
            ->pluck('user_id')
            ->map(fn ($id) => (int) $id)
            ->all();
        $this->assertEquals([3], $assignedRecipients, 'Explicit assignment in a silent category must notify the assignee.');

        // Customer reply to the explicitly assigned ticket in a silent category notifies only the assignee.
        $this->database()->table('notifications')->delete();
        $this->postReply($ticketId, 2, 'Customer follow-up on assigned silent ticket');
        $assignedReplyRecipients = $this->database()->table('notifications')
            ->where('type', 'linkrobinsSupportNewReply')
            ->pluck('user_id')
            ->map(fn ($id) => (int) $id)
            ->all();
        $this->assertEquals([3], $assignedReplyRecipients, 'User reply on explicitly assigned ticket in silent category must notify the assignee.');

        // 2. Unassigning falls back to silent mode (no all-staff broadcast on reply).
        $this->database()->table('notifications')->delete();
        $unassignResponse = $this->send(
            $this->request('PATCH', "/api/linkrobins-support-tickets/{$ticketId}", [
                'authenticatedAs' => 1,
                'json' => [
                    'data' => [
                        'relationships' => [
                            'assignedStaff' => ['data' => null],
                        ],
                    ],
                ],
            ])
        );
        $this->assertEquals(200, $unassignResponse->getStatusCode(), (string) $unassignResponse->getBody());

        $this->postReply($ticketId, 2, 'Reply after unassign');
        $this->assertEquals(
            0,
            $this->database()->table('notifications')->where('type', 'linkrobinsSupportNewReply')->count(),
            'Unassigned ticket in silent category must fall back to silent after unassigning.'
        );

        // 3. Re-assigning to a user who subsequently loses staff permissions also falls back to silent.
        $this->database()->table('linkrobins_support_tickets')->where('id', $ticketId)->update(['assigned_staff_id' => 3]);
        $this->database()->table('group_user')->where('user_id', 3)->delete();
        $this->database()->table('notifications')->delete();

        $this->postReply($ticketId, 2, 'Reply after assignee demotion');
        $this->assertEquals(
            0,
            $this->database()->table('notifications')->where('type', 'linkrobinsSupportNewReply')->count(),
            'Demoted assignee in silent category must fall back to silent rather than broadcasting to all staff.'
        );
    }

    #[Test]
    public function staff_reply_auto_claims_group_routed_ticket_and_narrows_future_replies(): void
    {
        $this->database()->table('group_user')->insert([
            'user_id' => 4,
            'group_id' => 101,
        ]);

        $ticketId = $this->openTicketIn(3);

        $newTicketRecipients = $this->database()->table('notifications')
            ->where('subject_id', $ticketId)
            ->where('type', 'linkrobinsSupportNewTicket')
            ->pluck('user_id')
            ->map(fn ($id) => (int) $id)
            ->all();
        sort($newTicketRecipients);
        $this->assertEquals([4, 5], $newTicketRecipients, 'New ticket should notify both members of the routed Billing group.');

        // User 5 replies first and auto-claims the ticket.
        $this->database()->table('notifications')->delete();
        $this->postReply($ticketId, 5, 'I will take this');

        $staffReplyRecipients = $this->database()->table('notifications')
            ->where('type', 'linkrobinsSupportNewReply')
            ->pluck('user_id')
            ->map(fn ($id) => (int) $id)
            ->all();
        $this->assertEquals([2], $staffReplyRecipients, 'Staff reply should notify the ticket owner.');

        // Subsequent user reply must go only to the claiming assignee (User 5), not User 4.
        $this->database()->table('notifications')->delete();
        $this->postReply($ticketId, 2, 'Thanks User 5');

        $followUpRecipients = $this->database()->table('notifications')
            ->where('type', 'linkrobinsSupportNewReply')
            ->pluck('user_id')
            ->map(fn ($id) => (int) $id)
            ->all();
        $this->assertEquals([5], $followUpRecipients, 'User follow-up after auto-claim must notify only the claiming staff member.');
    }

    #[Test]
    public function demoted_assignee_in_group_routed_category_falls_back_to_routed_group(): void
    {
        $ticketId = $this->openTicketIn(3);

        $this->database()->table('linkrobins_support_tickets')->where('id', $ticketId)->update(['assigned_staff_id' => 3]);
        $this->database()->table('group_user')->where('user_id', 3)->delete();
        $this->database()->table('notifications')->delete();

        $this->postReply($ticketId, 2, 'Reply after assignee lost staff group');

        $replyRecipients = $this->database()->table('notifications')
            ->where('type', 'linkrobinsSupportNewReply')
            ->pluck('user_id')
            ->map(fn ($id) => (int) $id)
            ->all();
        sort($replyRecipients);

        $this->assertEquals([5], $replyRecipients, 'Demoted assignee in a group-routed category should fall back to the routed group, not all staff.');
    }

    #[Test]
    public function staff_replying_to_own_unassigned_ticket_in_routed_group_does_not_self_notify_or_broadcast(): void
    {
        $ticketId = $this->openTicketIn(3, actorId: 5);

        $this->database()->table('linkrobins_support_tickets')->where('id', $ticketId)->update(['assigned_staff_id' => null]);
        $this->database()->table('notifications')->delete();

        $this->postReply($ticketId, 5, 'Adding more context');

        $this->assertEquals(
            0,
            $this->database()->table('notifications')->where('type', 'linkrobinsSupportNewReply')->count(),
            'Sole group staff replying to their own unassigned ticket must neither self-notify nor broadcast to all staff.'
        );
    }

    #[Test]
    public function status_changes_in_silent_and_group_routed_categories_respect_routing(): void
    {
        // Silent category: resolving notifies owner [2], owner confirming solved notifies nobody.
        $silentTicketId = $this->openTicketIn(2);
        $this->assertEquals(200, $this->setStatus(3, 'resolved', $silentTicketId));

        $silentResolveRecipients = $this->database()->table('notifications')
            ->where('type', 'linkrobinsSupportTicketStatusChanged')
            ->pluck('user_id')
            ->map(fn ($id) => (int) $id)
            ->all();
        $this->assertEquals([2], $silentResolveRecipients, 'Staff resolving a silent ticket must still notify the ticket owner.');

        $this->database()->table('notifications')->delete();
        $this->assertEquals(200, $this->setStatus(2, 'closed', $silentTicketId));
        $this->assertEquals(
            0,
            $this->database()->table('notifications')->where('type', 'linkrobinsSupportTicketStatusChanged')->count(),
            'Owner confirming solved in a silent category must not notify staff.'
        );

        // Group-routed category: owner confirming solved notifies only that group ([5]).
        $billingTicketId = $this->openTicketIn(3);
        $this->assertEquals(200, $this->setStatus(5, 'resolved', $billingTicketId));
        $this->database()->table('notifications')->delete();

        $this->assertEquals(200, $this->setStatus(2, 'closed', $billingTicketId));
        $billingCloseRecipients = $this->database()->table('notifications')
            ->where('type', 'linkrobinsSupportTicketStatusChanged')
            ->pluck('user_id')
            ->map(fn ($id) => (int) $id)
            ->all();
        $this->assertEquals([5], $billingCloseRecipients, 'Owner confirming solved in a group-routed category must notify only the routed group.');
    }

    #[Test]
    public function routing_fields_are_staff_only_and_reject_nonexistent_group(): void
    {
        $invalidGroupResponse = $this->send(
            $this->request('PATCH', '/api/linkrobins-support-categories/1', [
                'authenticatedAs' => 1,
                'json' => [
                    'data' => [
                        'relationships' => [
                            'defaultAssignedGroup' => ['data' => ['type' => 'groups', 'id' => '999']],
                        ],
                    ],
                ],
            ])
        );
        $this->assertEquals(404, $invalidGroupResponse->getStatusCode(), (string) $invalidGroupResponse->getBody());
        $this->assertNull($this->database()->table('linkrobins_support_categories')->where('id', 1)->value('default_assigned_group_id'));

        // Guests must not see isSilent or defaultAssignedGroup.
        $guestResponse = $this->send(
            $this->request('GET', '/api/linkrobins-support-categories')
        );
        $this->assertEquals(200, $guestResponse->getStatusCode(), (string) $guestResponse->getBody());
        $guestBody = json_decode((string) $guestResponse->getBody(), true);
        foreach ($guestBody['data'] as $category) {
            $this->assertArrayNotHasKey('isSilent', $category['attributes'] ?? []);
            $this->assertArrayNotHasKey('defaultAssignedGroup', $category['relationships'] ?? []);
        }

        // Non-staff user must not see isSilent or defaultAssignedGroup.
        $nonStaffResponse = $this->send(
            $this->request('GET', '/api/linkrobins-support-categories', ['authenticatedAs' => 2])
        );
        $this->assertEquals(200, $nonStaffResponse->getStatusCode(), (string) $nonStaffResponse->getBody());
        $nonStaffBody = json_decode((string) $nonStaffResponse->getBody(), true);
        foreach ($nonStaffBody['data'] as $category) {
            $this->assertArrayNotHasKey('isSilent', $category['attributes'] ?? []);
            $this->assertArrayNotHasKey('defaultAssignedGroup', $category['relationships'] ?? []);
        }

        // Staff user sees routing attributes and relationships.
        $staffResponse = $this->send(
            $this->request('GET', '/api/linkrobins-support-categories', ['authenticatedAs' => 3])
        );
        $this->assertEquals(200, $staffResponse->getStatusCode(), (string) $staffResponse->getBody());
        $staffCategories = collect(json_decode((string) $staffResponse->getBody(), true)['data']);

        $cat2 = $staffCategories->firstWhere('id', '2');
        $cat3 = $staffCategories->firstWhere('id', '3');
        $this->assertTrue($cat2['attributes']['isSilent'] ?? false);
        $this->assertEquals('101', $cat3['relationships']['defaultAssignedGroup']['data']['id'] ?? null);

        // API must reject combining isSilent with a default group or assignee.
        $conflictResponse = $this->send(
            $this->request('PATCH', '/api/linkrobins-support-categories/1', [
                'authenticatedAs' => 1,
                'json' => [
                    'data' => [
                        'attributes' => ['isSilent' => true],
                        'relationships' => [
                            'defaultAssignedGroup' => ['data' => ['type' => 'groups', 'id' => '101']],
                        ],
                    ],
                ],
            ])
        );
        $this->assertEquals(400, $conflictResponse->getStatusCode(), (string) $conflictResponse->getBody());
        $this->assertEquals(0, (int) $this->database()->table('linkrobins_support_categories')->where('id', 1)->value('is_silent'));
        $this->assertNull($this->database()->table('linkrobins_support_categories')->where('id', 1)->value('default_assigned_group_id'));

        // Assigning a group to an already-silent category without isSilent=false returns 400.
        $silentGroupConflict = $this->send(
            $this->request('PATCH', '/api/linkrobins-support-categories/2', [
                'authenticatedAs' => 1,
                'json' => [
                    'data' => [
                        'relationships' => [
                            'defaultAssignedGroup' => ['data' => ['type' => 'groups', 'id' => '101']],
                        ],
                    ],
                ],
            ])
        );
        $this->assertEquals(400, $silentGroupConflict->getStatusCode(), (string) $silentGroupConflict->getBody());

        // Switching a routed category to silent without relationships clears its previous routing.
        $switchToSilent = $this->send(
            $this->request('PATCH', '/api/linkrobins-support-categories/3', [
                'authenticatedAs' => 1,
                'json' => [
                    'data' => [
                        'attributes' => ['isSilent' => true],
                    ],
                ],
            ])
        );
        $this->assertEquals(200, $switchToSilent->getStatusCode(), (string) $switchToSilent->getBody());
        $this->assertEquals(1, (int) $this->database()->table('linkrobins_support_categories')->where('id', 3)->value('is_silent'));
        $this->assertNull($this->database()->table('linkrobins_support_categories')->where('id', 3)->value('default_assigned_group_id'));
    }
}
