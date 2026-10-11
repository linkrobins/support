<?php

namespace LinkRobins\Support;

use Flarum\Database\AbstractModel;
use Flarum\Group\Group;
use Flarum\User\User;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use LinkRobins\Support\Access\SupportAbilities;
use LinkRobins\Support\TicketType\AppealTicketType;
use LinkRobins\Support\TicketType\StandardTicketType;
use LinkRobins\Support\TicketType\TicketTypeInterface;
use LinkRobins\Support\TicketType\TicketTypeManager;

/**
 * @property int $id
 * @property string $name
 * @property string $slug
 * @property string|null $description
 * @property string|null $color
 * @property string|null $icon
 * @property int $position
 * @property bool $is_appeal
 * @property string|null $ticket_type
 * @property int|null $default_assignee_id
 * @property array<int>|null $allowed_group_ids
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
        'ticket_type',
        'default_assignee_id',
        'allowed_group_ids',
    ];

    protected $casts = [
        'position'  => 'integer',
        'is_appeal' => 'boolean',
        'allowed_group_ids' => 'array',
    ];

    public static function boot()
    {
        parent::boot();

        static::saving(function (self $category) {
            if ($category->ticket_type) {
                // Keep legacy is_appeal column in sync with driver definition
                try {
                    /** @var TicketTypeManager $manager */
                    $manager = resolve(TicketTypeManager::class);
                    $type = $manager->get($category->ticket_type);
                    $category->is_appeal = $type->isAppeal();
                } catch (\Throwable) {
                    // Ignore resolution errors during early boots or migrations
                }
            }
        });
    }

    /**
     * Resolve the ticket type driver for this category.
     * Falls back to Appeal if is_appeal is true, or Standard otherwise.
     */
    public function ticketType(): TicketTypeInterface
    {
        $typeId = $this->ticket_type;

        if (! $typeId) {
            $typeId = $this->is_appeal
                ? AppealTicketType::ID
                : StandardTicketType::ID;
        }

        try {
            /** @var TicketTypeManager $manager */
            $manager = resolve(TicketTypeManager::class);
            return $manager->get($typeId);
        } catch (\Throwable) {
            return new StandardTicketType();
        }
    }

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

    /**
     * Determine if a user may create a ticket in this category.
     * Combines the ticket type driver's eligibility check with
     * any admin-configured allowed user groups.
     */
    public function canCreate(User $actor): bool
    {
        if (! $this->ticketType()->canCreate($actor, $this)) {
            return false;
        }

        if (! empty($this->allowed_group_ids)) {
            if ($actor->isAdmin()) {
                return true;
            }

            $allowed = is_array($this->allowed_group_ids)
                ? $this->allowed_group_ids
                : json_decode($this->allowed_group_ids, true);

            if (! empty($allowed)) {
                $userGroupIds = array_map('intval', $actor->groups->pluck('id')->all());
                if (! $actor->isGuest()) {
                    $userGroupIds[] = Group::MEMBER_ID;
                }
                $allowedInts = array_map('intval', $allowed);
                if (empty(array_intersect($userGroupIds, $allowedInts))) {
                    return false;
                }
            }
        }

        return true;
    }
}
