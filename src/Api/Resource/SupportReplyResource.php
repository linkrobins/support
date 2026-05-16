<?php

namespace LinkRobins\Support\Api\Resource;

use Flarum\Api\Context as FlarumContext;
use Flarum\Api\Endpoint;
use Flarum\Api\Resource\AbstractDatabaseResource;
use Flarum\Api\Schema;
use Flarum\Api\Sort\SortColumn;
use Illuminate\Database\Eloquent\Builder;
use LinkRobins\Support\SupportReply;
use LinkRobins\Support\SupportTicket;
use LinkRobins\Support\UserState;
use Tobyz\JsonApiServer\Context;
use Tobyz\JsonApiServer\Exception\BadRequestException;
use Tobyz\JsonApiServer\Exception\ForbiddenException;

class SupportReplyResource extends AbstractDatabaseResource
{
    public function type(): string
    {
        return 'linkrobins-support-replies';
    }

    public function model(): string
    {
        return SupportReply::class;
    }

    /**
     * Visibility scope (for Show endpoints).
     *
     * The big rule: non-staff users can never see is_internal_note=true
     * replies. Enforced as a DB-level filter, not just at render time,
     * so a non-staff actor can't list or show an internal note even if
     * they craft a request asking for one specifically.
     *
     * Mirrored in LinkRobins\Support\Search\ReplySearcher::getQuery for
     * Index endpoints. The two must stay in sync.
     */
    public function scope(Builder $query, Context $context): void
    {
        $actor = $context->getActor();
        if ($actor->isGuest()) {
            $query->whereRaw('1 = 0');
            return;
        }

        $isStaff = $actor->isAdmin()
            || $actor->hasPermission('linkrobins-support.handle_tickets');

        if (! $isStaff) {
            $query->whereHas('ticket', function ($q) use ($actor) {
                $q->where('user_id', (int) $actor->id);
            });
            $query->where('is_internal_note', false);
        }
    }

    public function endpoints(): array
    {
        return [
            Endpoint\Show::make()
                ->authenticated()
                ->defaultInclude(['user']),
            Endpoint\Index::make()
                ->authenticated()
                ->defaultInclude(['user'])
                ->paginate(50, 200),
            Endpoint\Create::make()
                ->authenticated(),
            // No Update / Delete for replies in v1. Editing a reply is
            // historical record falsification on tickets; we'll add it
            // later with proper audit trail if needed.
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
            Schema\Str::make('content')
                ->writable()
                ->set(function (SupportReply $reply, $value, FlarumContext $context) {
                    if (! is_string($value)) {
                        $reply->content = '';
                        return;
                    }
                    $actor = $context->getActor();
                    // Route through HasFormattedContent so Flarum's
                    // formatter parses the source into the trait's
                    // internal representation in `content`. The rendered
                    // HTML is produced on demand at serialize time --
                    // there is no content_html column.
                    $reply->setContentAttribute($value, $actor);
                }),

            Schema\Str::make('contentHtml')
                ->get(function (SupportReply $reply, FlarumContext $context) {
                    // Render the parsed source through Flarum's formatter
                    // at serialize time. This matches the blog's pattern:
                    // there's no `content_html` column -- the trait stores
                    // a parsed-source representation in `content`, and the
                    // HTML is rendered on demand so format extensions
                    // (mentions, emoji, etc.) keep working even on old
                    // replies. The request goes through so renderers that
                    // need it (e.g. to resolve relative URLs) have it.
                    try {
                        return $reply->formatContent($context->request);
                    } catch (\Throwable $e) {
                        error_log('[linkrobins/support] formatContent failed: ' . $e->getMessage());
                        return '';
                    }
                }),

            Schema\Boolean::make('isInternalNote')
                ->property('is_internal_note')
                ->writable()
                ->set(function (SupportReply $reply, $value, FlarumContext $context) {
                    $bool = (bool) $value;
                    if (! $bool) {
                        $reply->is_internal_note = false;
                        return;
                    }
                    // Only staff can mark a reply internal. If a non-staff
                    // user requests is_internal_note=true, silently coerce
                    // to false rather than 403'ing -- the client UI never
                    // sends true from a non-staff context, so this only
                    // triggers via direct API misuse.
                    $actor = $context->getActor();
                    $isStaff = ! $actor->isGuest()
                        && ($actor->isAdmin() || $actor->hasPermission('linkrobins-support.handle_tickets'));
                    $reply->is_internal_note = $isStaff;
                }),

            Schema\DateTime::make('createdAt')
                ->property('created_at'),
            Schema\DateTime::make('updatedAt')
                ->property('updated_at'),

            Schema\Relationship\ToOne::make('user')
                ->type('users')
                ->includable(),

            Schema\Relationship\ToOne::make('ticket')
                ->type('linkrobins-support-tickets')
                ->includable()
                ->writable(),
        ];
    }

    public function creating(object $model, Context $context): ?object
    {
        $actor = $context->getActor();
        if ($actor->isGuest()) {
            throw new ForbiddenException('You must be logged in to reply.');
        }

        // Empty content -> clean 400. Without this, an empty body would
        // hit the NOT NULL constraint on the `content` column and the
        // user would see a 500 + SQL error. The frontend disables the
        // submit button on empty input; this is a backstop for direct
        // API calls. We check the underlying attribute directly because
        // the trait's setter has already run and set null for empty.
        $rawContent = $model->getAttribute('content');
        if ($rawContent === null || $rawContent === '') {
            throw new BadRequestException('Reply content is required.');
        }
        // Whitespace-only content also gets rejected. After the formatter
        // runs, "   " becomes "<t>   <br/></t>" which renders as a blank
        // post -- not useful and probably an accidental submit.
        // We check by reading the model's `parsed_content` and stripping
        // tags+whitespace.
        $parsedSource = $model->getAttribute('content');
        if (is_string($parsedSource)) {
            $textOnly = trim(strip_tags($parsedSource));
            if ($textOnly === '') {
                throw new BadRequestException('Reply content is required.');
            }
        }

        // Force user_id to actor. No relationship impersonation.
        $model->user_id = $actor->id;

        // Resolve ticket from the relationship in the request body.
        $body = $context->body();
        $ticketRel = data_get($body, 'data.relationships.ticket.data.id');
        if (! is_numeric($ticketRel)) {
            throw new BadRequestException('A ticket is required.');
        }
        $ticket = SupportTicket::query()->find((int) $ticketRel);
        if (! $ticket) {
            throw new BadRequestException('Ticket not found.');
        }

        // Per-ticket reply permission.
        if (! $actor->can('reply', $ticket)) {
            throw new ForbiddenException('You cannot reply to this ticket.');
        }

        $model->ticket_id = $ticket->id;

        // Belt-and-suspenders: if is_internal_note=true was set above but
        // the actor isn't staff, force it false. The setter already does
        // this, but the model could theoretically reach here with a stale
        // value from some other code path.
        if ($model->is_internal_note) {
            $isStaff = $actor->isAdmin()
                || $actor->hasPermission('linkrobins-support.handle_tickets');
            if (! $isStaff) {
                $model->is_internal_note = false;
            }
            // Suspended users cannot post internal notes regardless --
            // they shouldn't be acting as staff even if they technically
            // hold the permission (e.g. a moderator who got suspended).
            if (UserState::isSuspended($actor)) {
                $model->is_internal_note = false;
            }
        }

        return $model;
    }
}
