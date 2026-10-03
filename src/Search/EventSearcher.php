<?php

namespace LinkRobins\Support\Search;

use Flarum\Search\Database\AbstractSearcher;
use Flarum\User\User;
use Illuminate\Database\Eloquent\Builder;
use LinkRobins\Support\Access\SupportAbilities;
use LinkRobins\Support\SupportEvent;

/**
 * Searcher for ticket history.
 *
 * Staff see every entry. A ticket's owner sees the status changes on their
 * own tickets but not the assignment changes, which are staff routing.
 * Guests see nothing.
 */
class EventSearcher extends AbstractSearcher
{
    public function getQuery(User $actor): Builder
    {
        $query = SupportEvent::query()->select('linkrobins_support_events.*');

        static::applyVisibility($query, $actor);

        return $query;
    }

    /**
     * @param Builder<SupportEvent> $query
     */
    public static function applyVisibility(Builder $query, User $actor): void
    {
        if ($actor->isGuest()) {
            $query->whereRaw('1 = 0');

            return;
        }

        if (SupportAbilities::isStaff($actor)) {
            return;
        }

        $query->where('linkrobins_support_events.type', SupportEvent::TYPE_STATUS)
            ->whereHas('ticket', function ($q) use ($actor) {
                $q->where('user_id', (int) $actor->id);
            });
    }
}
