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
     * Record what changed in a ticket save that has just happened.
     *
     * Called from the ticket's `updated` model event, where Eloquent still
     * holds the previous values as originals and the new ones as changes. That
     * is the one place every status change passes through: a staff member
     * picking a status, a reply moving it, and the auto-close command.
     */
    public static function recordChanges(SupportTicket $ticket): void
    {
        $changes = $ticket->getChanges();
        $now = Carbon::now();
        $actorId = $ticket->eventActorId;

        if (array_key_exists('status', $changes) && $ticket->getOriginal('status') !== $changes['status']) {
            $event = new static();
            $event->ticket_id = $ticket->id;
            $event->user_id = $actorId;
            $event->type = self::TYPE_STATUS;
            $event->from_status = $ticket->getOriginal('status');
            $event->to_status = $changes['status'];
            $event->is_automatic = $ticket->eventAutomatic;
            $event->created_at = $now;
            $event->save();
        }

        if (array_key_exists('assigned_staff_id', $changes)) {
            $from = $ticket->getOriginal('assigned_staff_id');
            $to = $changes['assigned_staff_id'];
            $from = $from === null ? null : (int) $from;
            $to = $to === null ? null : (int) $to;

            if ($from !== $to) {
                $event = new static();
                $event->ticket_id = $ticket->id;
                $event->user_id = $actorId;
                $event->type = self::TYPE_ASSIGNMENT;
                $event->from_user_id = $from;
                $event->to_user_id = $to;
                $event->created_at = $now;
                $event->save();
            }
        }
    }
}
