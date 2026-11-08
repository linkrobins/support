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
use Illuminate\Cache\RateLimiter as CacheRateLimiter;
use Laminas\Diactoros\ServerRequest;
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
        // middleware layer with 429 Too Many Requests before any database write.
        $response2 = $this->send(
            $this->request('POST', '/api/linkrobins-support-tickets', [
                'authenticatedAs' => 2,
                'json' => $this->ticketBody('Ticket 2', 'Content 2'),
            ])
        );
        $this->assertEquals(429, $response2->getStatusCode());

        // Exactly 1 new ticket was created (1 from fixture + 1 from first request).
        $this->assertEquals(2, $this->database()->table('linkrobins_support_tickets')->count());
    }

    #[Test]
    public function normal_user_rapid_reply_is_throttled(): void
    {
        $response1 = $this->send(
            $this->request('POST', '/api/linkrobins-support-replies', [
                'authenticatedAs' => 2,
                'json' => $this->replyBody(1, 'Reply 1'),
            ])
        );
        $this->assertEquals(201, $response1->getStatusCode());

        // Rapid repeat reply is blocked by the anti-flood throttler.
        $response2 = $this->send(
            $this->request('POST', '/api/linkrobins-support-replies', [
                'authenticatedAs' => 2,
                'json' => $this->replyBody(1, 'Reply 2'),
            ])
        );
        $this->assertEquals(429, $response2->getStatusCode());

        // Exactly 1 new reply was created (1 from fixture + 1 from first request).
        $this->assertEquals(2, $this->database()->table('linkrobins_support_replies')->count());
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

        // First guest attempt records an anti-flood hit keyed by sha1(REMOTE_ADDR).
        $response1 = $this->send(
            $this->guestRequest('POST', '/api/linkrobins-support-tickets', $this->ticketBody('Guest Ticket 1', 'Content'), $ip)
        );
        $this->assertNotEquals(429, $response1->getStatusCode());

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

