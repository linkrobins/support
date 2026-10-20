<?php

namespace LinkRobins\Support\Search\Filter;

use Flarum\Search\Database\DatabaseSearchState;
use Flarum\Search\Filter\FilterInterface;
use Flarum\Search\SearchState;
use Flarum\Search\ValidateFilterTrait;
use LinkRobins\Support\SupportCategory;

/**
 * Filter support tickets by category slug or numeric ID.
 *
 * @implements FilterInterface<DatabaseSearchState>
 */
class CategoryFilter implements FilterInterface
{
    use ValidateFilterTrait;

    public function getFilterKey(): string
    {
        return 'category';
    }

    public function filter(SearchState $state, string|array $value, bool $negate): void
    {
        $values = $this->asStringArray($value);
        if (empty($values)) {
            return;
        }

        $ids = [];
        $slugs = [];

        foreach ($values as $v) {
            $v = trim($v);
            if ($v === '') {
                continue;
            }
            if (is_numeric($v)) {
                $ids[] = (int) $v;
            } else {
                $slugs[] = $v;
            }
        }

        if (! empty($slugs)) {
            $matchedIds = SupportCategory::query()
                ->whereIn('slug', $slugs)
                ->pluck('id')
                ->all();
            $ids = array_merge($ids, $matchedIds);
        }

        $state->getQuery()->whereIn(
            'linkrobins_support_tickets.category_id',
            array_values(array_unique($ids)),
            'and',
            $negate
        );
    }
}
