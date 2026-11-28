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
use Flarum\User\User;
use Illuminate\Cache\RateLimiter as CacheRateLimiter;
use Illuminate\Contracts\Cache\Repository as CacheRepository;
use LinkRobins\Support\RateLimiter as SupportRateLimiter;
use LinkRobins\Support\SupportCategory;
use LinkRobins\Support\SupportTicket;
use LinkRobins\Support\Throttler\TicketCreationThrottler;
use PHPUnit\Framework\Attributes\Test;

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
                ['id' => 5, 'username' => 'other', 'email' => 'other@machine.local', 'is_email_confirmed' => 1, 'password' => 'too-obscure'],
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
        // middleware layer with 429 too_many_requests before any database write.
        $response2 = $this->send(
            $this->request('POST', '/api/linkrobins-support-tickets', [
                'authenticatedAs' => 2,
                'json' => $this->ticketBody('Ticket 2', 'Content 2'),
            ])
        );
        $this->assertEquals(429, $response2->getStatusCode());

        $body2 = json_decode((string) $response2->getBody(), true);
        $this->assertSame('too_many_requests', $body2['errors'][0]['code'] ?? null);

        // Exactly 1 new ticket was created (1 from fixture + 1 from first request).
        $this->assertEquals(2, $this->database()->table('linkrobins_support_tickets')->count());
    }

    #[Test]
    public function throttle_cooldown_expires_after_timeout(): void
    {
        $originalTimeout = TicketCreationThrottler::$timeout;
        TicketCreationThrottler::$timeout = 1;

        try {
            $first = $this->send(
                $this->request('POST', '/api/linkrobins-support-tickets', [
                    'authenticatedAs' => 2,
                    'json' => $this->ticketBody('Ticket 1', 'Content 1'),
                ])
            );
            $this->assertEquals(201, $first->getStatusCode());

            $blocked = $this->send(
                $this->request('POST', '/api/linkrobins-support-tickets', [
                    'authenticatedAs' => 2,
                    'json' => $this->ticketBody('Blocked Retry', 'Content'),
                ])
            );
            $this->assertEquals(429, $blocked->getStatusCode());

            sleep(2);

            $afterCooldown = $this->send(
                $this->request('POST', '/api/linkrobins-support-tickets', [
                    'authenticatedAs' => 2,
                    'json' => $this->ticketBody('After Cooldown', 'Content 2'),
                ])
            );
            $this->assertEquals(201, $afterCooldown->getStatusCode());
        } finally {
            TicketCreationThrottler::$timeout = $originalTimeout;
        }
    }

    #[Test]
    public function one_users_cooldown_does_not_affect_another_user(): void
    {
        $user2First = $this->send(
            $this->request('POST', '/api/linkrobins-support-tickets', [
                'authenticatedAs' => 2,
                'json' => $this->ticketBody('User 2 Ticket', 'Content'),
            ])
        );
        $this->assertEquals(201, $user2First->getStatusCode());

        $user2Blocked = $this->send(
            $this->request('POST', '/api/linkrobins-support-tickets', [
                'authenticatedAs' => 2,
                'json' => $this->ticketBody('User 2 Retry', 'Content'),
            ])
        );
        $this->assertEquals(429, $user2Blocked->getStatusCode());

        $user5Allowed = $this->send(
            $this->request('POST', '/api/linkrobins-support-tickets', [
                'authenticatedAs' => 5,
                'json' => $this->ticketBody('User 5 Ticket', 'Content'),
            ])
        );
        $this->assertEquals(201, $user5Allowed->getStatusCode());
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
    public function guests_are_rejected_without_triggering_throttle(): void
    {
        $response1 = $this->send(
            $this->request('POST', '/api/linkrobins-support-tickets', [
                'json' => $this->ticketBody('Guest Ticket 1', 'Content'),
            ])->withAttribute('bypassCsrfToken', true)
        );
        $this->assertContains($response1->getStatusCode(), [401, 403]);

        $response2 = $this->send(
            $this->request('POST', '/api/linkrobins-support-tickets', [
                'json' => $this->ticketBody('Guest Ticket 2', 'Content'),
            ])->withAttribute('bypassCsrfToken', true)
        );
        $this->assertContains($response2->getStatusCode(), [401, 403]);
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
    public function quota_cache_is_cleared_after_successful_ticket_create(): void
    {
        $this->setting('linkrobins-support.general_limit_per_window', '2');
        $this->setting('linkrobins-support.general_window_hours', '24');

        $container = $this->app()->getContainer();
        /** @var CacheRepository $cache */
        $cache = $container->make(CacheRepository::class);
        /** @var SupportRateLimiter $rateLimiter */
        $rateLimiter = $container->make(SupportRateLimiter::class);

        $user2 = User::findOrFail(2);
        $user5 = User::findOrFail(5);
        $generalCategory = SupportCategory::findOrFail(1);
        $appealCategory = SupportCategory::findOrFail(2);

        $generalKey = 'linkrobins_support.quota.general.2.24h';
        $openAppealsKey = 'linkrobins_support.quota.open_appeals.5';
        $windowAppealsKey = 'linkrobins_support.quota.appeals.5.30d';

        // Warm user 2 general quota cache (1 < limit 2).
        $beforeGeneral = $rateLimiter->check($user2, $generalCategory);
        $this->assertTrue($beforeGeneral['ok']);
        $this->assertTrue($cache->has($generalKey));

        $generalCreate = $this->send(
            $this->request('POST', '/api/linkrobins-support-tickets', [
                'authenticatedAs' => 2,
                'json' => $this->ticketBody('User 2 Second Ticket', 'Content', 1),
            ])
        );
        $this->assertEquals(201, $generalCreate->getStatusCode());
        $this->assertFalse($cache->has($generalKey));

        $afterGeneral = $rateLimiter->check($user2, $generalCategory);
        $this->assertFalse($afterGeneral['ok']);
        $this->assertEquals(SupportRateLimiter::REASON_GENERAL_QUOTA, $afterGeneral['reason']);
        $this->assertEquals(2, $afterGeneral['meta']['count']);

        // Warm user 5 appeal quota caches and verify appeal creation clears both.
        $beforeAppeal = $rateLimiter->check($user5, $appealCategory);
        $this->assertTrue($beforeAppeal['ok']);
        $this->assertTrue($cache->has($openAppealsKey));
        $this->assertTrue($cache->has($windowAppealsKey));

        $appealCreate = $this->send(
            $this->request('POST', '/api/linkrobins-support-tickets', [
                'authenticatedAs' => 5,
                'json' => $this->ticketBody('User 5 Appeal', 'Appeal body', 2),
            ])
        );
        $this->assertEquals(201, $appealCreate->getStatusCode());
        $this->assertFalse($cache->has($openAppealsKey));
        $this->assertFalse($cache->has($windowAppealsKey));

        $afterAppeal = $rateLimiter->check($user5, $appealCategory);
        $this->assertFalse($afterAppeal['ok']);
        $this->assertEquals(SupportRateLimiter::REASON_APPEAL_HAS_OPEN, $afterAppeal['reason']);
    }

    #[Test]
    public function locked_transaction_recheck_ignores_stale_cached_quota(): void
    {
        $this->setting('linkrobins-support.general_limit_per_window', '1');
        $this->setting('linkrobins-support.general_window_hours', '24');

        $container = $this->app()->getContainer();
        /** @var CacheRepository $cache */
        $cache = $container->make(CacheRepository::class);

        // Seed a stale cached count of 0 so creating() passes the fast path,
        // forcing the row-locked check in create() (fresh: true) to catch the
        // existing committed ticket #1 for user 2.
        $cache->put('linkrobins_support.quota.general.2.24h', 0, 60);

        $response = $this->send(
            $this->request('POST', '/api/linkrobins-support-tickets', [
                'authenticatedAs' => 2,
                'json' => $this->ticketBody('Bypass Attempt', 'Content', 1),
            ])
        );
        $this->assertEquals(403, $response->getStatusCode());
        $this->assertEquals(1, $this->database()->table('linkrobins_support_tickets')->where('user_id', 2)->count());
    }

    #[Test]
    public function quota_cache_stays_accurate_against_real_database_counts(): void
    {
        $this->setting('linkrobins-support.appeal_max_concurrent_open', '2');
        $this->setting('linkrobins-support.appeal_limit_per_window', '3');
        $this->setting('linkrobins-support.appeal_window_days', '30');
        $this->setting('linkrobins-support.general_limit_per_window', '1');
        $this->setting('linkrobins-support.general_window_hours', '24');

        $now = Carbon::now();
        $this->database()->table('linkrobins_support_tickets')->insert([
            ['category_id' => 2, 'user_id' => 5, 'subject' => 'Open Appeal', 'status' => 'open', 'last_reply_at' => $now, 'created_at' => $now, 'updated_at' => $now, 'deleted_at' => null],
            ['category_id' => 2, 'user_id' => 5, 'subject' => 'Resolved Appeal', 'status' => 'resolved', 'last_reply_at' => $now, 'created_at' => $now, 'updated_at' => $now, 'deleted_at' => null],
            ['category_id' => 2, 'user_id' => 5, 'subject' => 'Trashed Appeal', 'status' => 'open', 'last_reply_at' => $now, 'created_at' => $now, 'updated_at' => $now, 'deleted_at' => $now],
            ['category_id' => 2, 'user_id' => 5, 'subject' => 'Expired Appeal', 'status' => 'resolved', 'last_reply_at' => $now->copy()->subDays(31), 'created_at' => $now->copy()->subDays(31), 'updated_at' => $now->copy()->subDays(31), 'deleted_at' => null],
            ['category_id' => 1, 'user_id' => 5, 'subject' => 'Recent General', 'status' => 'open', 'last_reply_at' => $now, 'created_at' => $now, 'updated_at' => $now, 'deleted_at' => null],
        ]);

        $container = $this->app()->getContainer();
        /** @var SupportRateLimiter $rateLimiter */
        $rateLimiter = $container->make(SupportRateLimiter::class);

        $user5 = User::findOrFail(5);
        $generalCategory = SupportCategory::findOrFail(1);
        $appealCategory = SupportCategory::findOrFail(2);

        // Open appeal count = 1 (< 2), while 30d window count = 3 (includes resolved + trashed, excludes 31d-old).
        $appealCheck = $rateLimiter->check($user5, $appealCategory);
        $this->assertFalse($appealCheck['ok']);
        $this->assertEquals(SupportRateLimiter::REASON_APPEAL_QUOTA, $appealCheck['reason']);
        $this->assertEquals(3, $appealCheck['meta']['count']);

        // General 24h count = 1.
        $generalCheck = $rateLimiter->check($user5, $generalCategory);
        $this->assertFalse($generalCheck['ok']);
        $this->assertEquals(SupportRateLimiter::REASON_GENERAL_QUOTA, $generalCheck['reason']);
        $this->assertEquals(1, $generalCheck['meta']['count']);
    }

    #[Test]
    public function unrelated_routes_are_not_throttled(): void
    {
        // User creates a ticket, consuming their rate limit for ticket creation.
        $create = $this->send(
            $this->request('POST', '/api/linkrobins-support-tickets', [
                'authenticatedAs' => 2,
                'json' => $this->ticketBody('Ticket 1', 'Content'),
            ])
        );
        $this->assertEquals(201, $create->getStatusCode());

        // Unrelated endpoints (e.g. categories index) must not be throttled.
        $response = $this->send(
            $this->request('GET', '/api/linkrobins-support-categories', [
                'authenticatedAs' => 2,
            ])
        );
        $this->assertEquals(200, $response->getStatusCode());
    }
}

