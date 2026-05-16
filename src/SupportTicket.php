<?php

namespace LinkRobins\Support;

use Flarum\Database\AbstractModel;
use Flarum\User\User;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class SupportTicket extends AbstractModel
{
    protected $table = 'linkrobins_support_tickets';

    public $timestamps = true;

    public const STATUS_OPEN          = 'open';
    public const STATUS_IN_PROGRESS   = 'in_progress';
    public const STATUS_AWAITING_USER = 'awaiting_user';
    public const STATUS_RESOLVED      = 'resolved';
    public const STATUS_CLOSED        = 'closed';

    public const DECISION_PENDING  = 'pending';
    public const DECISION_ACCEPTED = 'accepted';
    public const DECISION_REJECTED = 'rejected';

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
        'last_reply_at' => 'datetime',
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
