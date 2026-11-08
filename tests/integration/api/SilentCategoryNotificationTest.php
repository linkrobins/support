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
 * Silent categories suppress staff notifications so low-priority queues or
 * automated categories do not broadcast to all staff.
 *
 * However, if a ticket in a silent category is assigned to a specific staff member
 * (via default category assignee or manually), that assignee is still notified.
 */
class SilentCategoryNotificationTest extends TestCase
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
                $this->normalUser(), // id 2, opens the tickets
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
                ['id' => 1, 'name' => 'General', 'slug' => 'general', 'ticket_type' => 'standard', 'position' => 0, 'is_silent' => 0, 'created_at' => Carbon::now(), 'updated_at' => Carbon::now()],
                ['id' => 2, 'name' => 'Silent Queue', 'slug' => 'silent', 'ticket_type' => 'standard', 'position' => 1, 'is_silent' => 1, 'created_at' => Carbon::now(), 'updated_at' => Carbon::now()],
                ['id' => 3, 'name' => 'Silent Assigned', 'slug' => 'silent-assigned', 'ticket_type' => 'standard', 'position' => 2, 'is_silent' => 1, 'default_assignee_id' => 4, 'created_at' => Carbon::now(), 'updated_at' => Carbon::now()],
            ],
        ]);
    }

    private function openTicketIn(int $categoryId, int $userId = 2): int
    {
        $response = $this->send(
            $this->request('POST', '/api/linkrobins-support-tickets', [
                'authenticatedAs' => $userId,
                'json' => [
                    'data' => [
                        'type' => 'linkrobins-support-tickets',
                        'attributes' => [
                            'subject' => 'Need help in category ' . $categoryId,
                            'firstPost' => 'Opening message body.',
                        ],
                        'relationships' => [
                            'category' => [
                                'data' => ['type' => 'linkrobins-support-categories', 'id' => (string) $categoryId],
                            ],
                        ],
                    ],
                ],
            ])
        );

        $body = (string) $response->getBody();
        $this->assertEquals(201, $response->getStatusCode(), $body);

        return (int) json_decode($body, true)['data']['id'];
    }

    private function notifiedAbout(int $ticketId, string $type = 'linkrobinsSupportNewTicket'): array
    {
        $ids = $this->database()->table('notifications')
            ->where('type', $type)
            ->where('subject_id', $ticketId)
            ->pluck('user_id')
            ->map(fn ($id) => (int) $id)
            ->all();

        sort($ids);

        return $ids;
    }

    #[Test]
    public function unassigned_ticket_in_normal_category_notifies_all_staff(): void
    {
        $ticketId = $this->openTicketIn(1);

        $this->assertEquals(
            [1, 3, 4],
            $this->notifiedAbout($ticketId),
            'Normal category should notify all staff on ticket creation.'
        );
    }

    #[Test]
    public function unassigned_ticket_in_silent_category_notifies_nobody_on_creation(): void
    {
        $ticketId = $this->openTicketIn(2);

        $this->assertEmpty(
            $this->notifiedAbout($ticketId),
            'Silent category without an assignee should not notify any staff on ticket creation.'
        );
    }

    #[Test]
    public function auto_assigned_ticket_in_silent_category_notifies_the_assignee_on_creation(): void
    {
        $ticketId = $this->openTicketIn(3);

        $this->assertEquals(
            [4],
            $this->notifiedAbout($ticketId),
            'Silent category with an assignee must still notify that specific assignee.'
        );
    }

    #[Test]
    public function user_reply_to_unassigned_ticket_in_silent_category_notifies_nobody(): void
    {
        $ticketId = $this->openTicketIn(2);

        $response = $this->send(
            $this->request('POST', '/api/linkrobins-support-replies', [
                'authenticatedAs' => 2,
                'json' => [
                    'data' => [
                        'attributes' => ['content' => 'Any updates?'],
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
            ->all();

        $this->assertEmpty($replyNotifications, 'Replies on an unassigned ticket in a silent category should notify nobody.');
    }

    #[Test]
    public function user_reply_to_assigned_ticket_in_silent_category_notifies_the_assignee(): void
    {
        $ticketId = $this->openTicketIn(3);

        $response = $this->send(
            $this->request('POST', '/api/linkrobins-support-replies', [
                'authenticatedAs' => 2,
                'json' => [
                    'data' => [
                        'attributes' => ['content' => 'Replying to assignee.'],
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

        $this->assertEquals([4], $replyNotifications, 'Replies on an assigned ticket in a silent category must notify the assignee.');
    }

    #[Test]
    public function admin_can_toggle_category_silent_state(): void
    {
        $response = $this->send(
            $this->request('PATCH', '/api/linkrobins-support-categories/1', [
                'authenticatedAs' => 1,
                'json' => [
                    'data' => [
                        'attributes' => [
                            'isSilent' => true,
                        ],
                    ],
                ],
            ])
        );

        $this->assertEquals(200, $response->getStatusCode(), (string) $response->getBody());
        $this->assertTrue((bool) $this->database()->table('linkrobins_support_categories')->where('id', 1)->value('is_silent'));

        $data = json_decode((string) $response->getBody(), true)['data'];
        $this->assertTrue($data['attributes']['isSilent']);
    }
}
