<?php

namespace LinkRobins\Support\Search;

use Flarum\Search\Database\AbstractSearcher;
use Flarum\User\User;
use Illuminate\Database\Eloquent\Builder;
use LinkRobins\Support\Access\SupportAbilities;
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

        // Eager-load reply counts so the replyCount field doesn't fire a
        // COUNT() per ticket (N+1 on the list). Two variants: the full count
        // for staff, and the public count (excluding internal notes) shown to
        // everyone else.
        $query->withCount([
            'replies as reply_count_all',
            'replies as reply_count_public' => fn ($q) => $q->where('is_internal_note', false),
        ]);

        if ($actor->isGuest()) {
            // Defense in depth -- endpoints require authentication, but
            // if a guest ever reaches here, return nothing.
            $query->whereRaw('1 = 0');
            return $query;
        }

        if (SupportAbilities::isStaff($actor)) {
            // Staff see soft-deleted tickets in list views too, rendered
            // with a "deleted" treatment, so a trashed ticket stays
            // visible (and restorable) until it is permanently removed --
            // matching how Flarum core keeps soft-deleted discussions in
            // the list. The Show endpoint likewise uses withTrashed().
            return $query->withTrashed();
        }

        // Non-staff: only their own tickets.
        return $query->where('linkrobins_support_tickets.user_id', (int) $actor->id);
    }
}
