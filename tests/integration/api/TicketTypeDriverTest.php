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
}

class CustomTestTicketType extends AbstractTicketType
{
    public const ID = 'custom_type';
    public static bool $onCreatingCalled = false;
    public static bool $onCreatedCalled = false;
    public static ?string $decidedTo = null;
    public static bool $allowCreate = true;
    public static bool $rateLimitExceeded = false;

    public static function resetState(): void
    {
        self::$onCreatingCalled = false;
        self::$onCreatedCalled = false;
        self::$decidedTo = null;
        self::$allowCreate = true;
        self::$rateLimitExceeded = false;
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
}
