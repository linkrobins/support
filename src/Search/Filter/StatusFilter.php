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
        $aliases = [
            'in-progress'       => SupportTicket::STATUS_IN_PROGRESS,
            'awaiting-response' => SupportTicket::STATUS_AWAITING_USER,
            'awaiting_response' => SupportTicket::STATUS_AWAITING_USER,
            'awaiting-user'     => SupportTicket::STATUS_AWAITING_USER,
        ];
        $values = array_map(
            fn ($v) => $aliases[strtolower($v)] ?? strtolower($v),
            $this->asStringArray($value)
        );
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
