<?php

namespace LinkRobins\Support\Search\Filter;

use Flarum\Search\Database\DatabaseSearchState;
use Flarum\Search\Filter\FilterInterface;
use Flarum\Search\SearchState;
use Flarum\Search\ValidateFilterTrait;

/**
 * `filter[ticketId]=N` narrows a reply listing to a single ticket.
 * The ticket-view page always sends this; without it, the reply list
 * would return every reply the actor can see across all tickets.
 *
 * @implements FilterInterface<DatabaseSearchState>
 */
class TicketIdFilter implements FilterInterface
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
            'linkrobins_support_replies.ticket_id',
            $ids,
            'and',
            $negate
        );
    }
}
