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
    public function user_reply_to_assigned_ticket_notifies_only_the_assignee(): void
    {
        $ticketId = $this->openTicketIn(1);

        // Admin (user 1) assigns the ticket to Support Staff A (user 3)
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

        // User 2 replies to their ticket
        $this->postReply($ticketId, 2, 'Thanks, here are more details.');

        $replyRecipients = $this->database()->table('notifications')
            ->where('type', 'linkrobinsSupportNewReply')
            ->pluck('user_id')
            ->map(fn ($id) => (int) $id)
            ->all();
        sort($replyRecipients);

        // Only user 3 (assignee) should be notified. Admin (1), Staff B (4), Billing (5) must not receive this.
        $this->assertEquals([3], $replyRecipients, 'User reply to assigned ticket should notify only the assigned staff member.');
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
    public function driver_filtering_drops_recipients_who_disabled_all_notification_drivers(): void
    {
        // User 3 mutes alert and email drivers for new ticket notifications
        $this->database()->table('users')->where('id', 3)->update([
            'preferences' => json_encode([
                'notify_linkrobinsSupportNewTicket_alert' => false,
                'notify_linkrobinsSupportNewTicket_email' => false,
            ]),
        ]);

        $ticketId = $this->openTicketIn(1);

        $recipients = $this->database()->table('notifications')
            ->where('subject_id', $ticketId)
            ->where('type', 'linkrobinsSupportNewTicket')
            ->pluck('user_id')
            ->map(fn ($id) => (int) $id)
            ->all();
        sort($recipients);

        // Staff members are 1 (Admin), 3, 4 (Support), 5 (Billing).
        // User 3 disabled all drivers for this type, so only [1, 4, 5] remain.
        $this->assertEquals([1, 4, 5], $recipients, 'User who disabled all drivers should be excluded from notification delivery.');
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
    public function auto_assigned_ticket_in_silent_category_notifies_the_assignee_on_creation(): void
    {
        // Category with default_assignee_id = 3 and is_silent = 1
        $this->database()->table('linkrobins_support_categories')->insert([
            'id' => 5,
            'name' => 'Silent Auto-Assigned',
            'slug' => 'silent-auto-assigned',
            'ticket_type' => 'standard',
            'position' => 4,
            'default_assignee_id' => 3,
            'default_assigned_group_id' => null,
            'is_silent' => 1,
            'created_at' => Carbon::now(),
            'updated_at' => Carbon::now(),
        ]);

        $ticketId = $this->openTicketIn(5);

        // Verify ticket was auto-assigned to user 3
        $assigneeId = (int) $this->database()->table('linkrobins_support_tickets')
            ->where('id', $ticketId)
            ->value('assigned_staff_id');
        $this->assertEquals(3, $assigneeId);

        // User 3 (assignee) must be notified on creation despite the category being silent
        $recipients = $this->database()->table('notifications')
            ->where('subject_id', $ticketId)
            ->where('type', 'linkrobinsSupportNewTicket')
            ->pluck('user_id')
            ->map(fn ($id) => (int) $id)
            ->all();

        $this->assertEquals([3], $recipients, 'Auto-assigned ticket in silent category must notify the assignee on creation.');

        // User reply to this ticket must also notify the assignee
        $this->database()->table('notifications')->delete();
        $this->postReply($ticketId, 2, 'User reply to auto-assigned silent ticket');

        $replyRecipients = $this->database()->table('notifications')
            ->where('type', 'linkrobinsSupportNewReply')
            ->pluck('user_id')
            ->map(fn ($id) => (int) $id)
            ->all();

        $this->assertEquals([3], $replyRecipients, 'User reply on auto-assigned silent ticket must notify the assignee.');
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

        // User 5 filed the ticket, so they shouldn't be notified about their own ticket
        $this->assertNotContains(5, $recipients, 'Author filing ticket into their own group must not be notified.');
    }
}
