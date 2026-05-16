<?php

namespace LinkRobins\Support\Notification;

use Flarum\Database\AbstractModel;
use Flarum\Locale\TranslatorInterface;
use Flarum\Notification\AlertableInterface;
use Flarum\Notification\Blueprint\BlueprintInterface;
use Flarum\Notification\MailableInterface;
use Flarum\User\User;
use LinkRobins\Support\SupportTicket;

/**
 * Notification fired when a new ticket is opened. Goes out to all
 * staff (admins + users with `linkrobins-support.handle_tickets`).
 * Staff can opt out per-driver in their notification preferences.
 *
 * Self-notification: if a staff member opens a ticket themselves
 * (rare but possible for testing or for them to track their own
 * issues), the dispatcher excludes them from the recipient list.
 */
class NewSupportTicketBlueprint implements BlueprintInterface, AlertableInterface, MailableInterface
{
    public function __construct(
        public SupportTicket $ticket
    ) {
    }

    public function getFromUser(): ?User
    {
        return $this->ticket->user;
    }

    public function getSubject(): ?AbstractModel
    {
        return $this->ticket;
    }

    public function getData(): array
    {
        return [
            'ticketId' => (int) $this->ticket->id,
            'isAppeal' => $this->ticket->isAppeal(),
        ];
    }

    public function getEmailViews(): array
    {
        return [
            'text' => 'linkrobins-support::emails.plain.new_ticket',
            'html' => 'linkrobins-support::emails.html.new_ticket',
        ];
    }

    public function getEmailSubject(TranslatorInterface $translator): string
    {
        $prefix = $this->ticket->isAppeal() ? '[Support / Appeal]' : '[Support]';
        return $prefix . ' New ticket: ' . $this->ticket->subject;
    }

    public static function getType(): string
    {
        return 'linkrobinsSupportNewTicket';
    }

    public static function getSubjectModel(): string
    {
        return SupportTicket::class;
    }
}
