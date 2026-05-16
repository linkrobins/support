<?php

namespace LinkRobins\Support\Search\Filter;

use Flarum\Search\Database\DatabaseSearchState;
use Flarum\Search\Filter\FilterInterface;
use Flarum\Search\SearchState;
use Flarum\Search\ValidateFilterTrait;

/**
 * Narrows a ticket listing to a single category. Useful for staff
 * filtering "all the appeals" or "all the bug reports".
 *
 * @implements FilterInterface<DatabaseSearchState>
 */
class CategoryIdFilter implements FilterInterface
{
    use ValidateFilterTrait;

    public function getFilterKey(): string
    {
        return 'categoryId';
    }

    public function filter(SearchState $state, string|array $value, bool $negate): void
    {
        $ids = $this->asIntArray($value);
        if (empty($ids)) {
            return;
        }
        $state->getQuery()->whereIn(
            'linkrobins_support_tickets.category_id',
            $ids,
            'and',
            $negate
        );
    }
}
