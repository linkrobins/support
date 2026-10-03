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
 * A one-off nudge to a ticket's owner when staff have been waiting on their
 * reply for a while. Sent by the forum, not by a person, so it has no sender.
 */
class AwaitingReplyReminderBlueprint implements BlueprintInterface, AlertableInterface, MailableInterface
{
    public function __construct(
        public SupportTicket $ticket,
    ) {
    }

    public function getFromUser(): ?User
    {
        return null;
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
            'text' => 'linkrobins-support::emails.plain.awaiting_reminder',
            'html' => 'linkrobins-support::emails.html.awaiting_reminder',
        ];
    }

    public function getEmailSubject(TranslatorInterface $translator): string
    {
        return $translator->trans('linkrobins-support.email.awaiting_reminder_subject', [
            'subject' => $this->ticket->subject,
        ]);
    }

    public static function getType(): string
    {
        return 'linkrobinsSupportAwaitingReminder';
    }

    public static function getSubjectModel(): string
    {
        return SupportTicket::class;
    }
}
