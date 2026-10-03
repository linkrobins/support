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
 * Searching tickets by subject, reply text or number, and the rule that
 * matters most: a member's search must never match words that only appear
 * in a staff internal note or a deleted reply.
 */
class SearchTicketsTest extends TestCase
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
            'linkrobins_support_categories' => [
                ['id' => 1, 'name' => 'General', 'slug' => 'general', 'is_appeal' => 0, 'position' => 0, 'created_at' => $now, 'updated_at' => $now],
            ],
            'linkrobins_support_tickets' => [
                ['id' => 1, 'category_id' => 1, 'user_id' => 2, 'subject' => 'Avatar Upload fails', 'status' => 'open', 'last_reply_at' => $now, 'created_at' => $now, 'updated_at' => $now],
                ['id' => 2, 'category_id' => 1, 'user_id' => 2, 'subject' => 'Billing question', 'status' => 'open', 'last_reply_at' => $now, 'created_at' => $now, 'updated_at' => $now],
                ['id' => 3, 'category_id' => 1, 'user_id' => 2, 'subject' => 'Something else', 'status' => 'open', 'last_reply_at' => $now, 'created_at' => $now, 'updated_at' => $now],
            ],
            'linkrobins_support_replies' => [
                ['id' => 1, 'ticket_id' => 2, 'user_id' => 2, 'content' => '<t>The invoice total looks wrong.</t>', 'is_internal_note' => 0, 'created_at' => $now, 'updated_at' => $now],
                ['id' => 2, 'ticket_id' => 3, 'user_id' => 3, 'content' => '<t>Suspect a chargeback here.</t>', 'is_internal_note' => 1, 'created_at' => $now, 'updated_at' => $now],
                ['id' => 3, 'ticket_id' => 3, 'user_id' => 2, 'content' => '<t>Removed: my password is hunter2</t>', 'is_internal_note' => 0, 'created_at' => $now, 'updated_at' => $now, 'deleted_at' => $now],
            ],
        ]);
    }

    /** @return list<int> */
    private function search(int $actor, string $q): array
    {
        $response = $this->send(
            $this->request('GET', '/api/linkrobins-support-tickets', ['authenticatedAs' => $actor])
                ->withQueryParams(['filter' => ['q' => $q]])
        );
        $this->assertEquals(200, $response->getStatusCode(), (string) $response->getBody());

        $ids = array_map(fn ($t) => (int) $t['id'], json_decode((string) $response->getBody(), true)['data']);
        sort($ids);

        return $ids;
    }

    #[Test]
    public function it_matches_the_subject_case_insensitively(): void
    {
        $this->assertEquals([1], $this->search(3, 'avatar upload'));
    }

    #[Test]
    public function it_matches_reply_text(): void
    {
        $this->assertEquals([2], $this->search(3, 'invoice'));
    }

    #[Test]
    public function it_matches_a_ticket_number(): void
    {
        $this->assertEquals([3], $this->search(3, '#3'));
    }

    #[Test]
    public function staff_match_internal_notes(): void
    {
        $this->assertEquals([3], $this->search(3, 'chargeback'));
    }

    #[Test]
    public function a_member_never_matches_an_internal_note(): void
    {
        $this->assertEquals([], $this->search(2, 'chargeback'));
    }

    #[Test]
    public function a_member_never_matches_a_deleted_reply(): void
    {
        $this->assertEquals([], $this->search(2, 'hunter2'));
    }

    #[Test]
    public function like_wildcards_in_the_query_are_literal(): void
    {
        // Unescaped, '%' and '_' would match every ticket.
        $this->assertEquals([], $this->search(3, '%'));
        $this->assertEquals([], $this->search(3, '_'));
    }

    #[Test]
    public function the_escape_character_itself_is_literal(): void
    {
        $this->assertEquals([], $this->search(3, '!'));
    }
}
