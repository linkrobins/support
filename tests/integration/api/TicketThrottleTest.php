<?php

/*
 * This file is part of linkrobins/support.
 *
 * For detailed copyright and license information, please view the
 * LICENSE file that was distributed with this source code.
 */

namespace LinkRobins\Support\Tests\integration\api;

use Carbon\Carbon;
use Flarum\Settings\SettingsRepositoryInterface;
use Flarum\Testing\integration\RetrievesAuthorizedUsers;
use Flarum\Testing\integration\TestCase;
use Flarum\User\Guest;
use Illuminate\Cache\RateLimiter as CacheRateLimiter;
use Illuminate\Contracts\Cache\Repository as CacheRepository;
use Laminas\Diactoros\ServerRequest;
use LinkRobins\Support\RateLimiter as SupportRateLimiter;
use LinkRobins\Support\SupportCategory;
use LinkRobins\Support\SupportTicket;
use LinkRobins\Support\Throttler\TicketCreationThrottler;
use PHPUnit\Framework\Attributes\Test;
use Psr\Http\Message\ServerRequestInterface;

class TicketThrottleTest extends TestCase
{
    use RetrievesAuthorizedUsers;

    /**
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
                $this->normalUser(), // id 2
                ['id' => 3, 'username' => 'staff', 'email' => 'staff@machine.local', 'is_email_confirmed' => 1, 'password' => 'too-obscure'],
                ['id' => 4, 'username' => 'exempt', 'email' => 'exempt@machine.local', 'is_email_confirmed' => 1, 'password' => 'too-obscure'],
            ],
            'groups' => [
                ['id' => 100, 'name_singular' => 'Support Staff', 'name_plural' => 'Support Staff', 'is_hidden' => 0],
                ['id' => 101, 'name_singular' => 'Exempt Group', 'name_plural' => 'Exempt Group', 'is_hidden' => 0],
            ],
            'group_user' => [
                ['user_id' => 3, 'group_id' => 100],
                ['user_id' => 4, 'group_id' => 101],
            ],
            'group_permission' => [
                ['group_id' => 100, 'permission' => 'lr-support.handle_tickets'],
                ['group_id' => 101, 'permission' => 'postWithoutThrottle'],
            ],
            'linkrobins_support_categories' => [
                ['id' => 1, 'name' => 'General', 'slug' => 'general', 'ticket_type' => 'standard', 'position' => 0, 'created_at' => Carbon::now(), 'updated_at' => Carbon::now()],
                ['id' => 2, 'name' => 'Appeals', 'slug' => 'appeals', 'ticket_type' => 'appeal', 'position' => 1, 'created_at' => Carbon::now(), 'updated_at' => Carbon::now()],
            ],
            'linkrobins_support_tickets' => [
                ['id' => 1, 'category_id' => 1, 'user_id' => 2, 'subject' => 'Existing Ticket', 'status' => 'open', 'last_reply_at' => Carbon::now(), 'created_at' => Carbon::now(), 'updated_at' => Carbon::now()],
            ],
            'linkrobins_support_replies' => [
                ['id' => 1, 'ticket_id' => 1, 'user_id' => 2, 'content' => 'First message', 'created_at' => Carbon::now(), 'updated_at' => Carbon::now()],
            ],
        ]);
    }

    /**
     * @return array<string, mixed>
     */
    private function ticketBody(string $subject = 'Help', string $firstPost = 'My problem', int $categoryId = 1): array
    {
        return [
            'data' => [
                'type' => 'linkrobins-support-tickets',
                'attributes' => [
                    'subject' => $subject,
                    'firstPost' => $firstPost,
                ],
                'relationships' => [
                    'category' => [
                        'data' => ['type' => 'linkrobins-support-categories', 'id' => (string) $categoryId],
                    ],
                ],
            ],
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function replyBody(int $ticketId = 1, string $content = 'Another reply'): array
    {
        return [
            'data' => [
                'type' => 'linkrobins-support-replies',
                'attributes' => [
                    'content' => $content,
                ],
                'relationships' => [
                    'ticket' => [
                        'data' => ['type' => 'linkrobins-support-tickets', 'id' => (string) $ticketId],
                    ],
                ],
            ],
        ];
    }

    /**
     * @param array<string, mixed> $json
     */
    private function guestRequest(string $method, string $path, array $json = [], string $ip = '127.0.0.1'): ServerRequestInterface
    {
        $request = (new ServerRequest(['REMOTE_ADDR' => $ip], [], $path, $method))
            ->withAttribute('bypassCsrfToken', true);

        return $this->requestWithJsonBody($request, $json);
    }

    #[Test]
    public function normal_user_rapid_ticket_creation_is_throttled(): void
    {
        $response1 = $this->send(
            $this->request('POST', '/api/linkrobins-support-tickets', [
                'authenticatedAs' => 2,
                'json' => $this->ticketBody('Ticket 1', 'Content 1'),
            ])
        );
        $this->assertEquals(201, $response1->getStatusCode());

        // An immediate repeat attempt by the same actor must be stopped at the
        // middleware layer with 429 Too Many Requests and a detail message.
        $response2 = $this->send(
            $this->request('POST', '/api/linkrobins-support-tickets', [
                'authenticatedAs' => 2,
                'json' => $this->ticketBody('Ticket 2', 'Content 2'),
            ])
        );
        $this->assertEquals(429, $response2->getStatusCode());

        $body2 = json_decode((string) $response2->getBody(), true);
        $this->assertSame('too_many_requests', $body2['errors'][0]['code'] ?? null);
        $this->assertNotEmpty($body2['errors'][0]['detail'] ?? null);

        // Exactly 1 new ticket was created (1 from fixture + 1 from first request).
        $this->assertEquals(2, $this->database()->table('linkrobins_support_tickets')->count());
    }

    #[Test]
    public function normal_user_rapid_replies_are_not_throttled(): void
    {
        $response1 = $this->send(
            $this->request('POST', '/api/linkrobins-support-replies', [
                'authenticatedAs' => 2,
                'json' => $this->replyBody(1, 'Reply 1'),
            ])
        );
        $this->assertEquals(201, $response1->getStatusCode());

        // Rapid repeat replies must not be blocked by the ticket-creation cooldown.
        $response2 = $this->send(
            $this->request('POST', '/api/linkrobins-support-replies', [
                'authenticatedAs' => 2,
                'json' => $this->replyBody(1, 'Reply 2'),
            ])
        );
        $this->assertEquals(201, $response2->getStatusCode());

        $this->assertEquals(3, $this->database()->table('linkrobins_support_replies')->count());
    }

    #[Test]
    public function failed_validation_does_not_burn_throttle_cooldown(): void
    {
        $invalidResponse = $this->send(
            $this->request('POST', '/api/linkrobins-support-tickets', [
                'authenticatedAs' => 2,
                'json' => $this->ticketBody('', 'Valid body'),
            ])
        );
        $this->assertContains($invalidResponse->getStatusCode(), [400, 422]);

        // Corrected retry immediately after validation failure must succeed.
        $validResponse = $this->send(
            $this->request('POST', '/api/linkrobins-support-tickets', [
                'authenticatedAs' => 2,
                'json' => $this->ticketBody('Corrected Subject', 'Valid body'),
            ])
        );
        $this->assertEquals(201, $validResponse->getStatusCode());
    }

    #[Test]
    public function quota_refusal_does_not_burn_throttle_cooldown(): void
    {
        $this->setting('linkrobins-support.general_limit_per_window', '1');
        $this->setting('linkrobins-support.general_window_hours', '24');

        // User 2 already owns ticket #1 from setUp -> quota refusal (403).
        $refused = $this->send(
            $this->request('POST', '/api/linkrobins-support-tickets', [
                'authenticatedAs' => 2,
                'json' => $this->ticketBody('Over quota', 'Content'),
            ])
        );
        $this->assertEquals(403, $refused->getStatusCode());

        // Raise quota via the booted settings repository and immediately retry:
        // the 403 must not have started a 429 cooldown.
        $this->app()->getContainer()->make(SettingsRepositoryInterface::class)
            ->set('linkrobins-support.general_limit_per_window', '10');
        $allowed = $this->send(
            $this->request('POST', '/api/linkrobins-support-tickets', [
                'authenticatedAs' => 2,
                'json' => $this->ticketBody('Now allowed', 'Content'),
            ])
        );
        $this->assertEquals(201, $allowed->getStatusCode());
    }

    #[Test]
    public function staff_with_handle_tickets_permission_is_exempt_from_throttle(): void
    {
        $response1 = $this->send(
            $this->request('POST', '/api/linkrobins-support-tickets', [
                'authenticatedAs' => 3,
                'json' => $this->ticketBody('Staff Ticket 1', 'Content 1'),
            ])
        );
        $this->assertEquals(201, $response1->getStatusCode());

        $response2 = $this->send(
            $this->request('POST', '/api/linkrobins-support-tickets', [
                'authenticatedAs' => 3,
                'json' => $this->ticketBody('Staff Ticket 2', 'Content 2'),
            ])
        );
        $this->assertEquals(201, $response2->getStatusCode());
    }

    #[Test]
    public function user_with_post_without_throttle_permission_is_exempt(): void
    {
        $response1 = $this->send(
            $this->request('POST', '/api/linkrobins-support-tickets', [
                'authenticatedAs' => 4,
                'json' => $this->ticketBody('Exempt Ticket 1', 'Content 1'),
            ])
        );
        $this->assertEquals(201, $response1->getStatusCode());

        $response2 = $this->send(
            $this->request('POST', '/api/linkrobins-support-tickets', [
                'authenticatedAs' => 4,
                'json' => $this->ticketBody('Exempt Ticket 2', 'Content 2'),
            ])
        );
        $this->assertEquals(201, $response2->getStatusCode());
    }

    #[Test]
    public function general_quota_exceeded_returns_403_forbidden(): void
    {
        // Set general ticket limit to 1 per 24 hours.
        $this->setting('linkrobins-support.general_limit_per_window', '1');
        $this->setting('linkrobins-support.general_window_hours', '24');

        // Clear any anti-flood throttle key for user 2 so the request reaches the resource validator.
        $this->app()->getContainer()->make(CacheRateLimiter::class)->clear('linkrobins_support.throttle.ticket.user.2');

        // User 2 already owns ticket #1 created in setUp (within 24 hours).
        $response = $this->send(
            $this->request('POST', '/api/linkrobins-support-tickets', [
                'authenticatedAs' => 2,
                'json' => $this->ticketBody('Over quota ticket', 'Content'),
            ])
        );

        $this->assertEquals(403, $response->getStatusCode());
        $body = json_decode((string) $response->getBody(), true);
        $this->assertNotEmpty($body['errors']);
    }

    #[Test]
    public function guests_are_throttled_by_ip(): void
    {
        $ip = '198.51.100.1';

        // A rejected guest attempt (401/403) must not record an anti-flood hit.
        $req1 = $this->guestRequest('POST', '/api/linkrobins-support-tickets', $this->ticketBody('Guest Ticket 1', 'Content'), $ip);
        $response1 = $this->send($req1);
        $this->assertNotEquals(429, $response1->getStatusCode());

        // Record a hit for that IP (simulating a successful IP-keyed submission).
        $this->app()->getContainer()->make(TicketCreationThrottler::class)->recordHit($req1, new Guest());

        // Rapid repeat attempt by the same guest IP is throttled with 429.
        $response2 = $this->send(
            $this->guestRequest('POST', '/api/linkrobins-support-tickets', $this->ticketBody('Guest Ticket 2', 'Content'), $ip)
        );
        $this->assertEquals(429, $response2->getStatusCode());

        // A different guest IP is not affected by the first IP's cooldown.
        $response3 = $this->send(
            $this->guestRequest('POST', '/api/linkrobins-support-tickets', $this->ticketBody('Other Guest Ticket', 'Content'), '198.51.100.2')
        );
        $this->assertNotEquals(429, $response3->getStatusCode());
    }

    #[Test]
    public function quota_cache_is_cleared_on_delete_restore_category_and_type_changes(): void
    {
        $container = $this->app()->getContainer();
        /** @var CacheRepository $cache */
        $cache = $container->make(CacheRepository::class);
        /** @var SupportRateLimiter $rateLimiter */
        $rateLimiter = $container->make(SupportRateLimiter::class);

        $user = \Flarum\User\User::findOrFail(2);
        $generalCategory = SupportCategory::findOrFail(1);
        $appealCategory = SupportCategory::findOrFail(2);
        $cacheKey = 'linkrobins_support.quota.open_appeals.2';

        // Warm user 2's quota cache.
        $rateLimiter->check($user, $appealCategory);
        $this->assertTrue($cache->has($cacheKey));

        // 1. Soft-delete via PATCH isDeleted=true clears cache.
        $softDelete = $this->send(
            $this->request('PATCH', '/api/linkrobins-support-tickets/1', [
                'authenticatedAs' => 3,
                'json' => ['data' => ['attributes' => ['isDeleted' => true]]],
            ])
        );
        $this->assertEquals(200, $softDelete->getStatusCode());
        $this->assertFalse($cache->has($cacheKey));

        // 2. Restore via PATCH isDeleted=false clears cache.
        $rateLimiter->check($user, $appealCategory);
        $this->assertTrue($cache->has($cacheKey));
        $restore = $this->send(
            $this->request('PATCH', '/api/linkrobins-support-tickets/1', [
                'authenticatedAs' => 3,
                'json' => ['data' => ['attributes' => ['isDeleted' => false]]],
            ])
        );
        $this->assertEquals(200, $restore->getStatusCode());
        $this->assertFalse($cache->has($cacheKey));

        // 3. Moving ticket to another category clears cache.
        $rateLimiter->check($user, $appealCategory);
        $this->assertTrue($cache->has($cacheKey));
        $moveCategory = $this->send(
            $this->request('PATCH', '/api/linkrobins-support-tickets/1', [
                'authenticatedAs' => 3,
                'json' => [
                    'data' => [
                        'relationships' => [
                            'category' => ['data' => ['type' => 'linkrobins-support-categories', 'id' => '2']],
                        ],
                    ],
                ],
            ])
        );
        $this->assertEquals(200, $moveCategory->getStatusCode());
        $this->assertFalse($cache->has($cacheKey));

        // 4. Changing a category's ticket_type clears cache for users with tickets in that category.
        $generalCacheKey = 'linkrobins_support.quota.general.2.24h';
        $rateLimiter->check($user, $appealCategory);
        $rateLimiter->check($user, $generalCategory);
        $this->assertTrue($cache->has($cacheKey));
        $this->assertTrue($cache->has($generalCacheKey));
        $typeChange = $this->send(
            $this->request('PATCH', '/api/linkrobins-support-categories/2', [
                'authenticatedAs' => 1,
                'json' => ['data' => ['attributes' => ['ticketType' => 'standard']]],
            ])
        );
        $this->assertEquals(200, $typeChange->getStatusCode());
        $this->assertFalse($cache->has($cacheKey));
        $this->assertFalse($cache->has($generalCacheKey));

        // 5. Force-delete clears cache.
        $this->send(
            $this->request('PATCH', '/api/linkrobins-support-tickets/1', [
                'authenticatedAs' => 3,
                'json' => ['data' => ['attributes' => ['isDeleted' => true]]],
            ])
        );
        $rateLimiter->check($user, $appealCategory);
        $this->assertTrue($cache->has($cacheKey));
        $forceDelete = $this->send(
            $this->request('DELETE', '/api/linkrobins-support-tickets/1', [
                'authenticatedAs' => 1,
            ])
        );
        $this->assertEquals(204, $forceDelete->getStatusCode());
        $this->assertFalse($cache->has($cacheKey));
    }

    #[Test]
    public function unrelated_routes_are_not_throttled(): void
    {
        // User creates a ticket, consuming their rate limit for ticket creation.
        $this->send(
            $this->request('POST', '/api/linkrobins-support-tickets', [
                'authenticatedAs' => 2,
                'json' => $this->ticketBody('Ticket 1', 'Content'),
            ])
        );

        // Unrelated endpoints (e.g. categories index) must not be throttled.
        $response = $this->send(
            $this->request('GET', '/api/linkrobins-support-categories', [
                'authenticatedAs' => 2,
            ])
        );
        $this->assertEquals(200, $response->getStatusCode());
    }
}

