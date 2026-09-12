<?php

namespace LinkRobins\Support;

use Flarum\Database\AbstractModel;
use Flarum\User\User;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use LinkRobins\Support\Access\SupportAbilities;

/**
 * @property int $id
 * @property string $name
 * @property string $slug
 * @property string|null $description
 * @property string|null $color
 * @property string|null $icon
 * @property int $position
 * @property bool $is_appeal
 * @property int|null $default_assignee_id
 * @property \Carbon\Carbon|null $created_at
 * @property \Carbon\Carbon|null $updated_at
 * @property-read User|null $defaultAssignee
 * @property-read \Illuminate\Database\Eloquent\Collection<int, SupportTicket> $tickets
 */
class SupportCategory extends AbstractModel
{
    protected $table = 'linkrobins_support_categories';

    public $timestamps = true;

    protected $fillable = [
        'name',
        'slug',
        'description',
        'color',
        'icon',
        'position',
        'is_appeal',
        'default_assignee_id',
    ];

    protected $casts = [
        'position'  => 'integer',
        'is_appeal' => 'boolean',
    ];

    public function tickets(): HasMany
    {
        return $this->hasMany(SupportTicket::class, 'category_id');
    }

    /**
     * The staff member new tickets in this category are handed to. Null means
     * no auto-assign: tickets arrive unassigned and every staff member is
     * notified about them.
     */
    public function defaultAssignee(): BelongsTo
    {
        return $this->belongsTo(User::class, 'default_assignee_id');
    }

    /**
     * The default assignee, but only if they can still act on tickets.
     *
     * The configured user can stop being staff long after the category was
     * set up -- moved out of a group, permission revoked, account deleted --
     * and auto-assigning to them then would park every new ticket on someone
     * who cannot open it, with only that person notified. Treat that exactly
     * like no auto-assign at all: the ticket stays unassigned and the whole
     * staff list hears about it. Failing open is the only safe direction
     * here, because the alternative is a ticket nobody is told about.
     */
    public function effectiveDefaultAssignee(): ?User
    {
        if (! $this->default_assignee_id) {
            return null;
        }

        $user = $this->defaultAssignee;

        return $user && SupportAbilities::isStaff($user) ? $user : null;
    }
}
