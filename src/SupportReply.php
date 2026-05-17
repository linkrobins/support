<?php

namespace LinkRobins\Support;

use Flarum\Database\AbstractModel;
use Flarum\Formatter\Formattable;
use Flarum\Formatter\HasFormattedContent;
use Flarum\User\User;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

class SupportReply extends AbstractModel implements Formattable
{
    use HasFormattedContent;
    use SoftDeletes;

    protected $table = 'linkrobins_support_replies';

    public $timestamps = true;

    // ticket_id and user_id are set by the resource controller. is_internal_note
    // is set from the request after permission check (only staff can mark a
    // reply internal). deleted_at, edited_at, edited_by_user_id are handled
    // by the moderation endpoints, not mass assignment.
    protected $fillable = [
        'content',
    ];

    protected $casts = [
        'is_internal_note' => 'boolean',
        'edited_at'        => 'datetime',
    ];

    protected $dates = [
        'deleted_at',
        'edited_at',
    ];

    public function ticket(): BelongsTo
    {
        return $this->belongsTo(SupportTicket::class, 'ticket_id');
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id');
    }

    public function editedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'edited_by_user_id');
    }
}
