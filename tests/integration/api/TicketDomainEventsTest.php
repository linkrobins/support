<?php

/*
 * This file is part of linkrobins/support.
 *
 * For detailed copyright and license information, please view the
 * LICENSE file that was distributed with this source code.
 */

namespace LinkRobins\Support\Tests\integration\api;

use Carbon\Carbon;
use Flarum\Extend;
use Flarum\Testing\integration\RetrievesAuthorizedUsers;
use Flarum\Testing\integration\TestCase;
use LinkRobins\Support\Event\ReplyCreated;
use LinkRobins\Support\Event\TicketAssigned;
use LinkRobins\Support\Event\TicketCreated;
use LinkRobins\Support\Event\TicketDecided;
use LinkRobins\Support\Event\TicketStatusChanged;
use LinkRobins\Support\SupportTicket;
use PHPUnit\Framework\Attributes\Test;

class TicketDomainEventsTest extends TestCase
{
    use RetrievesAuthorizedUsers;

    /** @var list<object> */
    public static array $dispatchedEvents = [];

    /**
     * Flarum's notification mailer and auth pipeline repeatedly look up users by ID.
     * Upstream whitelists this shape in StatusNotificationTest and CategoryDefaultAssigneeTest.
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

        self::$dispatchedEvents = [];

        $this->extension('linkrobins-support');

        $this->extend(
            (new Extend\Event())
                ->listen(TicketCreated::class, fn ($e) => self::$dispatchedEvents[] = $e)
                ->listen(TicketStatusChanged::class, fn ($e) => self::$dispatchedEvents[] = $e)
                ->listen(TicketDecided::class, fn ($e) => self::$dispatchedEvents[] = $e)
                ->listen(TicketAssigned::class, fn ($e) => self::$dispatchedEvents[] = $e)
                ->listen(ReplyCreated::class, fn ($e) => self::$dispatchedEvents[] = $e)
        );

        $this->prepareDatabase([
            'users' => [
                $this->normalUser(), // id 2
                ['id' => 3, 'username' => 'staff1', 'email' => 'staff1@machine.local', 'is_email_confirmed' => 1, 'password' => 'password'],
            ],
            'groups' => [
                ['id' => 100, 'name_singular' => 'Staff', 'name_plural' => 'Staff', 'is_hidden' => 0],
            ],
            'group_user' => [
                ['user_id' => 3, 'group_id' => 100],
            ],
            'group_permission' => [
                ['group_id' => 100, 'permission' => 'lr-support.handle_tickets'],
                ['group_id' => 100, 'permission' => 'lr-support.staff'],
            ],
            'linkrobins_support_categories' => [
                ['id' => 1, 'name' => 'General', 'slug' => 'general', 'is_appeal' => 0, 'position' => 0, 'created_at' => Carbon::now(), 'updated_at' => Carbon::now()],
                ['id' => 2, 'name' => 'Appeals', 'slug' => 'appeals', 'is_appeal' => 1, 'position' => 1, 'created_at' => Carbon::now(), 'updated_at' => Carbon::now()],
            ],
        ]);
    }

    #[Test]
    public function creating_a_ticket_dispatches_ticket_created_event(): void
    {
        $response = $this->send(
            $this->request('POST', '/api/linkrobins-support-tickets', [
                'authenticatedAs' => 2,
                'json' => [
                    'data' => [
                        'attributes' => [
                            'subject' => 'Need Help',
                            'firstPost' => 'First message body',
                        ],
                        'relationships' => [
                            'category' => ['data' => ['type' => 'linkrobins-support-categories', 'id' => '1']],
                        ],
                    ],
                ],
            ])
        );

        $this->assertEquals(201, $response->getStatusCode());

        $createdEvents = array_filter(self::$dispatchedEvents, fn ($e) => $e instanceof TicketCreated);
        $this->assertCount(1, $createdEvents);

        /** @var TicketCreated $event */
        $event = reset($createdEvents);
        $this->assertEquals('Need Help', $event->ticket->subject);
        $this->assertEquals(2, $event->actor->id);

        // Opening message must not dispatch a redundant ReplyCreated or TicketStatusChanged
        $replyEvents = array_filter(self::$dispatchedEvents, fn ($e) => $e instanceof ReplyCreated);
        $this->assertCount(0, $replyEvents, 'Opening message must not dispatch ReplyCreated');

        $statusEvents = array_filter(self::$dispatchedEvents, fn ($e) => $e instanceof TicketStatusChanged);
        $this->assertCount(0, $statusEvents, 'Initial ticket creation must not dispatch TicketStatusChanged');
    }

    #[Test]
    public function updating_status_and_decision_dispatches_proper_events(): void
    {
        $ticketId = $this->database()->table('linkrobins_support_tickets')->insertGetId([
            'category_id' => 2,
            'user_id' => 2,
            'subject' => 'Appeal Ban',
            'status' => SupportTicket::STATUS_OPEN,
            'decision' => SupportTicket::DECISION_PENDING,
            'created_at' => Carbon::now(),
            'updated_at' => Carbon::now(),
        ]);

        self::$dispatchedEvents = [];

        $response = $this->send(
            $this->request('PATCH', "/api/linkrobins-support-tickets/$ticketId", [
                'authenticatedAs' => 3,
                'json' => [
                    'data' => [
                        'type' => 'linkrobins-support-tickets',
                        'id' => (string) $ticketId,
                        'attributes' => [
                            'status' => SupportTicket::STATUS_RESOLVED,
                            'decision' => SupportTicket::DECISION_ACCEPTED,
                        ],
                    ],
                ],
            ])
        );

        $this->assertEquals(200, $response->getStatusCode());

        $statusEvents = array_values(array_filter(self::$dispatchedEvents, fn ($e) => $e instanceof TicketStatusChanged));
        $this->assertCount(1, $statusEvents);
        $this->assertEquals(SupportTicket::STATUS_OPEN, $statusEvents[0]->oldStatus);
        $this->assertEquals(SupportTicket::STATUS_RESOLVED, $statusEvents[0]->newStatus);
        $this->assertEquals(3, $statusEvents[0]->actor->id);

        $decisionEvents = array_values(array_filter(self::$dispatchedEvents, fn ($e) => $e instanceof TicketDecided));
        $this->assertCount(1, $decisionEvents);
        $this->assertEquals(SupportTicket::DECISION_PENDING, $decisionEvents[0]->oldDecision);
        $this->assertEquals(SupportTicket::DECISION_ACCEPTED, $decisionEvents[0]->newDecision);
        $this->assertEquals(3, $decisionEvents[0]->actor->id);

        // A no-op update with identical values must NOT re-dispatch events
        self::$dispatchedEvents = [];
        $this->send(
            $this->request('PATCH', "/api/linkrobins-support-tickets/$ticketId", [
                'authenticatedAs' => 3,
                'json' => [
                    'data' => [
                        'type' => 'linkrobins-support-tickets',
                        'id' => (string) $ticketId,
                        'attributes' => [
                            'status' => SupportTicket::STATUS_RESOLVED,
                            'decision' => SupportTicket::DECISION_ACCEPTED,
                        ],
                    ],
                ],
            ])
        );
        $this->assertEmpty(self::$dispatchedEvents, 'No-op update must not dispatch any events');
    }

    #[Test]
    public function assigning_and_unassigning_dispatches_ticket_assigned_event(): void
    {
        $ticketId = $this->database()->table('linkrobins_support_tickets')->insertGetId([
            'category_id' => 1,
            'user_id' => 2,
            'subject' => 'Assign me',
            'status' => SupportTicket::STATUS_OPEN,
            'created_at' => Carbon::now(),
            'updated_at' => Carbon::now(),
        ]);

        self::$dispatchedEvents = [];

        // 1. Assign to staff3
        $response = $this->send(
            $this->request('PATCH', "/api/linkrobins-support-tickets/$ticketId", [
                'authenticatedAs' => 3,
                'json' => [
                    'data' => [
                        'type' => 'linkrobins-support-tickets',
                        'id' => (string) $ticketId,
                        'relationships' => [
                            'assignedStaff' => ['data' => ['type' => 'users', 'id' => '3']],
                        ],
                    ],
                ],
            ])
        );

        $this->assertEquals(200, $response->getStatusCode());

        $assignedEvents = array_values(array_filter(self::$dispatchedEvents, fn ($e) => $e instanceof TicketAssigned));
        $this->assertCount(1, $assignedEvents);
        $this->assertEquals(3, $assignedEvents[0]->assignee?->id);
        $this->assertNull($assignedEvents[0]->oldAssignee);
        $this->assertEquals(3, $assignedEvents[0]->actor?->id);

        self::$dispatchedEvents = [];

        // 2. Unassign
        $response = $this->send(
            $this->request('PATCH', "/api/linkrobins-support-tickets/$ticketId", [
                'authenticatedAs' => 3,
                'json' => [
                    'data' => [
                        'type' => 'linkrobins-support-tickets',
                        'id' => (string) $ticketId,
                        'relationships' => [
                            'assignedStaff' => ['data' => null],
                        ],
                    ],
                ],
            ])
        );

        $this->assertEquals(200, $response->getStatusCode());

        $unassignedEvents = array_values(array_filter(self::$dispatchedEvents, fn ($e) => $e instanceof TicketAssigned));
        $this->assertCount(1, $unassignedEvents);
        $this->assertNull($unassignedEvents[0]->assignee);
        $this->assertEquals(3, $unassignedEvents[0]->oldAssignee?->id);
    }

    #[Test]
    public function posting_a_reply_dispatches_reply_created_event(): void
    {
        $ticketId = $this->database()->table('linkrobins_support_tickets')->insertGetId([
            'category_id' => 1,
            'user_id' => 2,
            'subject' => 'Ticket for reply',
            'status' => SupportTicket::STATUS_OPEN,
            'created_at' => Carbon::now(),
            'updated_at' => Carbon::now(),
        ]);

        $this->database()->table('linkrobins_support_replies')->insert([
            'ticket_id' => $ticketId,
            'user_id' => 2,
            'content' => 'Opening message',
            'created_at' => Carbon::now(),
            'updated_at' => Carbon::now(),
        ]);

        self::$dispatchedEvents = [];

        $response = $this->send(
            $this->request('POST', '/api/linkrobins-support-replies', [
                'authenticatedAs' => 3,
                'json' => [
                    'data' => [
                        'type' => 'linkrobins-support-replies',
                        'attributes' => [
                            'content' => 'Staff response message',
                        ],
                        'relationships' => [
                            'ticket' => [
                                'data' => ['type' => 'linkrobins-support-tickets', 'id' => (string) $ticketId],
                            ],
                        ],
                    ],
                ],
            ])
        );

        $this->assertEquals(201, $response->getStatusCode());

        $replyEvents = array_values(array_filter(self::$dispatchedEvents, fn ($e) => $e instanceof ReplyCreated));
        $this->assertCount(1, $replyEvents);
        $this->assertEquals('Staff response message', $replyEvents[0]->reply->content);
        $this->assertEquals(3, $replyEvents[0]->actor?->id);

        // Staff replying to an open unassigned ticket automatically claims it and advances status
        $statusEvents = array_values(array_filter(self::$dispatchedEvents, fn ($e) => $e instanceof TicketStatusChanged));
        $this->assertCount(1, $statusEvents);
        $this->assertEquals(SupportTicket::STATUS_OPEN, $statusEvents[0]->oldStatus);
        $this->assertEquals(SupportTicket::STATUS_IN_PROGRESS, $statusEvents[0]->newStatus);
        $this->assertEquals(3, $statusEvents[0]->actor?->id);

        $assignedEvents = array_values(array_filter(self::$dispatchedEvents, fn ($e) => $e instanceof TicketAssigned));
        $this->assertCount(1, $assignedEvents);
        $this->assertEquals(3, $assignedEvents[0]->assignee?->id);
        $this->assertNull($assignedEvents[0]->oldAssignee);
    }

    #[Test]
    public function user_replying_to_awaiting_user_ticket_dispatches_status_changed_event(): void
    {
        $ticketId = $this->database()->table('linkrobins_support_tickets')->insertGetId([
            'category_id' => 1,
            'user_id' => 2,
            'assigned_staff_id' => 3,
            'subject' => 'Awaiting user response',
            'status' => SupportTicket::STATUS_AWAITING_USER,
            'created_at' => Carbon::now(),
            'updated_at' => Carbon::now(),
        ]);

        $this->database()->table('linkrobins_support_replies')->insert([
            'ticket_id' => $ticketId,
            'user_id' => 2,
            'content' => 'Opening message',
            'created_at' => Carbon::now(),
            'updated_at' => Carbon::now(),
        ]);

        self::$dispatchedEvents = [];

        $response = $this->send(
            $this->request('POST', '/api/linkrobins-support-replies', [
                'authenticatedAs' => 2,
                'json' => [
                    'data' => [
                        'type' => 'linkrobins-support-replies',
                        'attributes' => [
                            'content' => 'Here is the requested information.',
                        ],
                        'relationships' => [
                            'ticket' => [
                                'data' => ['type' => 'linkrobins-support-tickets', 'id' => (string) $ticketId],
                            ],
                        ],
                    ],
                ],
            ])
        );

        $this->assertEquals(201, $response->getStatusCode());

        $statusEvents = array_values(array_filter(self::$dispatchedEvents, fn ($e) => $e instanceof TicketStatusChanged));
        $this->assertCount(1, $statusEvents);
        $this->assertEquals(SupportTicket::STATUS_AWAITING_USER, $statusEvents[0]->oldStatus);
        $this->assertEquals(SupportTicket::STATUS_IN_PROGRESS, $statusEvents[0]->newStatus);
        $this->assertEquals(2, $statusEvents[0]->actor?->id);
    }
}


