<?php

namespace LinkRobins\Support\TicketType;

use Flarum\Locale\TranslatorInterface;
use Flarum\User\User;
use LinkRobins\Support\SupportCategory;
use LinkRobins\Support\SupportTicket;
use LinkRobins\Support\UserState;

class StandardTicketType extends AbstractTicketType
{
    public const ID = 'standard';

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
            ? $this->translator->trans('linkrobins-support.admin.ticket_types.standard')
            : 'Standard Support';
    }


    public function canCreate(User $actor, SupportCategory $category): bool
    {
        return ! UserState::isSuspended($actor);
    }

    public function canReopen(SupportTicket $ticket, User $actor): bool
    {
        return true;
    }

    public function canConfirmSolved(SupportTicket $ticket, User $actor): bool
    {
        return true;
    }

    public function initialDecision(SupportTicket $ticket): ?string
    {
        return null;
    }

    public function allowedDecisions(): array
    {
        return [];
    }

    public function isAppeal(): bool
    {
        return false;
    }
}
