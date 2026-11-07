<?php

namespace LinkRobins\Support;

use Carbon\Carbon;
use Flarum\Database\AbstractModel;
use Flarum\User\User;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A status or assignment change on a ticket, shown in the ticket timeline.
 *
 * @property int $id
 * @property int $ticket_id
 * @property int|null $user_id
 * @property string $type
 * @property string|null $from_status
 * @property string|null $to_status
 * @property int|null $from_user_id
 * @property int|null $to_user_id
 * @property bool $is_automatic
 * @property Carbon $created_at
 * @property-read SupportTicket|null $ticket
 * @property-read User|null $user
 * @property-read User|null $fromUser
 * @property-read User|null $toUser
 */
class SupportEvent extends AbstractModel
{
    public const TYPE_STATUS     = 'status';
    public const TYPE_ASSIGNMENT = 'assignment';

    protected $table = 'linkrobins_support_events';

    public $timestamps = false;

    protected $casts = [
        'created_at'   => 'datetime',
        'from_user_id' => 'integer',
        'to_user_id'   => 'integer',
        'is_automatic' => 'boolean',
    ];

    public function ticket(): BelongsTo
    {
        return $this->belongsTo(SupportTicket::class, 'ticket_id');
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }

    public function fromUser(): BelongsTo
    {
        return $this->belongsTo(User::class, 'from_user_id');
    }

    public function toUser(): BelongsTo
    {
        return $this->belongsTo(User::class, 'to_user_id');
    }

    /**
     * Record a status change in the ticket timeline.
     */
    public static function recordStatusChange(
        SupportTicket $ticket,
        ?User $actor,
        ?string $fromStatus,
        string $toStatus,
        bool $isAutomatic = false
    ): static {
        $event = new static();
        $event->ticket_id = (int) $ticket->id;
        $event->user_id = $actor ? (int) $actor->id : null;
        $event->type = self::TYPE_STATUS;
        $event->from_status = $fromStatus;
        $event->to_status = $toStatus;
        $event->is_automatic = $isAutomatic;
        $event->created_at = Carbon::now();
        $event->save();

        return $event;
    }

    /**
     * Record an assignment change in the ticket timeline.
     */
    public static function recordAssignment(
        SupportTicket $ticket,
        ?User $actor,
        ?User $fromUser,
        ?User $toUser
    ): static {
        $event = new static();
        $event->ticket_id = (int) $ticket->id;
        $event->user_id = $actor ? (int) $actor->id : null;
        $event->type = self::TYPE_ASSIGNMENT;
        $event->from_user_id = $fromUser ? (int) $fromUser->id : null;
        $event->to_user_id = $toUser ? (int) $toUser->id : null;
        $event->created_at = Carbon::now();
        $event->save();

        return $event;
    }
}
