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
use Flarum\User\User;
use LinkRobins\Support\Extend\TicketType as TicketTypeExtend;
use LinkRobins\Support\RateLimiter;
use LinkRobins\Support\SupportCategory;
use LinkRobins\Support\SupportTicket;
use LinkRobins\Support\TicketType\AbstractTicketType;
use LinkRobins\Support\TicketType\TicketTypeManager;
use PHPUnit\Framework\Attributes\Test;
use Tobyz\JsonApiServer\Exception\BadRequestException;

class TicketTypeDriverTest extends TestCase
{
    use RetrievesAuthorizedUsers;

    public function setUp(): void
    {
        parent::setUp();

        $this->extension('linkrobins-support');

        $this->extend(
            (new TicketTypeExtend())
                ->add(CustomTestTicketType::ID, CustomTestTicketType::class)
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
            ],
            'linkrobins_support_categories' => [
                [
                    'id' => 1,
                    'name' => 'General',
                    'slug' => 'general',
                    'is_appeal' => 0,
                    'ticket_type' => 'standard',
                    'position' => 0,
                    'created_at' => Carbon::now(),
                    'updated_at' => Carbon::now(),
                ],
                [
                    'id' => 2,
                    'name' => 'Appeals',
                    'slug' => 'appeals',
                    'is_appeal' => 1,
                    'ticket_type' => 'appeal',
                    'position' => 1,
                    'created_at' => Carbon::now(),
                    'updated_at' => Carbon::now(),
                ],
                [
                    'id' => 3,
                    'name' => 'Custom Type',
                    'slug' => 'custom-type',
                    'is_appeal' => 0,
                    'ticket_type' => 'custom_type',
                    'position' => 2,
                    'created_at' => Carbon::now(),
                    'updated_at' => Carbon::now(),
                ],
                [
                    'id' => 4,
                    'name' => 'Restricted Group',
                    'slug' => 'restricted-group',
                    'is_appeal' => 0,
                    'ticket_type' => 'standard',
                    'allowed_group_ids' => json_encode([100]),
                    'position' => 3,
                    'created_at' => Carbon::now(),
                    'updated_at' => Carbon::now(),
                ],
                [
                    'id' => 5,
                    'name' => 'Members Only',
                    'slug' => 'members-only',
                    'is_appeal' => 0,
                    'ticket_type' => 'standard',
                    'allowed_group_ids' => json_encode([3]),
                    'position' => 4,
                    'created_at' => Carbon::now(),
                    'updated_at' => Carbon::now(),
                ],
            ],
        ]);
    }

    /**
     * @return array<string, mixed>
     */
    private function ticketBody(array $attributes, int $categoryId = 1): array
    {
        return [
            'data' => [
                'attributes' => $attributes,
                'relationships' => [
                    'category' => ['data' => ['type' => 'linkrobins-support-categories', 'id' => (string) $categoryId]],
                ],
            ],
        ];
    }

    #[Test]
    public function standard_ticket_type_has_no_initial_decision_and_allows_reopening(): void
    {
        $response = $this->send(
            $this->request('POST', '/api/linkrobins-support-tickets', [
                'authenticatedAs' => 2,
                'json' => $this->ticketBody(['subject' => 'Need help', 'firstPost' => 'Some issue.'], categoryId: 1),
            ])
        );

        $this->assertEquals(201, $response->getStatusCode());
        $data = json_decode((string) $response->getBody(), true);
        $ticketId = $data['data']['id'];
        $this->assertNull($data['data']['attributes']['decision']);

        // Staff closes the ticket
        $closeResponse = $this->send(
            $this->request('PATCH', '/api/linkrobins-support-tickets/' . $ticketId, [
                'authenticatedAs' => 3,
                'json' => [
                    'data' => [
                        'attributes' => ['status' => 'closed'],
                    ],
                ],
            ])
        );
        $this->assertEquals(200, $closeResponse->getStatusCode());

        // Check ticket from owner's perspective: owner may reopen standard ticket
        $showResponse = $this->send(
            $this->request('GET', '/api/linkrobins-support-tickets/' . $ticketId, [
                'authenticatedAs' => 2,
            ])
        );
        $showData = json_decode((string) $showResponse->getBody(), true);
        $this->assertTrue($showData['data']['attributes']['canReopen']);
    }

    #[Test]
    public function appeal_ticket_type_sets_pending_decision_and_forbids_reopening(): void
    {
        $response = $this->send(
            $this->request('POST', '/api/linkrobins-support-tickets', [
                'authenticatedAs' => 2,
                'json' => $this->ticketBody(['subject' => 'Unban me', 'firstPost' => 'I was unfairly banned.'], categoryId: 2),
            ])
        );

        $this->assertEquals(201, $response->getStatusCode());
        $data = json_decode((string) $response->getBody(), true);
        $ticketId = $data['data']['id'];
        $this->assertEquals('pending', $data['data']['attributes']['decision']);

        // Staff closes the appeal ticket
        $closeResponse = $this->send(
            $this->request('PATCH', '/api/linkrobins-support-tickets/' . $ticketId, [
                'authenticatedAs' => 3,
                'json' => [
                    'data' => [
                        'attributes' => ['status' => 'closed'],
                    ],
                ],
            ])
        );
        $this->assertEquals(200, $closeResponse->getStatusCode());

        // Check ticket from owner's perspective: owner may NOT reopen appeal ticket
        $showResponse = $this->send(
            $this->request('GET', '/api/linkrobins-support-tickets/' . $ticketId, [
                'authenticatedAs' => 2,
            ])
        );
        $showData = json_decode((string) $showResponse->getBody(), true);
        $this->assertFalse($showData['data']['attributes']['canReopen']);
    }

    #[Test]
    public function custom_ticket_type_registered_via_extender_is_executed(): void
    {
        $response = $this->send(
            $this->request('POST', '/api/linkrobins-support-tickets', [
                'authenticatedAs' => 2,
                'json' => $this->ticketBody(['subject' => 'Custom Request', 'firstPost' => 'Testing custom driver.'], categoryId: 3),
            ])
        );

        $this->assertEquals(201, $response->getStatusCode());
        $data = json_decode((string) $response->getBody(), true);
        $ticketId = $data['data']['id'];

        // Custom driver sets initial decision to 'pending'
        $this->assertEquals('pending', $data['data']['attributes']['decision']);

        // Staff closes ticket
        $this->send(
            $this->request('PATCH', '/api/linkrobins-support-tickets/' . $ticketId, [
                'authenticatedAs' => 3,
                'json' => [
                    'data' => [
                        'attributes' => ['status' => 'closed'],
                    ],
                ],
            ])
        );

        // Custom driver returns canReopen = false
        $showResponse = $this->send(
            $this->request('GET', '/api/linkrobins-support-tickets/' . $ticketId, [
                'authenticatedAs' => 2,
            ])
        );
        $showData = json_decode((string) $showResponse->getBody(), true);
        $this->assertFalse($showData['data']['attributes']['canReopen']);
    }

    #[Test]
    public function custom_ticket_type_lifecycle_hooks_are_triggered_on_creation(): void
    {
        CustomTestTicketType::resetState();

        $response = $this->send(
            $this->request('POST', '/api/linkrobins-support-tickets', [
                'authenticatedAs' => 2,
                'json' => $this->ticketBody(['subject' => 'Hook test', 'firstPost' => 'Testing lifecycle.'], categoryId: 3),
            ])
        );

        $this->assertEquals(201, $response->getStatusCode());
        $this->assertTrue(CustomTestTicketType::$onCreatingCalled);
        $this->assertTrue(CustomTestTicketType::$onCreatedCalled);
    }

    #[Test]
    public function custom_ticket_type_on_creating_hook_can_reject_invalid_submission(): void
    {
        CustomTestTicketType::resetState();

        $response = $this->send(
            $this->request('POST', '/api/linkrobins-support-tickets', [
                'authenticatedAs' => 2,
                'json' => $this->ticketBody([
                    'subject' => 'Hook test',
                    'firstPost' => 'Testing validation.',
                    'require_code' => true,
                ], categoryId: 3),
            ])
        );

        $this->assertEquals(400, $response->getStatusCode());
    }

    #[Test]
    public function custom_ticket_type_on_decided_hook_is_triggered_on_decision_change(): void
    {
        CustomTestTicketType::resetState();

        $createResponse = $this->send(
            $this->request('POST', '/api/linkrobins-support-tickets', [
                'authenticatedAs' => 2,
                'json' => $this->ticketBody(['subject' => 'Decision test', 'firstPost' => 'Testing decision hook.'], categoryId: 3),
            ])
        );

        $this->assertEquals(201, $createResponse->getStatusCode());
        $ticketId = json_decode((string) $createResponse->getBody(), true)['data']['id'];

        $patchResponse = $this->send(
            $this->request('PATCH', '/api/linkrobins-support-tickets/' . $ticketId, [
                'authenticatedAs' => 3,
                'json' => [
                    'data' => [
                        'attributes' => ['decision' => 'accepted'],
                    ],
                ],
            ])
        );

        $this->assertEquals(200, $patchResponse->getStatusCode());
        $this->assertEquals('accepted', CustomTestTicketType::$decidedTo);
    }

    #[Test]
    public function custom_ticket_type_can_create_controls_category_attribute_and_rejection(): void
    {
        CustomTestTicketType::resetState();
        CustomTestTicketType::$allowCreate = false;

        $showResponse = $this->send(
            $this->request('GET', '/api/linkrobins-support-categories/3', [
                'authenticatedAs' => 2,
            ])
        );

        $this->assertEquals(200, $showResponse->getStatusCode());
        $showData = json_decode((string) $showResponse->getBody(), true);
        $this->assertFalse($showData['data']['attributes']['canCreate']);

        $createResponse = $this->send(
            $this->request('POST', '/api/linkrobins-support-tickets', [
                'authenticatedAs' => 2,
                'json' => $this->ticketBody(['subject' => 'Disallowed', 'firstPost' => 'Should fail.'], categoryId: 3),
            ])
        );

        $this->assertEquals(403, $createResponse->getStatusCode());
        $this->assertStringContainsString(
            'Your account is not permitted to create tickets in this category.',
            (string) $createResponse->getBody()
        );
    }

    #[Test]
    public function custom_ticket_type_can_define_custom_rate_limit(): void
    {
        CustomTestTicketType::resetState();
        CustomTestTicketType::$rateLimitExceeded = true;

        $response = $this->send(
            $this->request('POST', '/api/linkrobins-support-tickets', [
                'authenticatedAs' => 2,
                'json' => $this->ticketBody(['subject' => 'Rate limit', 'firstPost' => 'Custom limiter.'], categoryId: 3),
            ])
        );

        $this->assertEquals(403, $response->getStatusCode());
        $this->assertStringContainsString('Custom rate limit exceeded', (string) $response->getBody());
    }

    #[Test]
    public function category_with_allowed_group_ids_restricts_creation_to_group_members(): void
    {
        // User 2 (not in group 100) should be rejected with 403
        $forbiddenResponse = $this->send(
            $this->request('POST', '/api/linkrobins-support-tickets', [
                'authenticatedAs' => 2,
                'json' => $this->ticketBody(['subject' => 'Restricted Group', 'firstPost' => 'Should fail.'], categoryId: 4),
            ])
        );

        $this->assertEquals(403, $forbiddenResponse->getStatusCode());
        $this->assertStringContainsString(
            'Your account is not permitted to create tickets in this category.',
            (string) $forbiddenResponse->getBody()
        );

        // User 3 (in group 100) should succeed
        $allowedResponse = $this->send(
            $this->request('POST', '/api/linkrobins-support-tickets', [
                'authenticatedAs' => 3,
                'json' => $this->ticketBody(['subject' => 'Staff in Group', 'firstPost' => 'Should succeed.'], categoryId: 4),
            ])
        );

        $this->assertEquals(201, $allowedResponse->getStatusCode());

        // Admin (User 1) bypasses group restriction
        $adminResponse = $this->send(
            $this->request('POST', '/api/linkrobins-support-tickets', [
                'authenticatedAs' => 1,
                'json' => $this->ticketBody(['subject' => 'Admin bypass', 'firstPost' => 'Admin always allowed.'], categoryId: 4),
            ])
        );

        $this->assertEquals(201, $adminResponse->getStatusCode());
    }

    #[Test]
    public function category_with_null_allowed_group_ids_allows_all_eligible_users(): void
    {
        // Category 1 has allowed_group_ids = null (default), normal user 2 can create
        $response = $this->send(
            $this->request('POST', '/api/linkrobins-support-tickets', [
                'authenticatedAs' => 2,
                'json' => $this->ticketBody(['subject' => 'No restrictions', 'firstPost' => 'Standard category.'], categoryId: 1),
            ])
        );

        $this->assertEquals(201, $response->getStatusCode());
    }

    #[Test]
    public function category_with_member_group_allows_authenticated_users(): void
    {
        // Category 5 allows group 3 (Members). Normal authenticated user 2 should pass.
        $response = $this->send(
            $this->request('POST', '/api/linkrobins-support-tickets', [
                'authenticatedAs' => 2,
                'json' => $this->ticketBody(['subject' => 'Member group', 'firstPost' => 'Member ticket.'], categoryId: 5),
            ])
        );

        $this->assertEquals(201, $response->getStatusCode());
    }

    #[Test]
    public function ticket_search_supports_filter_ticket_type(): void
    {
        $ticketStandardId = $this->database()->table('linkrobins_support_tickets')->insertGetId([
            'category_id' => 1,
            'user_id' => 2,
            'subject' => 'Standard Ticket',
            'status' => SupportTicket::STATUS_OPEN,
            'created_at' => Carbon::now(),
            'updated_at' => Carbon::now(),
        ]);

        $ticketAppealId = $this->database()->table('linkrobins_support_tickets')->insertGetId([
            'category_id' => 2,
            'user_id' => 2,
            'subject' => 'Appeal Ticket',
            'status' => SupportTicket::STATUS_OPEN,
            'created_at' => Carbon::now(),
            'updated_at' => Carbon::now(),
        ]);

        $ticketCustomId = $this->database()->table('linkrobins_support_tickets')->insertGetId([
            'category_id' => 3,
            'user_id' => 2,
            'subject' => 'Custom Ticket',
            'status' => SupportTicket::STATUS_OPEN,
            'created_at' => Carbon::now(),
            'updated_at' => Carbon::now(),
        ]);

        // Filter by custom_type
        $customResponse = $this->send(
            $this->request('GET', '/api/linkrobins-support-tickets?filter[ticketType]=custom_type', [
                'authenticatedAs' => 2,
            ])
        );
        $this->assertEquals(200, $customResponse->getStatusCode());
        $customBody = json_decode((string) $customResponse->getBody(), true);
        $customIds = array_column($customBody['data'], 'id');
        $this->assertContains((string) $ticketCustomId, $customIds);
        $this->assertNotContains((string) $ticketStandardId, $customIds);
        $this->assertNotContains((string) $ticketAppealId, $customIds);

        // Filter by appeal
        $appealResponse = $this->send(
            $this->request('GET', '/api/linkrobins-support-tickets?filter[ticketType]=appeal', [
                'authenticatedAs' => 2,
            ])
        );
        $this->assertEquals(200, $appealResponse->getStatusCode());
        $appealBody = json_decode((string) $appealResponse->getBody(), true);
        $appealIds = array_column($appealBody['data'], 'id');
        $this->assertContains((string) $ticketAppealId, $appealIds);
        $this->assertNotContains((string) $ticketStandardId, $appealIds);
        $this->assertNotContains((string) $ticketCustomId, $appealIds);

        // Filter by standard
        $standardResponse = $this->send(
            $this->request('GET', '/api/linkrobins-support-tickets?filter[ticketType]=standard', [
                'authenticatedAs' => 2,
            ])
        );
        $this->assertEquals(200, $standardResponse->getStatusCode());
        $standardBody = json_decode((string) $standardResponse->getBody(), true);
        $standardIds = array_column($standardBody['data'], 'id');
        $this->assertContains((string) $ticketStandardId, $standardIds);
        $this->assertNotContains((string) $ticketAppealId, $standardIds);
        $this->assertNotContains((string) $ticketCustomId, $standardIds);
    }

    #[Test]
    public function on_status_changed_hook_is_called_when_ticket_status_changes(): void
    {
        CustomTestTicketType::resetState();

        $ticketId = $this->database()->table('linkrobins_support_tickets')->insertGetId([
            'category_id' => 3,
            'user_id' => 2,
            'subject' => 'Status Hook Ticket',
            'status' => SupportTicket::STATUS_OPEN,
            'created_at' => Carbon::now(),
            'updated_at' => Carbon::now(),
        ]);

        $response = $this->send(
            $this->request('PATCH', "/api/linkrobins-support-tickets/$ticketId", [
                'authenticatedAs' => 3,
                'json' => [
                    'data' => [
                        'type' => 'linkrobins-support-tickets',
                        'id' => (string) $ticketId,
                        'attributes' => [
                            'status' => SupportTicket::STATUS_IN_PROGRESS,
                        ],
                    ],
                ],
            ])
        );

        $this->assertEquals(200, $response->getStatusCode());
        $this->assertEquals(SupportTicket::STATUS_IN_PROGRESS, CustomTestTicketType::$statusChangedTo);
        $this->assertEquals(SupportTicket::STATUS_OPEN, CustomTestTicketType::$statusChangedFrom);
    }

    #[Test]
    public function driver_exception_in_on_status_changed_hook_does_not_break_request(): void
    {
        CustomTestTicketType::resetState();
        CustomTestTicketType::$throwOnStatusChange = true;

        $ticketId = $this->database()->table('linkrobins_support_tickets')->insertGetId([
            'category_id' => 3,
            'user_id' => 2,
            'subject' => 'Failing Hook Ticket',
            'status' => SupportTicket::STATUS_OPEN,
            'created_at' => Carbon::now(),
            'updated_at' => Carbon::now(),
        ]);

        $response = $this->send(
            $this->request('PATCH', "/api/linkrobins-support-tickets/$ticketId", [
                'authenticatedAs' => 3,
                'json' => [
                    'data' => [
                        'type' => 'linkrobins-support-tickets',
                        'id' => (string) $ticketId,
                        'attributes' => [
                            'status' => SupportTicket::STATUS_IN_PROGRESS,
                        ],
                    ],
                ],
            ])
        );

        // Status change succeeds despite third-party hook throwing an exception
        $this->assertEquals(200, $response->getStatusCode());
        $this->assertEquals(
            SupportTicket::STATUS_IN_PROGRESS,
            $this->database()->table('linkrobins_support_tickets')->where('id', $ticketId)->value('status')
        );
    }

    #[Test]
    public function guests_cannot_create_tickets_in_any_category(): void
    {
        $response = $this->send(
            $this->request('GET', '/api/linkrobins-support-categories/1')
        );

        $this->assertEquals(200, $response->getStatusCode());
        $body = json_decode((string) $response->getBody(), true);
        $this->assertFalse($body['data']['attributes']['canCreate']);
    }

    #[Test]
    public function ticket_type_manager_memoizes_driver_instances(): void
    {
        /** @var TicketTypeManager $manager */
        $manager = $this->app()->getContainer()->make(TicketTypeManager::class);

        $first = $manager->get(CustomTestTicketType::ID);
        $second = $manager->get(CustomTestTicketType::ID);

        $this->assertSame($first, $second);
    }
}

class CustomTestTicketType extends AbstractTicketType
{
    public const ID = 'custom_type';
    public static bool $onCreatingCalled = false;
    public static bool $onCreatedCalled = false;
    public static ?string $decidedTo = null;
    public static bool $allowCreate = true;
    public static bool $rateLimitExceeded = false;
    public static ?string $statusChangedTo = null;
    public static ?string $statusChangedFrom = null;
    public static bool $throwOnStatusChange = false;

    public static function resetState(): void
    {
        self::$onCreatingCalled = false;
        self::$onCreatedCalled = false;
        self::$decidedTo = null;
        self::$allowCreate = true;
        self::$rateLimitExceeded = false;
        self::$statusChangedTo = null;
        self::$statusChangedFrom = null;
        self::$throwOnStatusChange = false;
    }

    public function id(): string
    {
        return self::ID;
    }

    public function name(): string
    {
        return 'Custom Ticket Type';
    }

    public function canCreate(User $actor, SupportCategory $category): bool
    {
        return self::$allowCreate;
    }

    public function checkRateLimit(User $actor, SupportCategory $category, RateLimiter $limiter): ?array
    {
        if (self::$rateLimitExceeded) {
            return $limiter->fail('custom_limit', [], 'Custom rate limit exceeded');
        }

        return null;
    }

    public function initialDecision(SupportTicket $ticket): ?string
    {
        return 'pending';
    }

    public function allowedDecisions(): array
    {
        return ['pending', 'accepted', 'rejected'];
    }

    public function canReopen(SupportTicket $ticket, User $actor): bool
    {
        return false;
    }

    public function onCreating(SupportTicket $ticket, array $data, User $actor): void
    {
        self::$onCreatingCalled = true;

        if (isset($data['attributes']['require_code']) && empty($data['attributes']['verification_code'])) {
            throw new BadRequestException('verification_code is required');
        }
    }

    public function onCreated(SupportTicket $ticket, array $data, User $actor): void
    {
        self::$onCreatedCalled = true;
    }

    public function onDecided(SupportTicket $ticket, string $newDecision, ?string $oldDecision, ?User $actor): void
    {
        self::$decidedTo = $newDecision;
    }

    public function onStatusChanged(SupportTicket $ticket, string $newStatus, ?string $oldStatus, ?User $actor): void
    {
        if (self::$throwOnStatusChange) {
            throw new \RuntimeException('Simulated third-party driver hook failure');
        }

        self::$statusChangedTo = $newStatus;
        self::$statusChangedFrom = $oldStatus;
    }
}
