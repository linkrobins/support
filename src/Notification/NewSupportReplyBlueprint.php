<?php

namespace LinkRobins\Support\Notification;

use Flarum\Database\AbstractModel;
use Flarum\Locale\TranslatorInterface;
use Flarum\Notification\AlertableInterface;
use Flarum\Notification\Blueprint\BlueprintInterface;
use Flarum\Notification\MailableInterface;
use Flarum\User\User;
use LinkRobins\Support\SupportReply;
use LinkRobins\Support\SupportTicket;

/**
 * Notification fired when a reply is posted on a ticket. The
 * recipient depends on who posted:
 *
 *   - Staff replies to a user-owned ticket  → notify the ticket owner
 *   - User replies to their own ticket      → notify all staff
 *
 * The blueprint itself is direction-agnostic; the dispatching code
 * (SupportReply::created hook) chooses recipients.
 *
 * Internal notes are NEVER turned into notifications. The owner
 * isn't supposed to know they exist, and staff already see them in
 * the staff list. The dispatcher filters internal notes out before
 * constructing this blueprint.
 */
class NewSupportReplyBlueprint implements BlueprintInterface, AlertableInterface, MailableInterface
{
    public function __construct(
        public SupportReply $reply
    ) {
    }

    public function getFromUser(): ?User
    {
        return $this->reply->user;
    }

    public function getSubject(): ?AbstractModel
    {
        return $this->reply->ticket;
    }

    public function getData(): array
    {
        return [
            'replyId' => (int) $this->reply->id,
        ];
    }

    public function getEmailViews(): array
    {
        return [
            'text' => 'linkrobins-support::emails.plain.new_reply',
            'html' => 'linkrobins-support::emails.html.new_reply',
        ];
    }

    public function getEmailSubject(TranslatorInterface $translator): string
    {
        $ticket = $this->reply->ticket;
        $subject = $ticket ? $ticket->subject : $translator->trans('linkrobins-support.email.fallback_ticket');
        return $translator->trans('linkrobins-support.email.new_reply_subject', ['subject' => $subject]);
    }

    public static function getType(): string
    {
        return 'linkrobinsSupportNewReply';
    }

    public static function getSubjectModel(): string
    {
        return SupportTicket::class;
    }
}
