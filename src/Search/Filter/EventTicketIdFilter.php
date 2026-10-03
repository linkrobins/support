<?php

namespace LinkRobins\Support\Search\Filter;

use Flarum\Search\Database\DatabaseSearchState;
use Flarum\Search\Filter\FilterInterface;
use Flarum\Search\SearchState;
use Flarum\Search\ValidateFilterTrait;

/**
 * `filter[ticketId]=N` narrows ticket history to a single ticket. Separate
 * from TicketIdFilter only because the column lives on a different table.
 *
 * @implements FilterInterface<DatabaseSearchState>
 */
class EventTicketIdFilter implements FilterInterface
{
    use ValidateFilterTrait;

    public function getFilterKey(): string
    {
        return 'ticketId';
    }

    public function filter(SearchState $state, string|array $value, bool $negate): void
    {
        $ids = $this->asIntArray($value);
        if (empty($ids)) {
            return;
        }
        $state->getQuery()->whereIn(
            'linkrobins_support_events.ticket_id',
            $ids,
            'and',
            $negate
        );
    }
}
