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

class ListTicketsTest extends TestCase
{
    use RetrievesAuthorizedUsers;

    public function setUp(): void
    {
        parent::setUp();

        $this->extension('linkrobins-support');

        $this->prepareDatabase([
            'users' => [
                $this->normalUser(), // id 2
                ['id' => 3, 'username' => 'other', 'email' => 'other@machine.local', 'is_email_confirmed' => 1, 'password' => 'too-obscure'],
            ],
            'linkrobins_support_categories' => [
                ['id' => 1, 'name' => 'General', 'slug' => 'general', 'is_appeal' => 0, 'position' => 0, 'created_at' => Carbon::now(), 'updated_at' => Carbon::now()],
            ],
            'linkrobins_support_tickets' => [
                ['id' => 1, 'category_id' => 1, 'user_id' => 2, 'subject' => 'Mine', 'status' => 'open', 'last_reply_at' => Carbon::now(), 'created_at' => Carbon::now(), 'updated_at' => Carbon::now()],
                ['id' => 2, 'category_id' => 1, 'user_id' => 3, 'subject' => 'Theirs', 'status' => 'open', 'last_reply_at' => Carbon::now(), 'created_at' => Carbon::now(), 'updated_at' => Carbon::now()],
            ],
        ]);
    }

    #[Test]
    public function guests_cannot_list_tickets(): void
    {
        $response = $this->send(
            $this->request('GET', '/api/linkrobins-support-tickets')
        );

        $this->assertEquals(401, $response->getStatusCode());
    }

    #[Test]
    public function a_user_sees_only_their_own_tickets(): void
    {
        $response = $this->send(
            $this->request('GET', '/api/linkrobins-support-tickets', ['authenticatedAs' => 2])
        );

        $this->assertEquals(200, $response->getStatusCode());

        $data = json_decode($response->getBody()->getContents(), true)['data'];
        $ids = array_map(fn ($ticket) => $ticket['id'], $data);

        $this->assertEquals(['1'], $ids, 'A non-staff user must only see tickets they own.');
    }

    #[Test]
    public function staff_see_every_ticket(): void
    {
        // User 1 is the default admin, who counts as staff.
        $response = $this->send(
            $this->request('GET', '/api/linkrobins-support-tickets', ['authenticatedAs' => 1])
        );

        $this->assertEquals(200, $response->getStatusCode());

        $data = json_decode($response->getBody()->getContents(), true)['data'];
        $ids = array_map(fn ($ticket) => $ticket['id'], $data);
        sort($ids);

        $this->assertEquals(['1', '2'], $ids, 'Staff must see all tickets regardless of owner.');
    }
}
