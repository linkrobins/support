<?php

namespace LinkRobins\Support\Search\Filter;

use Flarum\Search\Database\DatabaseSearchState;
use Flarum\Search\Filter\FilterInterface;
use Flarum\Search\SearchState;
use Flarum\Search\ValidateFilterTrait;

/**
 * `filter[assigned]=me` narrows a ticket listing to tickets assigned to the
 * actor; `filter[assigned]=none` to tickets nobody has claimed. These are the
 * staff work queues. "My tickets" (MineFilter) is a different thing: the
 * tickets the actor opened.
 *
 * Non-staff are already limited to their own tickets by TicketSearcher, so
 * this cannot widen what anyone sees.
 *
 * @implements FilterInterface<DatabaseSearchState>
 */
class AssignedFilter implements FilterInterface
{
    use ValidateFilterTrait;

    public function getFilterKey(): string
    {
        return 'assigned';
    }

    public function filter(SearchState $state, string|array $value, bool $negate): void
    {
        $value = $this->asString($value);
        $query = $state->getQuery();
        $column = 'linkrobins_support_tickets.assigned_staff_id';

        if ($value === 'me') {
            $actor = $state->getActor();
            if ($actor->isGuest()) {
                $query->whereRaw('1 = 0');

                return;
            }
            $negate
                ? $query->where(fn ($q) => $q->where($column, '!=', (int) $actor->id)->orWhereNull($column))
                : $query->where($column, (int) $actor->id);
        } elseif ($value === 'none') {
            $negate ? $query->whereNotNull($column) : $query->whereNull($column);
        }
    }
}
