<?php

namespace LinkRobins\Support;

use Carbon\Carbon;
use Flarum\User\User;

/**
 * Lightweight checks against Flarum's user state that aren't provided
 * by core. Flarum doesn't have a built-in `isBanned()` method -- ban
 * state is exposed via the Suspend extension's `suspended_until`
 * column, which is null when the user is not suspended.
 *
 * We treat a currently-suspended user as "banned" for support
 * purposes: they can't open general tickets, only appeal tickets.
 */
class UserState
{
    public static function isSuspended(User $user): bool
    {
        if ($user->isGuest()) {
            return false;
        }
        $until = $user->getAttribute('suspended_until');
        if (! $until) {
            return false;
        }
        try {
            $dt = $until instanceof Carbon ? $until : Carbon::parse((string) $until);
            return $dt->isFuture();
        } catch (\Throwable $e) {
            return false;
        }
    }

    public static function isAppealBanned(User $user): bool
    {
        if ($user->isGuest()) {
            return false;
        }
        return (bool) $user->getAttribute('support_appeal_banned');
    }
}
