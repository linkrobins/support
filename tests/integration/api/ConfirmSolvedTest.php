<?php

/*
 * This file is part of linkrobins/support.
 *
 * For detailed copyright and license information, please view the
 * LICENSE file that was distributed with this source code.
 */

namespace LinkRobins\Support\Tests\integration\api;

use Carbon\Carbon;
use Flarum\Locale\TranslatorInterface;
use Flarum\Testing\integration\RetrievesAuthorizedUsers;
use Flarum\Testing\integration\TestCase;
use Flarum\User\User;
use LinkRobins\Support\Notification\TicketStatusChangedBlueprint;
use LinkRobins\Support\SupportTicket;
use PHPUnit\Framework\Attributes\Test;

/**
 * "Did this solve your problem?": the owner of a resolved ticket may close
 * it, and that is all the extra power it gives them.
 */
class ConfirmSolvedTest extends TestCase
{
    use RetrievesAuthorizedUsers;

    protected function allowedRepeatedQueries(): array
    {
        return ['`id` = ? limit ?', '"id" = ? limit ?'];
    }

    public function setUp(): void
    {
        parent::setUp();

        $this->extension('linkrobins-support');

        $now = Carbon::now();
        $t = fn (int $id, int $cat, string $status) => [
            'id' => $id, 'category_id' => $cat, 'user_id' => 2, 'subject' => "T$id", 'status' => $status,
            'last_reply_at' => $now, 'created_at' => $now, 'updated_at' => $now,
        ];

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
                ['id' => 2, 'name' => 'Appeals', 'slug' => 'appeals', 'is_appeal' => 1, 'position' => 1, 'created_at' => $now, 'updated_at' => $now],
            ],
            'linkrobins_support_tickets' => [
                $t(1, 1, 'resolved'),
                $t(2, 1, 'in_progress'),
                $t(3, 2, 'resolved'),
            ],
        ]);
    }

    private function patch(int $actor, int $ticket, array $attributes): int
    {
        return $this->send($this->request('PATCH', "/api/linkrobins-support-tickets/$ticket", [
            'authenticatedAs' => $actor,
            'json' => ['data' => ['type' => 'linkrobins-support-tickets', 'id' => (string) $ticket, 'attributes' => $attributes]],
        ]))->getStatusCode();
    }

    private function row(int $ticket): object
    {
        return $this->database()->table('linkrobins_support_tickets')->where('id', $ticket)->first();
    }

    #[Test]
    public function the_owner_can_close_a_resolved_ticket_and_history_credits_them(): void
    {
        $this->assertEquals(200, $this->patch(2, 1, ['status' => 'closed']));

        $this->assertEquals('closed', $this->row(1)->status);
        $event = $this->database()->table('linkrobins_support_events')->where('ticket_id', 1)->first();
        $this->assertEquals(2, (int) $event->user_id);
        $this->assertEquals('resolved', $event->from_status);
    }

    #[Test]
    public function the_owner_cannot_close_a_ticket_that_is_not_resolved(): void
    {
        $this->patch(2, 2, ['status' => 'closed']);

        $this->assertEquals('in_progress', $this->row(2)->status);
    }

    #[Test]
    public function appeals_stay_staff_only(): void
    {
        $this->patch(2, 3, ['status' => 'closed']);

        $this->assertEquals('resolved', $this->row(3)->status);
    }

    #[Test]
    public function confirming_cannot_be_used_to_change_anything_else(): void
    {
        $this->patch(2, 1, ['status' => 'closed', 'subject' => 'Hijacked', 'priority' => 'urgent']);

        $row = $this->row(1);
        $this->assertEquals('closed', $row->status);
        $this->assertEquals('T1', $row->subject);
        $this->assertEquals('normal', $row->priority);
    }

    #[Test]
    public function the_api_tells_only_the_owner_of_a_resolved_ticket_they_can_confirm(): void
    {
        $as = fn (int $actor, int $ticket) => json_decode((string) $this->send(
            $this->request('GET', "/api/linkrobins-support-tickets/$ticket", ['authenticatedAs' => $actor])
        )->getBody(), true)['data']['attributes']['canConfirmSolved'];

        $this->assertTrue($as(2, 1));
        $this->assertFalse($as(2, 2));
        $this->assertFalse($as(2, 3));
        $this->assertFalse($as(3, 1));
    }

    #[Test]
    public function the_status_email_is_worded_for_its_reader(): void
    {
        $this->app();
        $translator = $this->app()->getContainer()->make(TranslatorInterface::class);
        $ticket = SupportTicket::query()->find(1);
        $owner = User::query()->find(2);
        $staff = User::query()->find(3);

        $confirmed = new TicketStatusChangedBlueprint($ticket, 'closed', 'resolved', $owner);
        $this->assertStringContainsString('confirmed_solved_body', $confirmed->emailBody($translator, $staff));

        // flarum/testing loads no locale files, so these come back as keys,
        // and the fallback substitutes the status parameter into the key text
        // itself. Compare the two readers' wording instead of key names.
        $byStaff = new TicketStatusChangedBlueprint($ticket, 'resolved', 'in_progress', $staff);
        $otherStaff = User::query()->find(1);
        $this->assertNotEquals($byStaff->emailBody($translator, $owner), $byStaff->emailBody($translator, $otherStaff));
        $this->assertStringContainsString('generic', $byStaff->emailBody($translator, $otherStaff));
    }
}
