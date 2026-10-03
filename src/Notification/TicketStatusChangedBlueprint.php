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

    /**
     * The email's opening line, worded for whoever is reading it. The ticket's
     * owner hears that their ticket moved; staff hearing about something the
     * owner did are told who did what, rather than "your ticket", which was
     * what every recipient used to get.
     */
    public function emailBody(TranslatorInterface $translator, User $recipient): string
    {
        $status = $translator->trans(SupportTicket::statusLabelKey($this->status));
        $ownerId = $this->ticket->user_id === null ? null : (int) $this->ticket->user_id;

        if ($ownerId !== null && (int) $recipient->id === $ownerId) {
            return $translator->trans('linkrobins-support.email.status_changed_body', ['status' => $status]);
        }

        $actorIsOwner = $this->actor !== null && $ownerId !== null && (int) $this->actor->id === $ownerId;
        if ($actorIsOwner && $this->status === SupportTicket::STATUS_OPEN) {
            return $translator->trans('linkrobins-support.email.reopened_by_owner_body', ['name' => $this->actor->display_name]);
        }
        if ($actorIsOwner && $this->status === SupportTicket::STATUS_CLOSED) {
            return $translator->trans('linkrobins-support.email.confirmed_solved_body', ['name' => $this->actor->display_name]);
        }

        return $translator->trans('linkrobins-support.email.status_changed_body_generic', ['status' => $status]);
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
