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
 * Fired when a ticket is handed to a staff member by someone else.
 *
 * Assignment used to be silent in both directions: the person a ticket was
 * handed to found out by going and looking at the list. Claiming a ticket
 * yourself still sends nothing, because you already know.
 */
class TicketAssignedBlueprint implements BlueprintInterface, AlertableInterface, MailableInterface
{
    public function __construct(
        public SupportTicket $ticket,
        public ?User $actor = null,
    ) {
    }

    public function getFromUser(): ?User
    {
        return $this->actor;
    }

    public function getSubject(): ?AbstractModel
    {
        return $this->ticket;
    }

    public function getData(): array
    {
        return [
            'ticketId' => (int) $this->ticket->id,
        ];
    }

    public function getEmailViews(): array
    {
        return [
            'text' => 'linkrobins-support::emails.plain.assigned',
            'html' => 'linkrobins-support::emails.html.assigned',
        ];
    }

    public function getEmailSubject(TranslatorInterface $translator): string
    {
        return $translator->trans('linkrobins-support.email.assigned_subject', [
            'subject' => $this->ticket->subject,
        ]);
    }

    public static function getType(): string
    {
        return 'linkrobinsSupportTicketAssigned';
    }

    public static function getSubjectModel(): string
    {
        return SupportTicket::class;
    }
}
