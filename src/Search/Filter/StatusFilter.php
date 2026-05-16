<?php

namespace LinkRobins\Support\Search\Filter;

use Flarum\Search\Database\DatabaseSearchState;
use Flarum\Search\Filter\FilterInterface;
use Flarum\Search\SearchState;
use Flarum\Search\ValidateFilterTrait;
use LinkRobins\Support\SupportTicket;

/**
 * @implements FilterInterface<DatabaseSearchState>
 */
class StatusFilter implements FilterInterface
{
    use ValidateFilterTrait;

    public function getFilterKey(): string
    {
        return 'status';
    }

    public function filter(SearchState $state, string|array $value, bool $negate): void
    {
        $values = $this->asStringArray($value);
        $valid  = array_values(array_intersect($values, SupportTicket::ALL_STATUSES));
        if (empty($valid)) {
            return;
        }
        $state->getQuery()->whereIn(
            'linkrobins_support_tickets.status',
            $valid,
            'and',
            $negate
        );
    }
}
