<?php

namespace LinkRobins\Support\Search\Filter;

use Flarum\Search\Database\DatabaseSearchState;
use Flarum\Search\Filter\FilterInterface;
use Flarum\Search\SearchState;
use Flarum\Search\ValidateFilterTrait;
use Illuminate\Database\Eloquent\Builder;
use LinkRobins\Support\SupportCategory;
use LinkRobins\Support\TicketType\AppealTicketType;
use LinkRobins\Support\TicketType\StandardTicketType;

/**
 * Filter support tickets by ticket type driver (e.g. 'standard', 'appeal', or custom).
 *
 * Resolves matching category IDs first so the query directly filters
 * on the indexed category_id column, avoiding correlated subqueries.
 *
 * @implements FilterInterface<DatabaseSearchState>
 */
class TicketTypeFilter implements FilterInterface
{
    use ValidateFilterTrait;

    public function getFilterKey(): string
    {
        return 'ticketType';
    }

    public function filter(SearchState $state, string|array $value, bool $negate): void
    {
        $types = array_filter($this->asStringArray($value), fn (string $t) => trim($t) !== '');
        if (empty($types)) {
            return;
        }

        $categoryIds = SupportCategory::query()
            ->where(function (Builder $sub) use ($types) {
                $sub->whereIn('ticket_type', $types);

                if (in_array(AppealTicketType::ID, $types, true)) {
                    $sub->orWhere(fn (Builder $q) => $q->whereNull('ticket_type')->where('is_appeal', true));
                }

                if (in_array(StandardTicketType::ID, $types, true)) {
                    $sub->orWhere(fn (Builder $q) => $q->whereNull('ticket_type')->where('is_appeal', false));
                }
            })
            ->pluck('id')
            ->all();

        $state->getQuery()->whereIn(
            'linkrobins_support_tickets.category_id',
            $categoryIds,
            'and',
            $negate
        );
    }
}
