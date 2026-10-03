<?php

namespace LinkRobins\Support\Api\Resource;

use Flarum\Api\Endpoint;
use Flarum\Api\Resource\AbstractDatabaseResource;
use Flarum\Api\Schema;
use Flarum\Api\Sort\SortColumn;
use Illuminate\Database\Eloquent\Builder;
use LinkRobins\Support\Search\EventSearcher;
use LinkRobins\Support\SupportEvent;
use Tobyz\JsonApiServer\Context;

/**
 * Read-only ticket history: status and assignment changes, shown inline in
 * the ticket timeline. Rows are written by SupportEvent::recordChanges, never
 * through the API.
 */
class SupportEventResource extends AbstractDatabaseResource
{
    public function type(): string
    {
        return 'linkrobins-support-events';
    }

    public function model(): string
    {
        return SupportEvent::class;
    }

    /**
     * Visibility for Show. Index goes through EventSearcher, which applies the
     * same rules; the two must stay in sync.
     */
    public function scope(Builder $query, Context $context): void
    {
        /** @var Builder<SupportEvent> $query */
        EventSearcher::applyVisibility($query, $context->getActor());
    }

    public function endpoints(): array
    {
        return [
            Endpoint\Show::make()
                ->authenticated()
                ->defaultInclude(['user', 'fromUser', 'toUser']),
            Endpoint\Index::make()
                ->authenticated()
                ->defaultInclude(['user', 'fromUser', 'toUser'])
                ->paginate(200, 200),
        ];
    }

    public function sorts(): array
    {
        return [
            SortColumn::make('createdAt'),
        ];
    }

    public function fields(): array
    {
        return [
            Schema\Str::make('type'),
            Schema\Str::make('fromStatus')
                ->property('from_status')
                ->nullable(),
            Schema\Str::make('toStatus')
                ->property('to_status')
                ->nullable(),
            // Whether there was an assignee before / after an assignment
            // change. The relationships alone cannot tell "nobody" apart from
            // an account that has since been deleted.
            Schema\Boolean::make('hadAssignee')
                ->get(fn (SupportEvent $event) => $event->from_user_id !== null),
            Schema\Boolean::make('hasAssignee')
                ->get(fn (SupportEvent $event) => $event->to_user_id !== null),
            Schema\DateTime::make('createdAt')
                ->property('created_at'),

            Schema\Relationship\ToOne::make('user')
                ->type('users')
                ->includable(),
            Schema\Relationship\ToOne::make('fromUser')
                ->type('users')
                ->includable(),
            Schema\Relationship\ToOne::make('toUser')
                ->type('users')
                ->includable(),
            Schema\Relationship\ToOne::make('ticket')
                ->type('linkrobins-support-tickets'),
        ];
    }
}
