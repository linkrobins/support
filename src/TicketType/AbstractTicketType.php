<?php

namespace LinkRobins\Support\TicketType;

use Flarum\User\User;
use LinkRobins\Support\SupportCategory;
use LinkRobins\Support\SupportTicket;
use LinkRobins\Support\UserState;

abstract class AbstractTicketType implements TicketTypeInterface
{
    public function id(): string
    {
        return defined('static::ID') ? static::ID : '';
    }

    public function icon(): string
    {
        return 'fas fa-tag';
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
