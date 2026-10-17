<?php

namespace LinkRobins\Support\Search\Filter;

use Flarum\Search\Database\DatabaseSearchState;
use Flarum\Search\Filter\FilterInterface;
use Flarum\Search\SearchState;
use Flarum\Search\ValidateFilterTrait;
use LinkRobins\Support\Access\SupportAbilities;
use LinkRobins\Support\SupportTicket;

/**
 * Filter support tickets by priority: urgent, normal, low (staff only).
 *
 * @implements FilterInterface<DatabaseSearchState>
 */
class PriorityFilter implements FilterInterface
{
    use ValidateFilterTrait;

    public function getFilterKey(): string
    {
        return 'priority';
    }

    public function filter(SearchState $state, string|array $value, bool $negate): void
    {
        $actor = $state->getActor();
        if (! SupportAbilities::isStaff($actor)) {
            return;
        }

        $values = array_map('strtolower', $this->asStringArray($value));
        $valid = array_values(array_intersect($values, SupportTicket::ALL_PRIORITIES));
        if (empty($valid)) {
            return;
        }

        $state->getQuery()->whereIn(
            'linkrobins_support_tickets.priority',
            $valid,
            'and',
            $negate
        );
    }
}
