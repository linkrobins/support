<?php

namespace LinkRobins\Support\Search;

use Flarum\Search\Database\AbstractSearcher;
use Flarum\User\User;
use Illuminate\Database\Eloquent\Builder;
use LinkRobins\Support\SupportTicket;

/**
 * Searcher for support tickets. Applies visibility scoping (creator
 * sees own; staff sees all; guest sees nothing) and exposes filters
 * declared via the SearchDriver extender.
 */
class TicketSearcher extends AbstractSearcher
{
    public function getQuery(User $actor): Builder
    {
        $query = SupportTicket::query()->select('linkrobins_support_tickets.*');

        if ($actor->isGuest()) {
            // Defense in depth -- endpoints require authentication, but
            // if a guest ever reaches here, return nothing.
            $query->whereRaw('1 = 0');
            return $query;
        }

        if ($actor->isAdmin() || $actor->hasPermission('linkrobins-support.handle_tickets')) {
            return $query;
        }

        // Non-staff: only their own tickets.
        return $query->where('linkrobins_support_tickets.user_id', (int) $actor->id);
    }
}
