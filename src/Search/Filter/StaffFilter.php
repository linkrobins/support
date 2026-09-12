<?php

namespace LinkRobins\Support\Search\Filter;

use Flarum\Group\Group;
use Flarum\Search\Database\DatabaseSearchState;
use Flarum\Search\Filter\FilterInterface;
use Flarum\Search\SearchState;
use LinkRobins\Support\Access\SupportAbilities;

/**
 * Filters the core user list down to support staff, e.g.
 * `filter[supportStaff]=1`. Registered on the user searcher so the admin
 * category editor can offer a real picker for a category's default assignee
 * instead of asking an admin to type a user id.
 *
 * The definition of staff has to match SupportNotifier::staffRecipients()
 * exactly -- a name in this list that the notifier would not recognise means
 * an admin can route a category at someone who then never hears about it.
 * Both are expressed as "in the admin group, or in a group holding
 * handle_tickets".
 *
 * @implements FilterInterface<DatabaseSearchState>
 */
class StaffFilter implements FilterInterface
{
    public function getFilterKey(): string
    {
        return 'supportStaff';
    }

    public function filter(SearchState $state, string|array $value, bool $negate): void
    {
        // Staff-only. Who handles tickets is internal routing, and without
        // this the filter is a free "list every administrator and moderator
        // on this forum" endpoint for any logged-in user.
        if (! SupportAbilities::isStaff($state->getActor())) {
            return;
        }

        $raw = is_array($value) ? reset($value) : $value;
        if (! in_array((string) $raw, ['1', 'true'], true)) {
            return;
        }

        $method = $negate ? 'whereNot' : 'where';

        $state->getQuery()->{$method}(function ($query) {
            $query->whereHas('groups', function ($q) {
                $q->where('groups.id', Group::ADMINISTRATOR_ID);
            })->orWhereHas('groups', function ($q) {
                $q->whereIn('groups.id', function ($sub) {
                    $sub->select('group_id')
                        ->from('group_permission')
                        ->where('permission', SupportAbilities::HANDLE_TICKETS);
                });
            });
        });
    }
}
