<?php

namespace LinkRobins\Support\Search\Filter;

use Flarum\Search\Database\DatabaseSearchState;
use Flarum\Search\Filter\FilterInterface;
use Flarum\Search\SearchState;
use Flarum\Search\ValidateFilterTrait;

/**
 * `filter[mine]=1` narrows a ticket listing to tickets the actor
 * created. Most useful for staff who want to switch between "all
 * tickets" and "the ones I filed". For non-staff users, this is a
 * no-op because their scope is already constrained to own tickets.
 *
 * @implements FilterInterface<DatabaseSearchState>
 */
class MineFilter implements FilterInterface
{
    use ValidateFilterTrait;

    public function getFilterKey(): string
    {
        return 'mine';
    }

    public function filter(SearchState $state, string|array $value, bool $negate): void
    {
        $on = $this->asBool($value);
        if ($on === $negate) {
            // filter[mine]=0 with negate=false, or filter[mine]=1 with
            // negate=true -- in both cases, no narrowing requested.
            return;
        }
        $actor = $state->getActor();
        if ($actor->isGuest()) {
            // No "mine" for guests. Defense in depth -- shouldn't reach
            // here because endpoints require authentication.
            $state->getQuery()->whereRaw('1 = 0');
            return;
        }
        $state->getQuery()->where(
            'linkrobins_support_tickets.user_id',
            (int) $actor->id
        );
    }
}
