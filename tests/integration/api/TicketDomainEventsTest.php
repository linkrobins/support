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
use LinkRobins\Support\Event\ReplyPosted;
use LinkRobins\Support\Event\TicketAssigned;
use LinkRobins\Support\Event\TicketChanged;
use LinkRobins\Support\Event\TicketCreated;
use LinkRobins\Support\Event\TicketDecided;
use LinkRobins\Support\Event\TicketStatusChanged;
use LinkRobins\Support\SupportTicket;
use PHPUnit\Framework\Attributes\Test;

/**
 * The lifecycle events other extensions listen to. Originally written by
 * huoxin233 in linkrobins/support#20; the events now fire from the model
 * hooks, so the auto-close and staff-opened cases are covered as well.
 */
class TicketDomainEventsTest extends TestCase
{
    use RetrievesAuthorizedUsers;

    /** @var list<object> */
    public static array $dispatchedEvents = [];

    public static bool $throwOnStatusChange = false;

    public static bool $throwOnTicketCreated = false;

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
        self::$throwOnStatusChange = false;
        self::$throwOnTicketCreated = false;

        $this->extension('linkrobins-support');

        $this->extend(
            (new Extend\Event())
                ->listen(TicketStatusChanged::class, function () {
                    if (self::$throwOnStatusChange) {
                        throw new \RuntimeException('Simulated listener failure');
                    }
                })
                ->listen(TicketCreated::class, function () {
                    if (self::$throwOnTicketCreated) {
                        throw new \RuntimeException('Simulated created listener failure');
                    }
                })
                ->listen(TicketCreated::class, fn ($e) => self::$dispatchedEvents[] = $e)
                ->listen(TicketChanged::class, fn ($e) => self::$dispatchedEvents[] = $e)
                ->listen(TicketStatusChanged::class, fn ($e) => self::$dispatchedEvents[] = $e)
                ->listen(TicketDecided::class, fn ($e) => self::$dispatchedEvents[] = $e)
                ->listen(TicketAssigned::class, fn ($e) => self::$dispatchedEvents[] = $e)
                ->listen(ReplyCreated::class, fn ($e) => self::$dispatchedEvents[] = $e)
                ->listen(ReplyPosted::class, fn ($e) => self::$dispatchedEvents[] = $e)
        );

        $this->prepareDatabase([
            'users' => [
                $this->normalUser(), // id 2
                ['id' => 3, 'username' => 'staff1', 'email' => 'staff1@machine.local', 'is_email_confirmed' => 1, 'password' => 'password'],
                ['id' => 4, 'username' => 'staff2', 'email' => 'staff2@machine.local', 'is_email_confirmed' => 1, 'password' => 'password'],
            ],
            'groups' => [
                ['id' => 100, 'name_singular' => 'Staff', 'name_plural' => 'Staff', 'is_hidden' => 0],
            ],
            'group_user' => [
                ['user_id' => 3, 'group_id' => 100],
                ['user_id' => 4, 'group_id' => 100],
            ],
            'group_permission' => [
                ['group_id' => 100, 'permission' => 'lr-support.handle_tickets'],
                ['group_id' => 100, 'permission' => 'lr-support.staff'],
            ],
            'linkrobins_support_categories' => [
                ['id' => 1, 'name' => 'General', 'slug' => 'general', 'ticket_type' => 'standard', 'position' => 0, 'created_at' => Carbon::now(), 'updated_at' => Carbon::now()],
                ['id' => 2, 'name' => 'Appeals', 'slug' => 'appeals', 'ticket_type' => 'appeal', 'position' => 1, 'created_at' => Carbon::now(), 'updated_at' => Carbon::now()],
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

        $changedEvents = array_values(array_filter(self::$dispatchedEvents, fn ($e) => $e instanceof TicketChanged));
        $this->assertCount(1, $changedEvents);
        $this->assertEquals($ticketId, $changedEvents[0]->ticket->id);
        $this->assertEquals(3, $changedEvents[0]->actor?->id);

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

        // The unassign must reach the database, not only dispatch an event.
        $this->assertNull($this->database()->table('linkrobins_support_tickets')->where('id', $ticketId)->value('assigned_staff_id'));

        // An empty PATCH (what Model.save() sent for a null relationship before
        // the forum fix) changes nothing, so the assignee below must survive it.
        $this->database()->table('linkrobins_support_tickets')->where('id', $ticketId)->update(['assigned_staff_id' => 3]);
        $response = $this->send(
            $this->request('PATCH', "/api/linkrobins-support-tickets/$ticketId", [
                'authenticatedAs' => 3,
                'json' => ['data' => ['type' => 'linkrobins-support-tickets', 'id' => (string) $ticketId, 'attributes' => [], 'relationships' => []]],
            ])
        );
        $this->assertEquals(200, $response->getStatusCode());
        $this->assertEquals(3, $this->database()->table('linkrobins_support_tickets')->where('id', $ticketId)->value('assigned_staff_id'));
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

    #[Test]
    public function a_staff_members_own_ticket_dispatches_created_and_assignment_without_status_change(): void
    {
        // When a staff member files a ticket, it starts directly in_progress and
        // is auto-claimed. TicketCreated and TicketAssigned fire, while
        // TicketStatusChanged stays quiet because the starting status isn't a change.
        $response = $this->send(
            $this->request('POST', '/api/linkrobins-support-tickets', [
                'authenticatedAs' => 3,
                'json' => [
                    'data' => [
                        'attributes' => [
                            'subject' => 'Filed by staff',
                            'firstPost' => 'Opening message from staff',
                        ],
                        'relationships' => [
                            'category' => ['data' => ['type' => 'linkrobins-support-categories', 'id' => '1']],
                        ],
                    ],
                ],
            ])
        );

        $this->assertEquals(201, $response->getStatusCode());

        $ticketId = (int) json_decode((string) $response->getBody(), true)['data']['id'];
        $this->assertEquals(
            SupportTicket::STATUS_IN_PROGRESS,
            $this->database()->table('linkrobins_support_tickets')->where('id', $ticketId)->value('status')
        );

        $createdEvents = array_values(array_filter(self::$dispatchedEvents, fn ($e) => $e instanceof TicketCreated));
        $this->assertCount(1, $createdEvents);
        $this->assertEquals(3, $createdEvents[0]->actor?->id);

        $statusEvents = array_values(array_filter(self::$dispatchedEvents, fn ($e) => $e instanceof TicketStatusChanged));
        $this->assertCount(0, $statusEvents, 'Initial status on creation must not dispatch TicketStatusChanged');

        $assignedEvents = array_values(array_filter(self::$dispatchedEvents, fn ($e) => $e instanceof TicketAssigned));
        $this->assertCount(1, $assignedEvents);
        $this->assertEquals(3, $assignedEvents[0]->assignee?->id);
        $this->assertNull($assignedEvents[0]->oldAssignee);
        $this->assertEquals(3, $assignedEvents[0]->actor?->id);

        // The opening message must not dispatch ReplyCreated (announced by TicketCreated)
        $replyEvents = array_filter(self::$dispatchedEvents, fn ($e) => $e instanceof ReplyCreated);
        $this->assertCount(0, $replyEvents, 'Opening message must not dispatch ReplyCreated');
    }

    #[Test]
    public function patching_priority_dispatches_ticket_changed_event(): void
    {
        $ticketId = $this->database()->table('linkrobins_support_tickets')->insertGetId([
            'category_id' => 1,
            'user_id' => 2,
            'subject' => 'Priority test',
            'status' => SupportTicket::STATUS_OPEN,
            'priority' => SupportTicket::PRIORITY_NORMAL,
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
                            'priority' => SupportTicket::PRIORITY_URGENT,
                        ],
                    ],
                ],
            ])
        );

        $this->assertEquals(200, $response->getStatusCode());

        $changedEvents = array_values(array_filter(self::$dispatchedEvents, fn ($e) => $e instanceof TicketChanged));
        $this->assertCount(1, $changedEvents);
        $this->assertEquals($ticketId, $changedEvents[0]->ticket->id);
        $this->assertEquals(SupportTicket::PRIORITY_URGENT, $changedEvents[0]->ticket->priority);
        $this->assertEquals(3, $changedEvents[0]->actor?->id);
    }

    #[Test]
    public function failing_listener_does_not_fail_api_patch_or_block_other_listeners(): void
    {
        $ticketId = $this->database()->table('linkrobins_support_tickets')->insertGetId([
            'category_id' => 1,
            'user_id' => 2,
            'subject' => 'Listener error isolation',
            'status' => SupportTicket::STATUS_OPEN,
            'created_at' => Carbon::now(),
            'updated_at' => Carbon::now(),
        ]);

        self::$dispatchedEvents = [];
        self::$throwOnStatusChange = true;

        $response = $this->send(
            $this->request('PATCH', "/api/linkrobins-support-tickets/$ticketId", [
                'authenticatedAs' => 3,
                'json' => [
                    'data' => [
                        'type' => 'linkrobins-support-tickets',
                        'id' => (string) $ticketId,
                        'attributes' => [
                            'status' => SupportTicket::STATUS_RESOLVED,
                        ],
                    ],
                ],
            ])
        );

        $this->assertEquals(200, $response->getStatusCode(), (string) $response->getBody());
        $this->assertEquals(
            SupportTicket::STATUS_RESOLVED,
            $this->database()->table('linkrobins_support_tickets')->where('id', $ticketId)->value('status')
        );

        // Subsequent listeners on TicketStatusChanged and TicketChanged must still run
        $statusEvents = array_values(array_filter(self::$dispatchedEvents, fn ($e) => $e instanceof TicketStatusChanged));
        $this->assertCount(1, $statusEvents);

        $changedEvents = array_values(array_filter(self::$dispatchedEvents, fn ($e) => $e instanceof TicketChanged));
        $this->assertCount(1, $changedEvents);
    }

    #[Test]
    public function owner_confirm_solved_and_reopen_dispatch_status_and_changed_events_with_owner_actor(): void
    {
        $ticketId = $this->database()->table('linkrobins_support_tickets')->insertGetId([
            'category_id' => 1,
            'user_id' => 2,
            'subject' => 'Owner transitions',
            'status' => SupportTicket::STATUS_RESOLVED,
            'created_at' => Carbon::now(),
            'updated_at' => Carbon::now(),
        ]);

        // 1. Owner confirms solved (resolved -> closed)
        self::$dispatchedEvents = [];
        $closeResponse = $this->send(
            $this->request('PATCH', "/api/linkrobins-support-tickets/$ticketId", [
                'authenticatedAs' => 2,
                'json' => [
                    'data' => [
                        'type' => 'linkrobins-support-tickets',
                        'id' => (string) $ticketId,
                        'attributes' => ['status' => SupportTicket::STATUS_CLOSED],
                    ],
                ],
            ])
        );
        $this->assertEquals(200, $closeResponse->getStatusCode(), (string) $closeResponse->getBody());

        $statusEvents = array_values(array_filter(self::$dispatchedEvents, fn ($e) => $e instanceof TicketStatusChanged));
        $this->assertCount(1, $statusEvents);
        $this->assertEquals(SupportTicket::STATUS_RESOLVED, $statusEvents[0]->oldStatus);
        $this->assertEquals(SupportTicket::STATUS_CLOSED, $statusEvents[0]->newStatus);
        $this->assertEquals(2, $statusEvents[0]->actor?->id);
        $this->assertFalse($statusEvents[0]->isAutomatic);

        $changedEvents = array_values(array_filter(self::$dispatchedEvents, fn ($e) => $e instanceof TicketChanged));
        $this->assertCount(1, $changedEvents);
        $this->assertEquals(2, $changedEvents[0]->actor?->id);

        // 2. Owner reopens closed ticket (closed -> open)
        self::$dispatchedEvents = [];
        $reopenResponse = $this->send(
            $this->request('PATCH', "/api/linkrobins-support-tickets/$ticketId", [
                'authenticatedAs' => 2,
                'json' => [
                    'data' => [
                        'type' => 'linkrobins-support-tickets',
                        'id' => (string) $ticketId,
                        'attributes' => ['status' => SupportTicket::STATUS_OPEN],
                    ],
                ],
            ])
        );
        $this->assertEquals(200, $reopenResponse->getStatusCode(), (string) $reopenResponse->getBody());

        $reopenStatusEvents = array_values(array_filter(self::$dispatchedEvents, fn ($e) => $e instanceof TicketStatusChanged));
        $this->assertCount(1, $reopenStatusEvents);
        $this->assertEquals(SupportTicket::STATUS_CLOSED, $reopenStatusEvents[0]->oldStatus);
        $this->assertEquals(SupportTicket::STATUS_OPEN, $reopenStatusEvents[0]->newStatus);
        $this->assertEquals(2, $reopenStatusEvents[0]->actor?->id);

        $reopenChangedEvents = array_values(array_filter(self::$dispatchedEvents, fn ($e) => $e instanceof TicketChanged));
        $this->assertCount(1, $reopenChangedEvents);
        $this->assertEquals(2, $reopenChangedEvents[0]->actor?->id);
    }

    #[Test]
    public function reassigning_between_staff_by_another_actor_records_distinct_sides(): void
    {
        $ticketId = $this->database()->table('linkrobins_support_tickets')->insertGetId([
            'category_id' => 1,
            'user_id' => 2,
            'assigned_staff_id' => 3,
            'subject' => 'Handover',
            'status' => SupportTicket::STATUS_IN_PROGRESS,
            'created_at' => Carbon::now(),
            'updated_at' => Carbon::now(),
        ]);

        self::$dispatchedEvents = [];

        $response = $this->send(
            $this->request('PATCH', "/api/linkrobins-support-tickets/$ticketId", [
                'authenticatedAs' => 1,
                'json' => [
                    'data' => [
                        'type' => 'linkrobins-support-tickets',
                        'id' => (string) $ticketId,
                        'relationships' => [
                            'assignedStaff' => ['data' => ['type' => 'users', 'id' => '4']],
                        ],
                    ],
                ],
            ])
        );
        $this->assertEquals(200, $response->getStatusCode(), (string) $response->getBody());

        $assignedEvents = array_values(array_filter(self::$dispatchedEvents, fn ($e) => $e instanceof TicketAssigned));
        $this->assertCount(1, $assignedEvents);
        $this->assertEquals(1, $assignedEvents[0]->actor?->id);
        $this->assertEquals(3, $assignedEvents[0]->oldAssignee?->id);
        $this->assertEquals(3, $assignedEvents[0]->oldAssigneeId);
        $this->assertEquals(4, $assignedEvents[0]->assignee?->id);
        $this->assertEquals(4, $assignedEvents[0]->assigneeId);

        $changedEvents = array_values(array_filter(self::$dispatchedEvents, fn ($e) => $e instanceof TicketChanged));
        $this->assertCount(1, $changedEvents);
        $this->assertEquals(1, $changedEvents[0]->actor?->id);

        $timelineRow = $this->database()->table('linkrobins_support_events')
            ->where('ticket_id', $ticketId)
            ->where('type', 'assignment')
            ->first();
        $this->assertNotNull($timelineRow);
        $this->assertEquals(1, (int) $timelineRow->user_id);
        $this->assertEquals(3, (int) $timelineRow->from_user_id);
        $this->assertEquals(4, (int) $timelineRow->to_user_id);
    }

    #[Test]
    public function internal_note_auto_claims_without_status_change(): void
    {
        $ticketId = $this->database()->table('linkrobins_support_tickets')->insertGetId([
            'category_id' => 1,
            'user_id' => 2,
            'subject' => 'Internal triage',
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
                            'content' => 'Private staff note',
                            'isInternalNote' => true,
                        ],
                        'relationships' => [
                            'ticket' => ['data' => ['type' => 'linkrobins-support-tickets', 'id' => (string) $ticketId]],
                        ],
                    ],
                ],
            ])
        );
        $this->assertEquals(201, $response->getStatusCode(), (string) $response->getBody());

        $this->assertEquals(
            SupportTicket::STATUS_OPEN,
            $this->database()->table('linkrobins_support_tickets')->where('id', $ticketId)->value('status')
        );

        $this->assertCount(0, array_filter(self::$dispatchedEvents, fn ($e) => $e instanceof TicketStatusChanged));
        $assignedEvents = array_values(array_filter(self::$dispatchedEvents, fn ($e) => $e instanceof TicketAssigned));
        $this->assertCount(1, $assignedEvents);
        $this->assertEquals(3, $assignedEvents[0]->assignee?->id);

        $postedEvents = array_values(array_filter(self::$dispatchedEvents, fn ($e) => $e instanceof ReplyPosted));
        $this->assertCount(1, $postedEvents);
        $this->assertTrue((bool) $postedEvents[0]->reply->is_internal_note);
        $this->assertEquals(3, $postedEvents[0]->actor?->id);

        $this->assertCount(1, array_filter(self::$dispatchedEvents, fn ($e) => $e instanceof TicketChanged));
    }

    #[Test]
    public function user_replying_to_resolved_ticket_reopens_automatically(): void
    {
        $ticketId = $this->database()->table('linkrobins_support_tickets')->insertGetId([
            'category_id' => 1,
            'user_id' => 2,
            'assigned_staff_id' => 3,
            'subject' => 'Resolved ticket',
            'status' => SupportTicket::STATUS_RESOLVED,
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
                        'attributes' => ['content' => 'Still seeing the issue'],
                        'relationships' => [
                            'ticket' => ['data' => ['type' => 'linkrobins-support-tickets', 'id' => (string) $ticketId]],
                        ],
                    ],
                ],
            ])
        );
        $this->assertEquals(201, $response->getStatusCode(), (string) $response->getBody());

        $statusEvents = array_values(array_filter(self::$dispatchedEvents, fn ($e) => $e instanceof TicketStatusChanged));
        $this->assertCount(1, $statusEvents);
        $this->assertEquals(SupportTicket::STATUS_RESOLVED, $statusEvents[0]->oldStatus);
        $this->assertEquals(SupportTicket::STATUS_IN_PROGRESS, $statusEvents[0]->newStatus);
        $this->assertEquals(2, $statusEvents[0]->actor?->id);
        $this->assertTrue($statusEvents[0]->isAutomatic);

        $this->assertCount(1, array_filter(self::$dispatchedEvents, fn ($e) => $e instanceof ReplyPosted));
        $this->assertCount(1, array_filter(self::$dispatchedEvents, fn ($e) => $e instanceof ReplyCreated));
        $this->assertCount(1, array_filter(self::$dispatchedEvents, fn ($e) => $e instanceof TicketChanged));
    }

    #[Test]
    public function failing_listener_does_not_fail_ticket_creation_or_block_other_listeners(): void
    {
        self::$dispatchedEvents = [];
        self::$throwOnTicketCreated = true;

        $response = $this->send(
            $this->request('POST', '/api/linkrobins-support-tickets', [
                'authenticatedAs' => 2,
                'json' => [
                    'data' => [
                        'attributes' => [
                            'subject' => 'Isolated creation',
                            'firstPost' => 'Opening body',
                        ],
                        'relationships' => [
                            'category' => ['data' => ['type' => 'linkrobins-support-categories', 'id' => '1']],
                        ],
                    ],
                ],
            ])
        );
        $this->assertEquals(201, $response->getStatusCode(), (string) $response->getBody());

        $createdEvents = array_values(array_filter(self::$dispatchedEvents, fn ($e) => $e instanceof TicketCreated));
        $this->assertCount(1, $createdEvents);
    }
}
