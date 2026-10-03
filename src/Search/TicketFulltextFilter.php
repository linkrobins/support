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
 * Plain LIKE rather than a fulltext index: support volumes are small, it
 * behaves the same on every database, and the ticket list is already scoped
 * to what the actor may see before this runs. Both sides are lowercased
 * because LIKE is case-sensitive on PostgreSQL.
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
        // Escape LIKE wildcards with '!' and say so with ESCAPE: SQLite has no
        // default escape character, and a backslash means different things
        // in MySQL and PostgreSQL string literals.
        $like = '%'.str_replace(['!', '%', '_'], ['!!', '!%', '!_'], mb_strtolower($value)).'%';
        $number = ltrim($value, '#');

        // Raw SQL gets no automatic table prefix; the grammar adds it, so
        // forums installed with a prefix still find the right columns.
        $grammar = $query->getQuery()->getGrammar();
        $subject = $grammar->wrap('linkrobins_support_tickets.subject');
        $content = $grammar->wrap((new SupportReply())->getTable().'.content');

        $query->where(function (Builder $q) use ($like, $isStaff, $number, $subject, $content) {
            $q->whereRaw("LOWER($subject) LIKE ? ESCAPE '!'", [$like])
                ->orWhereExists(function ($sub) use ($like, $isStaff, $content) {
                    $replies = (new SupportReply())->getTable();
                    $sub->selectRaw('1')
                        ->from($replies)
                        ->whereColumn($replies.'.ticket_id', 'linkrobins_support_tickets.id')
                        ->whereRaw("LOWER($content) LIKE ? ESCAPE '!'", [$like]);

                    if (! $isStaff) {
                        $sub->where($replies.'.is_internal_note', false)
                            ->whereNull($replies.'.deleted_at');
                    }
                });

            if (ctype_digit($number)) {
                $q->orWhere('linkrobins_support_tickets.id', (int) $number);
            }
        });
    }
}
