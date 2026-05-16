<?php

namespace LinkRobins\Support\Access;

use Flarum\User\Access\AbstractPolicy;
use Flarum\User\User;

/**
 * Global support permissions.
 *
 *   linkrobins-support.handle_tickets -- staff: see and respond to all tickets,
 *                                        change status, add internal notes,
 *                                        assign tickets
 *
 * Admins always pass. Anyone authenticated (including banned users, for
 * appeal categories specifically) can attempt to create a ticket -- the
 * actual gate is in the resource controller, where rate limits and the
 * appeal-ban flag are checked.
 */
class GlobalPolicy extends AbstractPolicy
{
    public function handleTickets(User $actor): bool
    {
        if ($actor->isAdmin()) {
            return true;
        }
        return $actor->hasPermission('linkrobins-support.handle_tickets');
    }

    public function createTicket(User $actor): bool
    {
        // Anyone logged in can attempt to create a ticket. Rate limits,
        // appeal-ban checks, and ban-state-vs-category checks happen in the
        // resource's `creating` hook with proper error messages -- not here,
        // because a policy returning false produces a generic 403.
        return ! $actor->isGuest();
    }

    public function manageCategories(User $actor): bool
    {
        return $actor->isAdmin();
    }

    public function manageAppealBan(User $actor): bool
    {
        return $actor->isAdmin();
    }
}
