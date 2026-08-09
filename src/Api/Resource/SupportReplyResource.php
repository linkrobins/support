<?php

namespace LinkRobins\Support\Api\Resource;

use Flarum\Api\Context as FlarumContext;
use Flarum\Api\Endpoint;
use Flarum\Api\Resource\AbstractDatabaseResource;
use Flarum\Api\Schema;
use Flarum\Api\Sort\SortColumn;
use Flarum\Locale\TranslatorInterface;
use Illuminate\Database\Eloquent\Builder;
use LinkRobins\Support\Access\SupportAbilities;
use LinkRobins\Support\SupportReply;
use LinkRobins\Support\SupportTicket;
use LinkRobins\Support\UserState;
use Psr\Log\LoggerInterface;
use Tobyz\JsonApiServer\Context;
use Tobyz\JsonApiServer\Exception\BadRequestException;
use Tobyz\JsonApiServer\Exception\ForbiddenException;

class SupportReplyResource extends AbstractDatabaseResource
{
    public function __construct(
        protected TranslatorInterface $translator,
        protected LoggerInterface $log,
    ) {
    }

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
     *
     * Soft-deleted replies (deleted_at set) are hidden from non-staff
     * entirely. Staff see them in the index with a redacted body so they
     * can restore or force-delete. This is achieved by calling
     * withTrashed() for staff and leaving the default Eloquent
     * SoftDeletes scope (which excludes trashed rows) in place for
     * non-staff.
     */
    public function scope(Builder $query, Context $context): void
    {
        /** @var \Illuminate\Database\Eloquent\Builder<SupportReply> $query */
        $actor = $context->getActor();
        if ($actor->isGuest()) {
            $query->whereRaw('1 = 0');
            return;
        }

        $isStaff = SupportAbilities::isStaff($actor);

        if (! $isStaff) {
            $query->whereHas('ticket', function ($q) use ($actor) {
                $q->where('user_id', (int) $actor->id);
            });
            $query->where('is_internal_note', false);
            // Non-staff don't see trashed replies (default SoftDeletes
            // scope handles this -- no extra work needed).
        } else {
            // Staff see soft-deleted rows too so they can restore /
            // force-delete them from the ticket detail page.
            $query->withTrashed();
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
                ->authenticated()
                ->defaultInclude(['user']),
            // Update: PATCH handles three distinct staff actions in
            // one endpoint -- edit content, soft-delete (isDeleted=
            // true), and restore (isDeleted=false). Which one runs
            // depends on which attributes are in the request body.
            // The updating() hook stamps edit metadata when content
            // changes; the isDeleted setter handles the soft-delete
            // state transitions.
            Endpoint\Update::make()
                ->authenticated()
                ->can('update'),
            // Delete: permanent removal. The deleting() hook rejects
            // the request unless the reply is already soft-deleted
            // (deleted_at set), making accidental hard-delete on a
            // live reply impossible. To "delete forever" from the
            // UI: first PATCH isDeleted=true, then DELETE.
            Endpoint\Delete::make()
                ->authenticated()
                ->can('delete'),
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
                        $this->log->warning('[linkrobins/support] formatContent failed', ['exception' => $e]);
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
                    $isStaff = SupportAbilities::isStaff($actor);
                    $reply->is_internal_note = $isStaff;
                }),

            Schema\DateTime::make('createdAt')
                ->property('created_at'),
            Schema\DateTime::make('updatedAt')
                ->property('updated_at'),

            // When set, this reply was edited after creation. The
            // frontend renders a small "(edited)" marker so other
            // staff can see the content is no longer the original. We
            // expose editedBy as well so the tooltip can name who did
            // the edit.
            Schema\DateTime::make('editedAt')
                ->property('edited_at'),

            // When set, this reply is soft-deleted. Non-staff can't
            // see it at all (the scope filters them out). Staff see
            // it with a redacted body and Restore / Delete-forever
            // actions in the moderation menu. Exposing deletedAt to
            // the API is what lets the frontend render the redacted
            // treatment without a second roundtrip to check.
            Schema\DateTime::make('deletedAt')
                ->property('deleted_at'),

            // Permission flags evaluated against the current actor.
            // The frontend uses these to show/hide the moderation
            // menu. Staff get true; non-staff get false. Computing
            // them server-side keeps the trust boundary in one place
            // (the API decides who can do what; the UI just reflects
            // it).
            Schema\Boolean::make('canEdit')
                ->get(function (SupportReply $reply, FlarumContext $context) {
                    $actor = $context->getActor();
                    if ($actor->isGuest()) {
                        return false;
                    }
                    return SupportAbilities::isStaff($actor);
                }),
            Schema\Boolean::make('canDelete')
                ->get(function (SupportReply $reply, FlarumContext $context) {
                    $actor = $context->getActor();
                    if ($actor->isGuest()) {
                        return false;
                    }
                    return SupportAbilities::isStaff($actor);
                }),

            // Writable boolean that maps to the soft-delete state.
            // PATCH with isDeleted=true soft-deletes the reply; PATCH
            // with isDeleted=false restores it. This is the same
            // pattern Flarum core uses for hide/restore on posts: the
            // moderation action is expressed as a state change in the
            // update payload rather than a custom endpoint, which
            // keeps the API surface uniform.
            //
            // Permanent deletion goes through DELETE, which the
            // deleting() hook only permits on already-soft-deleted
            // replies. Together this gives the four-state lifecycle
            // Karl asked for: edit (PATCH content), soft-delete
            // (PATCH isDeleted=true), restore (PATCH isDeleted=false),
            // delete forever (DELETE).
            Schema\Boolean::make('isDeleted')
                ->get(fn (SupportReply $reply) => $reply->deleted_at !== null)
                ->writable(function (SupportReply $reply, FlarumContext $context) {
                    if (! $context->updating()) {
                        return false;
                    }
                    $actor = $context->getActor();
                    if ($actor->isGuest()) {
                        return false;
                    }
                    return SupportAbilities::isStaff($actor);
                })
                ->set(function (SupportReply $reply, bool $value, FlarumContext $context) {
                    if ($value && $reply->deleted_at === null) {
                        // Soft delete: set deleted_at. We do this
                        // directly here so the resource's save flow
                        // commits it; calling $reply->delete() inside
                        // a setter would short-circuit the save.
                        $reply->deleted_at = \Carbon\Carbon::now();
                    } elseif (! $value && $reply->deleted_at !== null) {
                        $reply->deleted_at = null;
                    }
                }),

            Schema\Relationship\ToOne::make('user')
                ->type('users')
                ->includable(),

            // The user who last edited this reply, when it was edited.
            // Null for replies that have never been edited.
            Schema\Relationship\ToOne::make('editedBy')
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
        /** @var SupportReply $model */
        $actor = $context->getActor();
        if ($actor->isGuest()) {
            throw new ForbiddenException($this->translator->trans('linkrobins-support.api.login_required_reply'));
        }

        // Empty content -> clean 400. Without this, an empty body would
        // hit the NOT NULL constraint on the `content` column and the
        // user would see a 500 + SQL error. The frontend disables the
        // submit button on empty input; this is a backstop for direct
        // API calls. We check the underlying attribute directly because
        // the trait's setter has already run and set null for empty.
        $rawContent = $model->getAttribute('content');
        if ($rawContent === null || $rawContent === '') {
            throw new BadRequestException($this->translator->trans('linkrobins-support.api.reply_content_required'));
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
                throw new BadRequestException($this->translator->trans('linkrobins-support.api.reply_content_required'));
            }
        }

        // Force user_id to actor. No relationship impersonation.
        $model->user_id = $actor->id;

        // Hand the already-loaded actor to the model as its `user` relation.
        // The SupportReply::created hook reads $reply->user for its staff
        // check, which would otherwise re-read the row we are holding.
        $model->setRelation('user', $actor);

        // Resolve ticket from the relationship in the request body.
        $body = $context->body();
        $ticketRel = data_get($body, 'data.relationships.ticket.data.id');
        if (! is_numeric($ticketRel)) {
            throw new BadRequestException($this->translator->trans('linkrobins-support.api.ticket_required'));
        }
        $ticket = SupportTicket::query()->find((int) $ticketRel);
        if (! $ticket) {
            throw new BadRequestException($this->translator->trans('linkrobins-support.api.ticket_not_found'));
        }

        // Per-ticket reply permission.
        if (! $actor->can('reply', $ticket)) {
            throw new ForbiddenException($this->translator->trans('linkrobins-support.api.cannot_reply'));
        }

        $model->ticket_id = $ticket->id;

        // Belt-and-suspenders: if is_internal_note=true was set above but
        // the actor isn't staff, force it false. The setter already does
        // this, but the model could theoretically reach here with a stale
        // value from some other code path.
        if ($model->is_internal_note) {
            $isStaff = SupportAbilities::isStaff($actor);
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

    /**
     * Authorize the edit and record edit metadata.
     *
     * Only staff (admin OR handle_tickets permission) may edit a
     * reply. The author of a reply doesn't get to edit their own
     * post -- this is a support ticket, not a forum thread; allowing
     * the author to edit afterwards would let users rewrite history
     * to make staff responses look out of context.
     *
     * The is_internal_note flag is intentionally not editable here.
     * It's a sensitivity classification set at create time and
     * flipping it post-hoc could leak earlier internal context to
     * the ticket creator (if it goes from true to false). If staff
     * need to declassify a note, they should soft-delete and repost.
     */
    public function updating(object $model, Context $context): ?object
    {
        /** @var SupportReply $model */
        $actor = $context->getActor();
        if ($actor->isGuest()) {
            throw new ForbiddenException($this->translator->trans('linkrobins-support.api.login_required_edit'));
        }
        $isStaff = SupportAbilities::isStaff($actor);
        if (! $isStaff) {
            throw new ForbiddenException($this->translator->trans('linkrobins-support.api.no_permission_edit'));
        }

        // Reject empty/whitespace-only content, but only when the
        // content is actually being changed by this request. Pure
        // soft-delete / restore PATCHes (isDeleted toggle without
        // a content key in the payload) leave the existing content
        // intact and should not be rejected by this guard.
        if ($model->isDirty('content')) {
            $rawContent = $model->getAttribute('content');
            if ($rawContent === null || $rawContent === '') {
                throw new BadRequestException($this->translator->trans('linkrobins-support.api.reply_content_required'));
            }
            if (is_string($rawContent)) {
                $textOnly = trim(strip_tags($rawContent));
                if ($textOnly === '') {
                    throw new BadRequestException($this->translator->trans('linkrobins-support.api.reply_content_required'));
                }
            }
        }

        // Stamp edit metadata only when the content actually changed.
        // The same PATCH endpoint is used for content edits and for
        // soft-delete / restore (isDeleted toggle); we don't want a
        // soft-delete to falsely show as "(edited)" in the UI.
        // isDirty('content') reports true precisely when the content
        // attribute differs from what's in the DB.
        if ($model->isDirty('content')) {
            $model->edited_at         = \Carbon\Carbon::now();
            $model->edited_by_user_id = (int) $actor->id;
        }

        // Don't let the API change ticket_id, user_id, is_internal_note,
        // created_at, deleted_at, edited_at on update. The setter chain
        // for `content` and `isInternalNote` runs regardless; we just
        // reset what the setter may have applied for sensitive fields.
        if ($model->isDirty('is_internal_note')) {
            $model->is_internal_note = $model->getOriginal('is_internal_note');
        }
        if ($model->isDirty('user_id')) {
            $model->user_id = $model->getOriginal('user_id');
        }
        if ($model->isDirty('ticket_id')) {
            $model->ticket_id = $model->getOriginal('ticket_id');
        }

        return $model;
    }

    /**
     * Authorize permanent deletion.
     *
     * Two layers: (a) staff only, and (b) the reply must already be
     * soft-deleted (deleted_at set). The second check turns a stray
     * DELETE into a no-op safety: if a moderator misclicks the
     * "Delete forever" button on a live reply, we 400 instead of
     * irreversibly wiping the row. The intended flow is always
     * soft-delete first (PATCH isDeleted=true), then force-delete
     * after review.
     *
     * Note: the actual delete that runs after this hook depends on
     * what we do with the model. With SoftDeletes, calling delete()
     * on an already-soft-deleted model is a no-op -- it sets
     * deleted_at to a fresh timestamp but doesn't remove the row.
     * To permanently delete, we need to call forceDelete(). We
     * handle that by calling forceDelete() ourselves in this hook
     * and then short-circuiting Flarum's normal delete path.
     */
    public function deleting(object $model, Context $context): void
    {
        /** @var SupportReply $model */
        $actor = $context->getActor();
        if ($actor->isGuest()) {
            throw new ForbiddenException($this->translator->trans('linkrobins-support.api.login_required'));
        }
        $isStaff = SupportAbilities::isStaff($actor);
        if (! $isStaff) {
            throw new ForbiddenException($this->translator->trans('linkrobins-support.api.no_permission_delete'));
        }

        // Only allow force-delete on already-soft-deleted replies.
        if ($model->deleted_at === null) {
            throw new BadRequestException(
                $this->translator->trans('linkrobins-support.api.reply_soft_delete_first')
            );
        }

        // Force delete here so the row is actually gone after this
        // hook returns. Flarum's downstream delete() call on a
        // SoftDeletes model that's already trashed is a no-op, so
        // without this, the route would 204 but leave the row in
        // place. forceDelete also bypasses SoftDeletes scoping which
        // is what we want -- the staff explicitly asked for this row
        // to disappear.
        $model->forceDelete();
    }
}
