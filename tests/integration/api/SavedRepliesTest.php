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
 * Saved replies: staff can read them, only admins can change them, and
 * members never see the list.
 */
class SavedRepliesTest extends TestCase
{
    use RetrievesAuthorizedUsers;

    public function setUp(): void
    {
        parent::setUp();

        $this->extension('linkrobins-support');

        $now = Carbon::now();

        $this->prepareDatabase([
            'users' => [
                $this->normalUser(), // id 2
                ['id' => 3, 'username' => 'staffa', 'email' => 'staffa@machine.local', 'is_email_confirmed' => 1, 'password' => 'too-obscure'],
            ],
            'groups' => [
                ['id' => 100, 'name_singular' => 'Support', 'name_plural' => 'Support', 'is_hidden' => 0],
            ],
            'group_user' => [
                ['user_id' => 3, 'group_id' => 100],
            ],
            'group_permission' => [
                ['group_id' => 100, 'permission' => 'lr-support.handle_tickets'],
            ],
            'linkrobins_support_saved_replies' => [
                ['id' => 1, 'title' => 'Need your URL', 'content' => 'Could you share your forum URL?', 'position' => 2, 'created_at' => $now, 'updated_at' => $now],
                ['id' => 2, 'title' => 'Fixed next release', 'content' => 'This is fixed in the next release.', 'position' => 1, 'created_at' => $now, 'updated_at' => $now],
            ],
        ]);
    }

    /** @return array{int, mixed} */
    private function call(string $method, string $path, ?int $actor, ?array $json = null): array
    {
        $options = [];
        if ($actor !== null) {
            $options['authenticatedAs'] = $actor;
        }
        if ($json !== null) {
            $options['json'] = $json;
        }
        $response = $this->send($this->request($method, $path, $options));

        return [$response->getStatusCode(), json_decode((string) $response->getBody(), true)];
    }

    #[Test]
    public function staff_list_saved_replies_in_their_set_order(): void
    {
        [$status, $body] = $this->call('GET', '/api/linkrobins-support-saved-replies', 3);

        $this->assertEquals(200, $status);
        $this->assertEquals(['Fixed next release', 'Need your URL'], array_map(fn ($r) => $r['attributes']['title'], $body['data']));
    }

    #[Test]
    public function a_member_sees_none(): void
    {
        [$status, $body] = $this->call('GET', '/api/linkrobins-support-saved-replies', 2);

        $this->assertEquals(200, $status);
        $this->assertEquals([], $body['data']);
    }

    #[Test]
    public function an_admin_can_add_one(): void
    {
        [$status, $body] = $this->call('POST', '/api/linkrobins-support-saved-replies', 1, ['data' => [
            'type' => 'linkrobins-support-saved-replies',
            'attributes' => ['title' => 'Thanks', 'content' => 'Thanks for the report!'],
        ]]);

        $this->assertEquals(201, $status, json_encode($body));
        $this->assertEquals('Thanks', $body['data']['attributes']['title']);
    }

    #[Test]
    public function staff_cannot_change_the_library(): void
    {
        [$status] = $this->call('POST', '/api/linkrobins-support-saved-replies', 3, ['data' => [
            'type' => 'linkrobins-support-saved-replies',
            'attributes' => ['title' => 'Mine', 'content' => 'Text'],
        ]]);
        $this->assertEquals(403, $status);

        [$status] = $this->call('DELETE', '/api/linkrobins-support-saved-replies/1', 3);
        $this->assertEquals(403, $status);
    }

    #[Test]
    public function a_title_is_required(): void
    {
        [$status] = $this->call('POST', '/api/linkrobins-support-saved-replies', 1, ['data' => [
            'type' => 'linkrobins-support-saved-replies',
            'attributes' => ['title' => '', 'content' => 'Text'],
        ]]);

        $this->assertEquals(422, $status);
    }
}
