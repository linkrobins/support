<?php

namespace LinkRobins\Support\Search;

use Flarum\Search\AbstractFulltextFilter;
use Flarum\Search\Database\DatabaseSearchState;
use Flarum\Search\SearchState;
use Illuminate\Database\Eloquent\Builder;
use LinkRobins\Support\Access\SupportAbilities;
use LinkRobins\Support\SupportReply;

/**
 * `filter[q]=...` on tickets: matches the subject, the text of any reply the
 * searcher can see, or a ticket number ("123" or "#123").
 *
 * Replies are matched only within what the actor could read anyway. A member
 * never matches an internal note or a deleted reply; otherwise a search hit
 * would reveal that a staff note on their ticket contains the word. Staff
 * match every reply.
 *
 * @extends AbstractFulltextFilter<DatabaseSearchState>
 */
class TicketFulltextFilter extends AbstractFulltextFilter
{
    public function search(SearchState $state, string $value): void
    {
        $value = trim($value);
        if ($value === '') {
            return;
        }

        /** @var DatabaseSearchState $state */
        $query = $state->getQuery();
        $isStaff = SupportAbilities::isStaff($state->getActor());
        $like = '%' . addcslashes($value, '%_\\') . '%';

        // PostgreSQL LIKE is case-sensitive, so use ILIKE on pgsql.
        $operator = $query->getConnection()->getDriverName() === 'pgsql' ? 'ilike' : 'like';
        $number = ltrim($value, '#');

        $query->where(function (Builder $q) use ($like, $operator, $isStaff, $number) {
            $q->where('subject', $operator, $like)
                ->orWhereHas('replies', function (Builder $sub) use ($like, $operator, $isStaff) {
                    /** @var Builder<SupportReply> $sub */
                    if ($isStaff) {
                        $sub->withTrashed();
                    } else {
                        $sub->where('is_internal_note', false);
                    }

                    $sub->where('content', $operator, $like);
                });

            if (ctype_digit($number)) {
                $q->orWhereKey((int) $number);
            }
        });
    }
}
