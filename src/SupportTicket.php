<?php

namespace LinkRobins\Support;

use Flarum\Database\AbstractModel;
use Flarum\User\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

/**
 * @property int $id
 * @property int|null $category_id
 * @property int|null $user_id
 * @property int|null $assigned_staff_id
 * @property string $subject
 * @property string $status
 * @property string|null $decision
 * @property string $priority
 * @property \Carbon\Carbon|null $last_reply_at
 * @property \Carbon\Carbon|null $status_changed_at
 * @property \Carbon\Carbon|null $reminded_at
 * @property \Carbon\Carbon|null $created_at
 * @property \Carbon\Carbon|null $updated_at
 * @property \Carbon\Carbon|null $deleted_at
 * @property-read int|null $reply_count_all
 * @property-read int|null $reply_count_public
 * @property-read bool|int|null $is_unread
 * @property-read SupportCategory|null $category
 * @property-read User|null $user
 * @property-read User|null $assignedStaff
 * @property-read \Illuminate\Database\Eloquent\Collection<int, SupportReply> $replies
 */
class SupportTicket extends AbstractModel
{
    use SoftDeletes;

    protected $table = 'linkrobins_support_tickets';

    public $timestamps = true;

    /**
     * Who is making the change being saved, for the ticket timeline.
     *
     * Not a column. Model events cannot see the request, so each place that
     * changes a ticket says who is doing it before saving: the API resource
     * sets the acting user, a reply sets its author, and the auto-close
     * command leaves it null so the change reads as the forum's own.
     */
    public ?int $eventActorId = null;

    public const STATUS_OPEN          = 'open';
    public const STATUS_IN_PROGRESS   = 'in_progress';
    public const STATUS_AWAITING_USER = 'awaiting_user';
    public const STATUS_RESOLVED      = 'resolved';
    public const STATUS_CLOSED        = 'closed';

    public const PRIORITY_LOW    = 'low';
    public const PRIORITY_NORMAL = 'normal';
    public const PRIORITY_URGENT = 'urgent';

    public const ALL_PRIORITIES = [
        self::PRIORITY_LOW,
        self::PRIORITY_NORMAL,
        self::PRIORITY_URGENT,
    ];

    public const DECISION_PENDING  = 'pending';
    public const DECISION_ACCEPTED = 'accepted';
    public const DECISION_REJECTED = 'rejected';

    /**
     * Full translation key for a status label, for server-side use (emails).
     *
     * Not `status.$status`: the locale calls STATUS_AWAITING_USER
     * "awaiting_response", because the label is written from the reader's
     * point of view while the constant is written from the ticket's. Building
     * the key by string concatenation puts a raw `...status.awaiting_user` in
     * front of a customer for that one status, which is exactly the kind of
     * untranslated-key bug this extension has shipped before.
     */
    public static function statusLabelKey(string $status): string
    {
        $names = [
            self::STATUS_OPEN          => 'open',
            self::STATUS_IN_PROGRESS   => 'in_progress',
            self::STATUS_AWAITING_USER => 'awaiting_response',
            self::STATUS_RESOLVED      => 'resolved',
            self::STATUS_CLOSED        => 'closed',
        ];

        return 'linkrobins-support.forum.status.'.($names[$status] ?? $status);
    }

    public const ALL_STATUSES = [
        self::STATUS_OPEN,
        self::STATUS_IN_PROGRESS,
        self::STATUS_AWAITING_USER,
        self::STATUS_RESOLVED,
        self::STATUS_CLOSED,
    ];

    public const ALL_DECISIONS = [
        self::DECISION_PENDING,
        self::DECISION_ACCEPTED,
        self::DECISION_REJECTED,
    ];

    // user_id (the creator), assigned_staff_id, and category_id are set
    // by the resource controller, never by mass-assignment from the
    // client. subject is the only attribute the client controls
    // directly. status/decision/last_reply_at are managed by staff
    // actions and the reply event hook.
    protected $fillable = [
        'subject',
    ];

    protected $casts = [
        'last_reply_at'     => 'datetime',
        'status_changed_at' => 'datetime',
        'reminded_at'       => 'datetime',
    ];

    /** @var list<string> */
    protected $dates = [
        'deleted_at',
    ];

    public function category(): BelongsTo
    {
        return $this->belongsTo(SupportCategory::class, 'category_id');
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }

    public function assignedStaff(): BelongsTo
    {
        return $this->belongsTo(User::class, 'assigned_staff_id');
    }

    public function replies(): HasMany
    {
        return $this->hasMany(SupportReply::class, 'ticket_id');
    }

    /**
     * Add `is_unread` for $actor: true when the ticket has a reply they can
     * see, written by someone else, newer than their last visit (or they have
     * never opened it).
     *
     * "Can see" is the important part. A member is only ever judged on public,
     * undeleted replies; judging them on last_reply_at would turn their ticket
     * unread whenever staff added an internal note, and give the note away.
     * Built with the query builder, not raw SQL, so table prefixes apply.
     *
     * A reply in the same second as the visit counts as unread: better a
     * marker that clears on the next look than a reply nobody saw.
     *
     * @param Builder<SupportTicket> $query
     */
    public static function withUnreadFor(Builder $query, User $actor, bool $isStaff): void
    {
        if ($actor->isGuest()) {
            return;
        }

        $actorId = (int) $actor->id;
        $replies = (new SupportReply())->getTable();

        $query->withExists(['replies as is_unread' => function ($q) use ($actorId, $isStaff, $replies) {
            $q->where(fn ($w) => $w->whereNull($replies.'.user_id')->orWhere($replies.'.user_id', '!=', $actorId));

            if (! $isStaff) {
                $q->where($replies.'.is_internal_note', false);
            }

            $q->whereNotExists(function ($read) use ($actorId, $replies) {
                $read->selectRaw('1')
                    ->from('linkrobins_support_reads')
                    ->whereColumn('linkrobins_support_reads.ticket_id', $replies.'.ticket_id')
                    ->where('linkrobins_support_reads.user_id', $actorId)
                    ->whereColumn('linkrobins_support_reads.last_read_at', '>', $replies.'.created_at');
            });
        }]);
    }

    public function isAppeal(): bool
    {
        return $this->category && $this->category->is_appeal;
    }

    public function isOpen(): bool
    {
        return in_array($this->status, [
            self::STATUS_OPEN,
            self::STATUS_IN_PROGRESS,
            self::STATUS_AWAITING_USER,
        ], true);
    }

    public function isClosed(): bool
    {
        return $this->status === self::STATUS_CLOSED;
    }
}
