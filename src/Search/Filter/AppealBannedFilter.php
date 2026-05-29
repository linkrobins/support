<?php

namespace LinkRobins\Support\Search\Filter;

use Flarum\Search\Database\DatabaseSearchState;
use Flarum\Search\Filter\FilterInterface;
use Flarum\Search\SearchState;
use Flarum\Search\ValidateFilterTrait;

/**
 * Filters the core user list by appeal-ban status, e.g.
 * `filter[supportAppealBanned]=1`. Registered on the user searcher; without
 * it the filter was silently ignored and the admin "appeal-banned" list
 * returned every user.
 *
 * @implements FilterInterface<DatabaseSearchState>
 */
class AppealBannedFilter implements FilterInterface
{
    use ValidateFilterTrait;

    public function getFilterKey(): string
    {
        return 'supportAppealBanned';
    }

    public function filter(SearchState $state, string|array $value, bool $negate): void
    {
        // Only users who manage appeal-bans may filter by this column.
        // Otherwise the filter acts as an oracle: anyone able to list users
        // could enumerate which accounts are appeal-banned (a moderation-
        // internal fact) via filter[supportAppealBanned]=1. The matching
        // attribute on UserResource is already restricted to managers/self;
        // this closes the same leak on the filter side.
        if (! $state->getActor()->hasPermission('linkrobins-support.manage_appeal_bans')) {
            return;
        }

        $raw = is_array($value) ? reset($value) : $value;
        $wanted = in_array((string) $raw, ['1', 'true'], true) ? 1 : 0;

        $state->getQuery()->whereIn('support_appeal_banned', [$wanted], 'and', $negate);
    }
}
