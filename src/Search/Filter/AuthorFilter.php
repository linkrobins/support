<?php

namespace LinkRobins\Support\Search\Filter;

use Flarum\Http\SlugManager;
use Flarum\Search\Database\DatabaseSearchState;
use Flarum\Search\Filter\FilterInterface;
use Flarum\Search\SearchState;
use Flarum\Search\ValidateFilterTrait;
use Flarum\User\User;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use LinkRobins\Support\Access\SupportAbilities;

/**
 * Filter support tickets by creator username/slug (staff only).
 *
 * Non-staff actors are already scoped strictly to their own tickets
 * by TicketSearcher, so this filter is ignored for them.
 *
 * @implements FilterInterface<DatabaseSearchState>
 */
class AuthorFilter implements FilterInterface
{
    use ValidateFilterTrait;

    public function __construct(
        protected SlugManager $slugManager
    ) {
    }

    public function getFilterKey(): string
    {
        return 'author';
    }

    public function filter(SearchState $state, string|array $value, bool $negate): void
    {
        $actor = $state->getActor();
        if (! SupportAbilities::isStaff($actor)) {
            return;
        }

        $slugDriver = $this->slugManager->forResource(User::class);
        $ids = [];

        foreach ($this->asStringArray($value) as $slug) {
            try {
                $ids[] = $slugDriver->fromSlug($slug, $actor)->id;
            } catch (ModelNotFoundException) {
                // Slug does not match any user; skip it.
            }
        }

        $state->getQuery()->whereIn(
            'linkrobins_support_tickets.user_id',
            $ids,
            'and',
            $negate
        );
    }
}
