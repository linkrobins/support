<?php

namespace LinkRobins\Support\TicketType;

use Flarum\Locale\TranslatorInterface;
use Flarum\User\User;
use LinkRobins\Support\SupportCategory;
use LinkRobins\Support\SupportTicket;

class AppealTicketType extends AbstractTicketType
{
    public const ID = 'appeal';

    public function __construct(
        protected ?TranslatorInterface $translator = null
    ) {
    }

    public function id(): string
    {
        return self::ID;
    }

    public function name(): string
    {
        return $this->translator
            ? $this->translator->trans('linkrobins-support.admin.ticket_types.appeal')
            : 'Ban Appeal';
    }

    public function icon(): string
    {
        return 'fas fa-gavel';
    }

    public function canCreate(User $actor, SupportCategory $category): bool
    {
        // Appeals can be created by suspended users as long as they are not appeal-banned
        return ! (bool) $actor->getAttribute('support_appeal_banned');
    }

    public function canReopen(SupportTicket $ticket, User $actor): bool
    {
        // Owners cannot reopen an appeal once closed/resolved
        return false;
    }

    public function canConfirmSolved(SupportTicket $ticket, User $actor): bool
    {
        return false;
    }

    public function initialDecision(SupportTicket $ticket): ?string
    {
        return SupportTicket::DECISION_PENDING;
    }

    public function allowedDecisions(): array
    {
        return SupportTicket::ALL_DECISIONS;
    }

    public function isAppeal(): bool
    {
        return true;
    }
}
