<?php

namespace LinkRobins\Support\Api\Resource;

use Flarum\Api\Endpoint;
use Flarum\Api\Resource\AbstractDatabaseResource;
use Flarum\Api\Schema;
use Illuminate\Database\Eloquent\Builder;
use LinkRobins\Support\Access\SupportAbilities;
use LinkRobins\Support\SupportSavedReply;
use Tobyz\JsonApiServer\Context;

/**
 * Saved replies. Staff read them (to insert into a reply); admins manage
 * them from the extension's settings page. Members see none: the canned
 * answers are a staff tool, and listing them would show how tickets are
 * handled.
 */
class SupportSavedReplyResource extends AbstractDatabaseResource
{
    public function type(): string
    {
        return 'linkrobins-support-saved-replies';
    }

    public function model(): string
    {
        return SupportSavedReply::class;
    }

    public function scope(Builder $query, Context $context): void
    {
        if (! SupportAbilities::isStaff($context->getActor())) {
            $query->whereRaw('1 = 0');

            return;
        }

        // Hand-ordered first, then alphabetical for anything not placed.
        $query->orderByRaw('CASE WHEN position IS NULL THEN 1 ELSE 0 END')
            ->orderBy('position')
            ->orderBy('title');
    }

    public function endpoints(): array
    {
        return [
            Endpoint\Show::make()
                ->authenticated(),
            Endpoint\Index::make()
                ->authenticated()
                ->paginate(100, 200),
            Endpoint\Create::make()
                ->authenticated()
                ->can('manageSavedReplies'),
            Endpoint\Update::make()
                ->authenticated()
                ->can('manageSavedReplies'),
            Endpoint\Delete::make()
                ->authenticated()
                ->can('manageSavedReplies'),
        ];
    }

    public function fields(): array
    {
        return [
            Schema\Str::make('title')
                ->writable()
                ->requiredOnCreate()
                ->minLength(1)
                ->maxLength(100),
            Schema\Str::make('content')
                ->writable()
                ->requiredOnCreate()
                ->minLength(1)
                ->maxLength(10000),
            Schema\Integer::make('position')
                ->writable()
                ->nullable(),
        ];
    }
}
