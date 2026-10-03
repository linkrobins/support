<?php

/*
 * This file is part of linkrobins/support.
 *
 * For detailed copyright and license information, please view the
 * LICENSE file that was distributed with this source code.
 */

namespace LinkRobins\Support\Tests\integration\api;

use Flarum\Testing\integration\RetrievesAuthorizedUsers;
use Flarum\Testing\integration\TestCase;
use PHPUnit\Framework\Attributes\Test;

/**
 * The staff list behind the Assign picker: the whole team for staff, even
 * staff without core's searchUsers permission, and nothing for anyone else.
 */
class StaffListTest extends TestCase
{
    use RetrievesAuthorizedUsers;

    public function setUp(): void
    {
        parent::setUp();

        $this->extension('linkrobins-support');

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
                // Deliberately no searchUsers for this group.
                ['group_id' => 100, 'permission' => 'lr-support.handle_tickets'],
            ],
        ]);
    }

    private function get(?int $actor): array
    {
        $response = $this->send(
            $this->request('GET', '/api/linkrobins-support-staff', $actor === null ? [] : ['authenticatedAs' => $actor])
        );

        return [$response->getStatusCode(), json_decode((string) $response->getBody(), true)];
    }

    #[Test]
    public function staff_without_search_permission_get_the_whole_team(): void
    {
        [$status, $body] = $this->get(3);

        $this->assertEquals(200, $status);
        $usernames = array_column($body['data'], 'username');
        sort($usernames);
        // The admin (id 1) and the support group member; not the plain member.
        $this->assertEquals(['admin', 'staffa'], $usernames);
    }

    #[Test]
    public function a_member_cannot_list_the_team(): void
    {
        [$status] = $this->get(2);

        $this->assertEquals(403, $status);
    }

    #[Test]
    public function a_guest_cannot_list_the_team(): void
    {
        [$status] = $this->get(null);

        $this->assertContains($status, [401, 403]);
    }
}
