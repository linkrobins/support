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
use LinkRobins\Support\SupportTicket;
use PHPUnit\Framework\Attributes\Test;
use Symfony\Component\Yaml\Yaml;

/**
 * Status changes and assignments were silent: a ticket could be closed,
 * resolved or handed to someone and nobody was told. These cover who now hears
 * about each, and -- just as importantly -- who does not, since the easiest way
 * to make notifications useless is to send too many.
 */
class StatusNotificationTest extends TestCase
{
    use RetrievesAuthorizedUsers;

    /**
     * See CategoryDefaultAssigneeTest: notifying N people costs N user lookups
     * inside Flarum's own email driver, which is the repetition the detector
     * sees here too.
     *
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
                $this->normalUser(), // id 2, owns the ticket
                ['id' => 3, 'username' => 'staffa', 'email' => 'staffa@machine.local', 'is_email_confirmed' => 1, 'password' => 'too-obscure'],
                ['id' => 4, 'username' => 'staffb', 'email' => 'staffb@machine.local', 'is_email_confirmed' => 1, 'password' => 'too-obscure'],
            ],
            'groups' => [
                ['id' => 100, 'name_singular' => 'Support', 'name_plural' => 'Support', 'is_hidden' => 0],
            ],
            'group_user' => [
                ['user_id' => 3, 'group_id' => 100],
                ['user_id' => 4, 'group_id' => 100],
            ],
            'group_permission' => [
                ['group_id' => 100, 'permission' => 'linkrobins-support.handle_tickets'],
            ],
            'linkrobins_support_categories' => [
                ['id' => 1, 'name' => 'General', 'slug' => 'general', 'is_appeal' => 0, 'position' => 0, 'created_at' => Carbon::now(), 'updated_at' => Carbon::now()],
            ],
            'linkrobins_support_tickets' => [
                ['id' => 1, 'category_id' => 1, 'user_id' => 2, 'subject' => 'Mine', 'status' => 'open', 'last_reply_at' => Carbon::now(), 'created_at' => Carbon::now(), 'updated_at' => Carbon::now()],
            ],
        ]);
    }

    private function setStatus(int $actor, string $status, int $ticket = 1): int
    {
        $response = $this->send(
            $this->request('PATCH', '/api/linkrobins-support-tickets/'.$ticket, [
                'authenticatedAs' => $actor,
                'json' => ['data' => ['type' => 'linkrobins-support-tickets', 'id' => (string) $ticket, 'attributes' => ['status' => $status]]],
            ])
        );

        return $response->getStatusCode();
    }

    /** @return list<int> */
    private function notifiedOf(string $type): array
    {
        $ids = $this->database()->table('notifications')
            ->where('type', $type)
            ->pluck('user_id')
            ->map(fn ($id) => (int) $id)
            ->all();

        sort($ids);

        return $ids;
    }

    private const STATUS = 'linkrobinsSupportTicketStatusChanged';
    private const ASSIGNED = 'linkrobinsSupportTicketAssigned';

    #[Test]
    public function closing_a_ticket_notifies_the_person_who_opened_it(): void
    {
        $this->assertEquals(200, $this->setStatus(3, 'closed'));
        $this->assertEquals([2], $this->notifiedOf(self::STATUS));
    }

    #[Test]
    public function resolving_a_ticket_notifies_the_person_who_opened_it(): void
    {
        $this->assertEquals(200, $this->setStatus(3, 'resolved'));
        $this->assertEquals([2], $this->notifiedOf(self::STATUS));
    }

    #[Test]
    public function a_status_change_does_not_notify_other_staff(): void
    {
        // Staff coordinate through the ticket itself; a status change is for
        // the person waiting on it.
        $this->setStatus(3, 'awaiting_user');
        $this->assertEquals([2], $this->notifiedOf(self::STATUS));
    }

    #[Test]
    public function the_person_making_the_change_is_never_notified(): void
    {
        // Staff member 3 changes it; 3 must not hear about their own action.
        $this->setStatus(3, 'resolved');
        $this->assertNotContains(3, $this->notifiedOf(self::STATUS));
    }

    #[Test]
    public function an_owner_reopening_their_ticket_notifies_staff(): void
    {
        $this->setStatus(3, 'closed');
        $this->database()->table('notifications')->delete();

        $this->assertEquals(200, $this->setStatus(2, 'open'));

        // Unassigned, so the whole staff list: 1 is the default admin.
        $this->assertEquals([1, 3, 4], $this->notifiedOf(self::STATUS));
    }

    #[Test]
    public function an_owner_reopening_an_assigned_ticket_notifies_only_the_assignee(): void
    {
        $this->database()->table('linkrobins_support_tickets')->where('id', 1)->update(['assigned_staff_id' => 4]);
        $this->setStatus(3, 'closed');
        $this->database()->table('notifications')->delete();

        $this->setStatus(2, 'open');

        $this->assertEquals([4], $this->notifiedOf(self::STATUS), 'A reopened ticket should follow the same radius as a new one.');
    }

    #[Test]
    public function setting_the_same_status_again_notifies_nobody(): void
    {
        $this->setStatus(3, 'resolved');
        $this->database()->table('notifications')->delete();

        $this->setStatus(3, 'resolved');

        $this->assertEquals([], $this->notifiedOf(self::STATUS));
    }

    #[Test]
    public function replying_moves_the_status_without_a_status_notification(): void
    {
        // A staff reply takes an open ticket to in progress. The owner is
        // already being told about the reply; a second notification saying the
        // status moved is noise, and this is the guard against it.
        $response = $this->send(
            $this->request('POST', '/api/linkrobins-support-replies', [
                'authenticatedAs' => 3,
                'json' => ['data' => [
                    'attributes' => ['content' => 'Looking into it.'],
                    'relationships' => ['ticket' => ['data' => ['type' => 'linkrobins-support-tickets', 'id' => '1']]],
                ]],
            ])
        );

        $this->assertEquals(201, $response->getStatusCode(), (string) $response->getBody());
        $this->assertEquals(
            SupportTicket::STATUS_IN_PROGRESS,
            $this->database()->table('linkrobins_support_tickets')->where('id', 1)->value('status'),
            'the reply should still advance the status'
        );
        $this->assertEquals([], $this->notifiedOf(self::STATUS), 'but it must not also send a status notification');
    }

    #[Test]
    public function assigning_a_ticket_to_someone_notifies_them(): void
    {
        $response = $this->send(
            $this->request('PATCH', '/api/linkrobins-support-tickets/1', [
                'authenticatedAs' => 3,
                'json' => ['data' => [
                    'type' => 'linkrobins-support-tickets', 'id' => '1',
                    'relationships' => ['assignedStaff' => ['data' => ['type' => 'users', 'id' => '4']]],
                ]],
            ])
        );

        $this->assertEquals(200, $response->getStatusCode(), (string) $response->getBody());
        $this->assertEquals([4], $this->notifiedOf(self::ASSIGNED));
    }

    #[Test]
    public function claiming_a_ticket_yourself_notifies_nobody(): void
    {
        $this->send(
            $this->request('PATCH', '/api/linkrobins-support-tickets/1', [
                'authenticatedAs' => 4,
                'json' => ['data' => [
                    'type' => 'linkrobins-support-tickets', 'id' => '1',
                    'relationships' => ['assignedStaff' => ['data' => ['type' => 'users', 'id' => '4']]],
                ]],
            ])
        );

        $this->assertEquals([], $this->notifiedOf(self::ASSIGNED), 'you already know you claimed it');
    }

    #[Test]
    public function unassigning_notifies_nobody(): void
    {
        $this->database()->table('linkrobins_support_tickets')->where('id', 1)->update(['assigned_staff_id' => 4]);

        $this->send(
            $this->request('PATCH', '/api/linkrobins-support-tickets/1', [
                'authenticatedAs' => 3,
                'json' => ['data' => [
                    'type' => 'linkrobins-support-tickets', 'id' => '1',
                    'relationships' => ['assignedStaff' => ['data' => null]],
                ]],
            ])
        );

        $this->assertEquals([], $this->notifiedOf(self::ASSIGNED));
    }

    #[Test]
    public function every_status_has_a_label_defined_in_the_locale(): void
    {
        // Guards the one status whose locale key does not match its constant:
        // STATUS_AWAITING_USER is called "awaiting_response" in en.yml, so
        // building the key by concatenation would put a raw
        // `...status.awaiting_user` in front of a customer in an email.
        //
        // Read from en.yml rather than through the translator: flarum/testing
        // does not load an extension's locale files, so every key would come
        // back raw here and the test would prove nothing.
        $strings = Yaml::parseFile(__DIR__.'/../../../locale/en.yml');

        foreach (SupportTicket::ALL_STATUSES as $status) {
            $key = SupportTicket::statusLabelKey($status);
            $path = explode('.', $key);

            $node = $strings;
            foreach ($path as $segment) {
                $this->assertIsArray($node, "status '$status': key '$key' does not resolve");
                $this->assertArrayHasKey($segment, $node, "status '$status': key '$key' is not defined in en.yml");
                $node = $node[$segment];
            }

            $this->assertIsString($node);
            $this->assertNotEmpty($node, "status '$status' has an empty label");
        }
    }
}
