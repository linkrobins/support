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
 * Fired when someone deliberately changes a ticket's status -- picking a new
 * one from the staff bar, closing it, or an owner reopening their own ticket.
 *
 * Only deliberate changes. Replying to a ticket also moves its status (a staff
 * reply takes an open ticket to in progress, and so on), but that is a side
 * effect of a message the other party is already being notified about; sending
 * a second notification saying the status moved would be noise. Those
 * transitions happen on the model, this fires from the API resource, so the
 * two never overlap.
 */
class TicketStatusChangedBlueprint implements BlueprintInterface, AlertableInterface, MailableInterface
{
    public function __construct(
        public SupportTicket $ticket,
        public string $status,
        public ?string $previousStatus,
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
            'status' => $this->status,
            'previousStatus' => $this->previousStatus,
        ];
    }

    public function getEmailViews(): array
    {
        return [
            'text' => 'linkrobins-support::emails.plain.status_changed',
            'html' => 'linkrobins-support::emails.html.status_changed',
        ];
    }

    public function getEmailSubject(TranslatorInterface $translator): string
    {
        return $translator->trans('linkrobins-support.email.status_changed_subject', [
            'subject' => $this->ticket->subject,
            'status' => $translator->trans(SupportTicket::statusLabelKey($this->status)),
        ]);
    }

    public static function getType(): string
    {
        return 'linkrobinsSupportTicketStatusChanged';
    }

    public static function getSubjectModel(): string
    {
        return SupportTicket::class;
    }
}
