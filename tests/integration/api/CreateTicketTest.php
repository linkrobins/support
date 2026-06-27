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

class CreateTicketTest extends TestCase
{
    use RetrievesAuthorizedUsers;

    public function setUp(): void
    {
        parent::setUp();

        $this->extension('linkrobins-support');

        $this->prepareDatabase([
            'users' => [
                $this->normalUser(), // id 2
            ],
            'linkrobins_support_categories' => [
                ['id' => 1, 'name' => 'General', 'slug' => 'general', 'is_appeal' => 0, 'position' => 0, 'created_at' => Carbon::now(), 'updated_at' => Carbon::now()],
            ],
        ]);
    }

    /**
     * @return array<string, mixed>
     */
    private function ticketBody(array $attributes, bool $withCategory = true): array
    {
        $data = ['attributes' => $attributes];

        if ($withCategory) {
            $data['relationships'] = [
                'category' => ['data' => ['type' => 'linkrobins-support-categories', 'id' => '1']],
            ];
        }

        return ['data' => $data];
    }

    #[Test]
    public function guests_cannot_create_a_ticket(): void
    {
        $response = $this->send(
            $this->request('POST', '/api/linkrobins-support-tickets', [
                'json' => $this->ticketBody(['subject' => 'Help', 'firstPost' => 'Please help.']),
            ])
        );

        // An unauthenticated write is rejected before it can reach the auth
        // gate (Flarum's CSRF guard returns 400 for a tokenless session POST);
        // either way the guarantee that matters is that nothing is persisted.
        $this->assertGreaterThanOrEqual(400, $response->getStatusCode());
        $this->assertEquals(0, $this->database()->table('linkrobins_support_tickets')->count());
    }

    #[Test]
    public function a_ticket_without_a_category_is_rejected(): void
    {
        $response = $this->send(
            $this->request('POST', '/api/linkrobins-support-tickets', [
                'authenticatedAs' => 2,
                'json' => $this->ticketBody(['subject' => 'Help', 'firstPost' => 'Please help.'], withCategory: false),
            ])
        );

        $this->assertEquals(400, $response->getStatusCode());
    }

    #[Test]
    public function a_blank_subject_is_rejected(): void
    {
        $response = $this->send(
            $this->request('POST', '/api/linkrobins-support-tickets', [
                'authenticatedAs' => 2,
                'json' => $this->ticketBody(['subject' => '   ', 'firstPost' => 'Please help.']),
            ])
        );

        $this->assertEquals(400, $response->getStatusCode());
    }

    #[Test]
    public function creating_a_ticket_posts_the_opening_message_as_its_first_reply(): void
    {
        $response = $this->send(
            $this->request('POST', '/api/linkrobins-support-tickets', [
                'authenticatedAs' => 2,
                'json' => $this->ticketBody([
                    'subject' => 'My printer is broken',
                    'firstPost' => 'It will not turn on.',
                ]),
            ])
        );

        $this->assertEquals(201, $response->getStatusCode());

        $ticketId = json_decode($response->getBody()->getContents(), true)['data']['id'];

        // The opening message must have been posted atomically as the ticket's
        // first reply (the house atomic-creation pattern -- no body-less tickets).
        $reply = $this->database()->table('linkrobins_support_replies')
            ->where('ticket_id', $ticketId)
            ->first();

        $this->assertNotNull($reply, 'Expected a first reply to be created alongside the ticket.');
        $this->assertStringContainsString('It will not turn on.', $reply->content);
    }
}
