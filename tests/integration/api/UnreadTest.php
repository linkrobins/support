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
 * Unread markers: a ticket is unread when it has a reply the viewer can see,
 * by someone else, newer than their last visit. The rule worth guarding is
 * that a member is never told about a reply they cannot read.
 */
class UnreadTest extends TestCase
{
    use RetrievesAuthorizedUsers;

    public function setUp(): void
    {
        parent::setUp();

        $this->extension('linkrobins-support');

        $earlier = Carbon::now()->subHour();
        $now = Carbon::now()->subMinute();

        $this->prepareDatabase([
            'users' => [
                $this->normalUser(), // id 2, owns the tickets
                ['id' => 3, 'username' => 'staffa', 'email' => 'staffa@machine.local', 'is_email_confirmed' => 1, 'password' => 'too-obscure'],
                ['id' => 4, 'username' => 'other', 'email' => 'other@machine.local', 'is_email_confirmed' => 1, 'password' => 'too-obscure'],
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
                ['id' => 1, 'name' => 'General', 'slug' => 'general', 'is_appeal' => 0, 'position' => 0, 'created_at' => $earlier, 'updated_at' => $earlier],
            ],
            'linkrobins_support_tickets' => [
                // 1: owner opened it, staff answered publicly.
                ['id' => 1, 'category_id' => 1, 'user_id' => 2, 'subject' => 'Answered', 'status' => 'in_progress', 'last_reply_at' => $now, 'created_at' => $earlier, 'updated_at' => $now],
                // 2: owner opened it, staff added only an internal note.
                ['id' => 2, 'category_id' => 1, 'user_id' => 2, 'subject' => 'Noted', 'status' => 'open', 'last_reply_at' => $now, 'created_at' => $earlier, 'updated_at' => $now],
                // 3: only the owner's own opening message.
                ['id' => 3, 'category_id' => 1, 'user_id' => 2, 'subject' => 'Fresh', 'status' => 'open', 'last_reply_at' => $earlier, 'created_at' => $earlier, 'updated_at' => $earlier],
            ],
            'linkrobins_support_replies' => [
                ['id' => 1, 'ticket_id' => 1, 'user_id' => 2, 'content' => '<t>Help</t>', 'is_internal_note' => 0, 'created_at' => $earlier, 'updated_at' => $earlier],
                ['id' => 2, 'ticket_id' => 1, 'user_id' => 3, 'content' => '<t>On it</t>', 'is_internal_note' => 0, 'created_at' => $now, 'updated_at' => $now],
                ['id' => 3, 'ticket_id' => 2, 'user_id' => 2, 'content' => '<t>Help</t>', 'is_internal_note' => 0, 'created_at' => $earlier, 'updated_at' => $earlier],
                ['id' => 4, 'ticket_id' => 2, 'user_id' => 3, 'content' => '<t>Staff only</t>', 'is_internal_note' => 1, 'created_at' => $now, 'updated_at' => $now],
                ['id' => 5, 'ticket_id' => 3, 'user_id' => 2, 'content' => '<t>Help</t>', 'is_internal_note' => 0, 'created_at' => $earlier, 'updated_at' => $earlier],
            ],
        ]);
    }

    /** @return array<int, bool> ticket id => isUnread */
    private function unreadAs(int $actor): array
    {
        $response = $this->send($this->request('GET', '/api/linkrobins-support-tickets', ['authenticatedAs' => $actor]));
        $this->assertEquals(200, $response->getStatusCode(), (string) $response->getBody());

        $out = [];
        foreach (json_decode((string) $response->getBody(), true)['data'] as $t) {
            $out[(int) $t['id']] = $t['attributes']['isUnread'];
        }
        ksort($out);

        return $out;
    }

    private function markRead(int $actor, int $ticket): int
    {
        return $this->send(
            $this->request('POST', "/api/linkrobins-support-tickets/$ticket/read", ['authenticatedAs' => $actor])
        )->getStatusCode();
    }

    #[Test]
    public function a_member_sees_a_staff_reply_as_unread_but_never_an_internal_note(): void
    {
        $this->assertEquals([1 => true, 2 => false, 3 => false], $this->unreadAs(2));
    }

    #[Test]
    public function staff_see_tickets_with_replies_from_others_as_unread(): void
    {
        // Ticket 1's newest reply is staff's own, but the owner's opening
        // message is still unread for them; ticket 2 likewise.
        $this->assertEquals([1 => true, 2 => true, 3 => true], $this->unreadAs(3));
    }

    #[Test]
    public function opening_a_ticket_marks_it_read_for_that_person_only(): void
    {
        $this->assertEquals(204, $this->markRead(2, 1));

        $this->assertFalse($this->unreadAs(2)[1]);
        $this->assertTrue($this->unreadAs(3)[1]);
    }

    #[Test]
    public function a_member_cannot_mark_someone_elses_ticket_read(): void
    {
        $this->assertEquals(404, $this->markRead(4, 1));
    }

    #[Test]
    public function a_guest_cannot_mark_anything_read(): void
    {
        // Refused before it reaches the controller (Flarum's CSRF check
        // answers 400 for an anonymous POST); either way nothing is written.
        $status = $this->send($this->request('POST', '/api/linkrobins-support-tickets/1/read'))->getStatusCode();
        $this->assertContains($status, [400, 401, 403]);
        $this->assertEquals(0, $this->database()->table('linkrobins_support_reads')->count());
    }

    #[Test]
    public function a_single_ticket_reports_unread_too(): void
    {
        $response = $this->send($this->request('GET', '/api/linkrobins-support-tickets/1', ['authenticatedAs' => 2]));
        $this->assertTrue(json_decode((string) $response->getBody(), true)['data']['attributes']['isUnread']);
    }
}
