<?php

namespace LinkRobins\Support\Access;

use Flarum\Group\Group;
use Flarum\User\User;
use Illuminate\Database\Eloquent\Builder;

/**
 * Single source of truth for "who counts as support staff".
 *
 * The check (admin, or a user holding the handle_tickets permission) was
 * previously copy-pasted across the policies, searchers, resources, the
 * notifier and the service provider. Centralising it here means a future
 * change to the permission key -- or adding a new staff tier -- touches one
 * place instead of a dozen.
 */
class SupportAbilities
{
    public const HANDLE_TICKETS = 'lr-support.handle_tickets';
    public const MANAGE_APPEAL_BANS = 'lr-support.manage_appeal_bans';
    public const FORCE_DELETE_TICKETS = 'lr-support.force_delete_tickets';

    /**
     * Whether the actor may see and act on all tickets (admins always do).
     */
    public static function isStaff(User $actor): bool
    {
        if ($actor->isGuest()) {
            return false;
        }

        // Admins hold every permission, but the explicit short-circuit keeps
        // the intent obvious and matches the original inline checks.
        return $actor->isAdmin() || $actor->hasPermission(self::HANDLE_TICKETS);
    }

    /**
     * Narrow a users query to support staff: in the admin group, or in a
     * group holding handle_tickets. The query-side twin of isStaff(), shared
     * by the staff search filter and the staff list endpoint so the two can
     * never disagree about who is on the team.
     *
     * @param Builder<User> $query
     */
    public static function whereStaff(Builder $query): void
    {
        $query->where(function ($query) {
            $query->whereHas('groups', function ($q) {
                $q->where('groups.id', Group::ADMINISTRATOR_ID);
            })->orWhereHas('groups', function ($q) {
                $q->whereIn('groups.id', function ($sub) {
                    $sub->select('group_id')
                        ->from('group_permission')
                        ->where('permission', self::HANDLE_TICKETS);
                });
            });
        });
    }

    /**
     * Whether the actor may permanently (force-)delete tickets. Admins always
     * can; other staff need the explicit force_delete_tickets permission.
     * Plain soft-delete / restore only requires isStaff().
     */
    public static function canForceDelete(User $actor): bool
    {
        if ($actor->isGuest()) {
            return false;
        }

        return $actor->isAdmin() || $actor->hasPermission(self::FORCE_DELETE_TICKETS);
    }
}
