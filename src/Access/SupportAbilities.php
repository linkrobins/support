<?php

namespace LinkRobins\Support\Access;

use Flarum\User\User;

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
    public const HANDLE_TICKETS = 'linkrobins-support.handle_tickets';
    public const MANAGE_APPEAL_BANS = 'linkrobins-support.manage_appeal_bans';
    public const FORCE_DELETE_TICKETS = 'linkrobins-support.force_delete_tickets';

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
