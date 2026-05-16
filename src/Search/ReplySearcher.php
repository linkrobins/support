<?php

namespace LinkRobins\Support\Search;

use Flarum\Search\Database\AbstractSearcher;
use Flarum\User\User;
use Illuminate\Database\Eloquent\Builder;
use LinkRobins\Support\SupportReply;

/**
 * Searcher for support replies. Applies the same visibility rules as
 * the resource scope: guests see nothing; non-staff users see only
 * non-internal replies on tickets they own; staff sees everything.
 */
class ReplySearcher extends AbstractSearcher
{
    public function getQuery(User $actor): Builder
    {
        $query = SupportReply::query()->select('linkrobins_support_replies.*');

        if ($actor->isGuest()) {
            $query->whereRaw('1 = 0');
            return $query;
        }

        $isStaff = $actor->isAdmin()
            || $actor->hasPermission('linkrobins-support.handle_tickets');

        if ($isStaff) {
            return $query;
        }

        return $query->whereHas('ticket', function ($q) use ($actor) {
            $q->where('user_id', (int) $actor->id);
        })->where('linkrobins_support_replies.is_internal_note', false);
    }
}
