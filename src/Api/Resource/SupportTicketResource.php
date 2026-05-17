<?php

namespace LinkRobins\Support\Api\Resource;

use Carbon\Carbon;
use Flarum\Api\Context as FlarumContext;
use Flarum\Api\Endpoint;
use Flarum\Api\Resource\AbstractDatabaseResource;
use Flarum\Api\Schema;
use Flarum\Api\Sort\SortColumn;
use Flarum\Locale\TranslatorInterface;
use Illuminate\Database\Eloquent\Builder;
use LinkRobins\Support\RateLimiter;
use LinkRobins\Support\SupportCategory;
use LinkRobins\Support\SupportTicket;
use LinkRobins\Support\UserState;
use Tobyz\JsonApiServer\Context;
use Tobyz\JsonApiServer\Exception\BadRequestException;
use Tobyz\JsonApiServer\Exception\ForbiddenException;

class SupportTicketResource extends AbstractDatabaseResource
{
    public function __construct(
        protected RateLimiter $rateLimiter,
    ) {
    }

    public function type(): string
    {
        return 'linkrobins-support-tickets';
    }

    public function model(): string
    {
        return SupportTicket::class;
    }

    /**
     * Visibility scope.
     *
     * IMPORTANT: this scope runs on Show endpoints (single-resource GETs).
     * For Index (list) endpoints, Flarum uses the Searcher infrastructure
     * instead (see LinkRobins\Support\Search\TicketSearcher). The two must
     * apply the same visibility rules or staff could see less on Index
     * than on Show, or vice versa.
     *
     * Rules (mirrored in TicketSearcher::getQuery):
     *   - Admins: all tickets
     *   - Staff (`linkrobins-support.handle_tickets`): all tickets
     *   - Authenticated users: only their own tickets
     *   - Guests: nothing
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
        if ($isStaff) {
            // Staff see soft-deleted tickets too so they can restore
            // or force-delete from the ticket detail page. The default
            // Eloquent SoftDeletes scope (which excludes trashed rows)
            // applies for everyone else.
            $query->withTrashed();
            return;
        }
        $query->where('linkrobins_support_tickets.user_id', (int) $actor->id);
    }

    public function endpoints(): array
    {
        return [
            Endpoint\Show::make()
                ->authenticated()
                ->defaultInclude(['user', 'category', 'assignedStaff']),
            Endpoint\Index::make()
                ->authenticated()
                ->defaultInclude(['user', 'category', 'assignedStaff'])
                ->paginate(25, 100),
            Endpoint\Create::make()
                ->authenticated()
                ->can('createTicket'),
            Endpoint\Update::make()
                ->authenticated()
                ->can('update'),
                // Policy::update enforces staff-only for status/decision/
                // assignment changes. Field setters defend-in-depth too,
                // so even if this gate ever loosened the data couldn't
                // change.
            Endpoint\Delete::make()
                ->authenticated()
                ->can('delete'),
        ];
    }

    public function sorts(): array
    {
        return [
            SortColumn::make('lastReplyAt')->descendingAlias('latest'),
            SortColumn::make('createdAt')->descendingAlias('newest')->ascendingAlias('oldest'),
        ];
    }

    public function fields(): array
    {
        return [
            Schema\Str::make('subject')
                ->writable()
                ->maxLength(200)
                ->set(function (SupportTicket $ticket, $value) {
                    $trimmed = is_string($value) ? trim($value) : '';
                    $ticket->subject = $trimmed;
                }),

            Schema\Str::make('status')
                ->writableOnUpdate()
                ->set(function (SupportTicket $ticket, $value, FlarumContext $context) {
                    if (! is_string($value)) {
                        return;
                    }
                    if (! in_array($value, SupportTicket::ALL_STATUSES, true)) {
                        return;
                    }
                    $actor = $context->getActor();
                    // Status changes are staff-only. The policy::update is
                    // already enforced for the endpoint -- this is a
                    // defensive double-check that ALSO catches a creator
                    // legitimately PATCHing their ticket (e.g. someday we
                    // let creators edit the subject; they shouldn't be
                    // able to also flip status in the same request).
                    $isStaff = $actor->isAdmin() || $actor->hasPermission('linkrobins-support.handle_tickets');
                    if (! $isStaff) {
                        return;
                    }
                    $ticket->status = $value;
                }),

            Schema\Str::make('decision')
                ->writableOnUpdate()
                ->nullable()
                ->set(function (SupportTicket $ticket, $value, FlarumContext $context) {
                    if ($value !== null && ! in_array($value, SupportTicket::ALL_DECISIONS, true)) {
                        return;
                    }
                    $actor = $context->getActor();
                    $isStaff = $actor->isAdmin() || $actor->hasPermission('linkrobins-support.handle_tickets');
                    if (! $isStaff) {
                        return;
                    }
                    $ticket->decision = $value;
                }),

            Schema\DateTime::make('createdAt')
                ->property('created_at'),
            Schema\DateTime::make('updatedAt')
                ->property('updated_at'),
            Schema\DateTime::make('lastReplyAt')
                ->property('last_reply_at')
                ->nullable(),

            Schema\Integer::make('replyCount')
                ->get(function (SupportTicket $ticket, FlarumContext $context) {
                    $actor = $context->getActor();
                    $isStaff = ! $actor->isGuest()
                        && ($actor->isAdmin() || $actor->hasPermission('linkrobins-support.handle_tickets'));
                    $q = $ticket->replies();
                    if (! $isStaff) {
                        $q->where('is_internal_note', false);
                    }
                    return $q->count();
                }),

            Schema\Boolean::make('canReply')
                ->get(function (SupportTicket $ticket, FlarumContext $context) {
                    $actor = $context->getActor();
                    if ($actor->isGuest()) {
                        return false;
                    }
                    try {
                        return $actor->can('reply', $ticket);
                    } catch (\Throwable $e) {
                        return false;
                    }
                }),

            Schema\Boolean::make('canUpdate')
                ->get(function (SupportTicket $ticket, FlarumContext $context) {
                    $actor = $context->getActor();
                    if ($actor->isGuest()) {
                        return false;
                    }
                    try {
                        return $actor->can('update', $ticket);
                    } catch (\Throwable $e) {
                        return false;
                    }
                }),

            Schema\Boolean::make('canPostInternalNote')
                ->get(function (SupportTicket $ticket, FlarumContext $context) {
                    $actor = $context->getActor();
                    if ($actor->isGuest()) {
                        return false;
                    }
                    try {
                        return $actor->can('postInternalNote', $ticket);
                    } catch (\Throwable $e) {
                        return false;
                    }
                }),

            // Whether the current actor is permitted to ever delete
            // this ticket (admin only, per SupportTicketPolicy). The
            // frontend uses this to show the moderation menu in the
            // ticket header.
            Schema\Boolean::make('canDelete')
                ->get(function (SupportTicket $ticket, FlarumContext $context) {
                    $actor = $context->getActor();
                    if ($actor->isGuest()) {
                        return false;
                    }
                    try {
                        return $actor->can('delete', $ticket);
                    } catch (\Throwable $e) {
                        return false;
                    }
                }),

            // Writable boolean toggling the ticket's soft-delete
            // state. PATCH isDeleted=true soft-deletes (deleted_at
            // set); PATCH isDeleted=false restores. Same pattern as
            // SupportReplyResource. Gated by the update policy (any
            // staff with handle_tickets can do this; the permanent
            // DELETE is admin-only per the delete policy).
            Schema\Boolean::make('isDeleted')
                ->get(fn (SupportTicket $ticket) => $ticket->deleted_at !== null)
                ->writable(function (SupportTicket $ticket, FlarumContext $context) {
                    if (! $context->updating()) {
                        return false;
                    }
                    $actor = $context->getActor();
                    if ($actor->isGuest()) {
                        return false;
                    }
                    return $actor->isAdmin()
                        || $actor->hasPermission('linkrobins-support.handle_tickets');
                })
                ->set(function (SupportTicket $ticket, bool $value, FlarumContext $context) {
                    if ($value && $ticket->deleted_at === null) {
                        $ticket->deleted_at = \Carbon\Carbon::now();
                    } elseif (! $value && $ticket->deleted_at !== null) {
                        $ticket->deleted_at = null;
                    }
                }),

            Schema\DateTime::make('deletedAt')
                ->property('deleted_at'),

            Schema\Relationship\ToOne::make('user')
                ->type('users')
                ->includable(),

            Schema\Relationship\ToOne::make('assignedStaff')
                ->type('users')
                ->includable()
                ->writableOnUpdate()
                ->set(function (SupportTicket $ticket, $value, FlarumContext $context) {
                    $actor = $context->getActor();
                    $isStaff = $actor->isAdmin() || $actor->hasPermission('linkrobins-support.handle_tickets');
                    if (! $isStaff) {
                        return;
                    }
                    if ($value === null) {
                        $ticket->assigned_staff_id = null;
                        return;
                    }
                    if (is_object($value) && isset($value->id)) {
                        $ticket->assigned_staff_id = (int) $value->id;
                    } elseif (is_numeric($value)) {
                        $ticket->assigned_staff_id = (int) $value;
                    }
                }),

            Schema\Relationship\ToOne::make('category')
                ->type('linkrobins-support-categories')
                ->includable()
                ->writable(),
        ];
    }

    public function creating(object $model, Context $context): ?object
    {
        $actor = $context->getActor();

        // Force user_id to the acting user. Same anti-impersonation guard
        // we apply on the blog: never trust relationships.user from the
        // request body. A request can't create a ticket "from" another
        // user, regardless of what JSON it sends.
        if (! $actor->isGuest()) {
            $model->user_id = $actor->id;
        }

        // Resolve the requested category. JSON:API gives it to us via the
        // relationship, but in `creating` the model isn't fully hydrated
        // yet -- so we pull it from the request body directly.
        $body = $context->body();
        $categoryRel = data_get($body, 'data.relationships.category.data.id');
        $category = null;
        if (is_numeric($categoryRel)) {
            $category = SupportCategory::query()->find((int) $categoryRel);
            if ($category) {
                $model->category_id = $category->id;
            }
        }
        if (! $category) {
            throw new BadRequestException('A category is required.');
        }

        // Check rate limits BEFORE the model saves. The limiter knows about
        // appeal vs. general and produces a structured rejection reason.
        $rate = $this->rateLimiter->check($actor, $category);
        if (! $rate['ok']) {
            throw new ForbiddenException($this->rateLimiter->describe($rate));
        }

        // Ban-state vs. category. A suspended user can create *appeal*
        // tickets but not general ones. Without this check, a suspended
        // user could bypass their ban by filing a general support
        // ticket and using it as a chat channel.
        // Note: Flarum has no built-in isBanned() method. We treat a
        // currently-suspended user (from flarum/suspend) as banned for
        // support purposes -- via UserState::isSuspended().
        if (UserState::isSuspended($actor) && ! $category->is_appeal) {
            throw new ForbiddenException(
                'Your account is restricted from creating general support tickets. You may file an appeal instead.'
            );
        }

        // Initial status. For appeal tickets we also set decision=pending so
        // the staff list shows it explicitly as awaiting decision.
        $model->status = SupportTicket::STATUS_OPEN;
        if ($category->is_appeal) {
            $model->decision = SupportTicket::DECISION_PENDING;
        }

        // last_reply_at starts at created_at so newly-opened tickets sort
        // correctly on the activity-sorted list.
        $model->last_reply_at = Carbon::now();

        return $model;
    }

    public function updating(object $model, Context $context): ?object
    {
        // Block user_id tampering on update. Same anti-impersonation guard
        // as on create. Staff legitimately editing a ticket might
        // accidentally include the user relationship; we silently revert.
        $originalUserId = $model->getOriginal('user_id');
        if ((int) $model->user_id !== (int) $originalUserId) {
            $model->user_id = $originalUserId;
        }
        return $model;
    }

    /**
     * Authorize permanent deletion of a ticket.
     *
     * The delete policy already restricts this to admins. Here we add
     * the soft-delete-first requirement: a ticket must already be
     * soft-deleted (deleted_at set) before it can be force-deleted.
     * That mirrors the reply moderation flow -- accidental DELETE on
     * a live ticket returns 400 instead of irreversibly wiping the
     * row plus all its replies (the FK cascade would otherwise
     * detonate everything in one click).
     */
    public function deleting(object $model, Context $context): void
    {
        if ($model->deleted_at === null) {
            throw new BadRequestException(
                'A ticket must be soft-deleted before it can be permanently removed.'
            );
        }

        // Force delete here so the row actually goes away. Without
        // this, Flarum's downstream delete() on a SoftDeletes model
        // that's already trashed is a no-op (it would just refresh
        // deleted_at to the current time). forceDelete() bypasses the
        // soft-delete scope and removes the row, which cascade-deletes
        // replies via the FK constraint.
        $model->forceDelete();
    }
}
