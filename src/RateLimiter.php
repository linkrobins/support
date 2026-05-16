<?php

namespace LinkRobins\Support;

use Carbon\Carbon;
use Flarum\Settings\SettingsRepositoryInterface;
use Flarum\User\User;

/**
 * Centralizes ticket-creation rate limits so the rules live in one place
 * and the controller stays slim.
 *
 * Defaults (overrideable via settings):
 *
 *   linkrobins-support.appeal_limit_per_window     = 3
 *   linkrobins-support.appeal_window_days          = 30
 *   linkrobins-support.appeal_max_concurrent_open  = 1
 *   linkrobins-support.general_limit_per_window    = 10
 *   linkrobins-support.general_window_hours        = 24
 *
 * Returns a structured reason on rejection so the controller can format
 * a useful error message for the user.
 */
class RateLimiter
{
    public function __construct(
        protected SettingsRepositoryInterface $settings,
    ) {
    }

    public const REASON_OK                = 'ok';
    public const REASON_APPEAL_BANNED     = 'appeal_banned';
    public const REASON_APPEAL_QUOTA      = 'appeal_quota_exceeded';
    public const REASON_APPEAL_HAS_OPEN   = 'appeal_already_open';
    public const REASON_GENERAL_QUOTA     = 'general_quota_exceeded';

    /**
     * Returns ['ok' => bool, 'reason' => string, 'meta' => array]. `meta`
     * contains the relevant numbers (limit, window, time-to-next-allowed)
     * for the rejection message.
     */
    public function check(User $actor, SupportCategory $category): array
    {
        if ($category->is_appeal) {
            return $this->checkAppeal($actor, $category);
        }
        return $this->checkGeneral($actor, $category);
    }

    protected function checkAppeal(User $actor, SupportCategory $category): array
    {
        // Permanent appeal-ban: hard stop, no window.
        if ((bool) $actor->getAttribute('support_appeal_banned')) {
            return $this->fail(self::REASON_APPEAL_BANNED, []);
        }

        $maxConcurrent = (int) $this->settings->get(
            'linkrobins-support.appeal_max_concurrent_open',
            1
        );
        if ($maxConcurrent > 0) {
            $openAppealCount = $this->countOpenAppealsForUser($actor);

            if ($openAppealCount >= $maxConcurrent) {
                return $this->fail(self::REASON_APPEAL_HAS_OPEN, [
                    'open' => $openAppealCount,
                    'max'  => $maxConcurrent,
                ]);
            }
        }

        $limit  = (int) $this->settings->get('linkrobins-support.appeal_limit_per_window', 3);
        $days   = (int) $this->settings->get('linkrobins-support.appeal_window_days', 30);
        if ($limit > 0 && $days > 0) {
            $since = Carbon::now()->subDays($days);
            $count = $this->countAppealsForUserSince($actor, $since);

            if ($count >= $limit) {
                return $this->fail(self::REASON_APPEAL_QUOTA, [
                    'count' => $count,
                    'limit' => $limit,
                    'days'  => $days,
                ]);
            }
        }

        return $this->ok();
    }

    protected function checkGeneral(User $actor, SupportCategory $category): array
    {
        $limit = (int) $this->settings->get('linkrobins-support.general_limit_per_window', 10);
        $hours = (int) $this->settings->get('linkrobins-support.general_window_hours', 24);
        if ($limit <= 0 || $hours <= 0) {
            return $this->ok();
        }

        $since = Carbon::now()->subHours($hours);
        $count = $this->countGeneralTicketsForUserSince($actor, $since);

        if ($count >= $limit) {
            return $this->fail(self::REASON_GENERAL_QUOTA, [
                'count' => $count,
                'limit' => $limit,
                'hours' => $hours,
            ]);
        }

        return $this->ok();
    }

    protected function ok(): array
    {
        return ['ok' => true, 'reason' => self::REASON_OK, 'meta' => []];
    }

    protected function fail(string $reason, array $meta): array
    {
        return ['ok' => false, 'reason' => $reason, 'meta' => $meta];
    }

    /**
     * Human-readable explanation matching a check() result. Keeps the
     * error-string concerns in one place so controllers don't duplicate
     * the wording.
     */
    public function describe(array $result): string
    {
        if (! empty($result['ok'])) {
            return '';
        }
        $meta = $result['meta'] ?? [];
        switch ($result['reason'] ?? '') {
            case self::REASON_APPEAL_BANNED:
                return 'You are not permitted to file appeals.';
            case self::REASON_APPEAL_HAS_OPEN:
                return 'You already have an open appeal. Please wait for it to be resolved before filing another.';
            case self::REASON_APPEAL_QUOTA:
                return sprintf(
                    'You have already filed %d appeal(s) in the past %d days (limit: %d). Try again later.',
                    $meta['count'] ?? 0,
                    $meta['days']  ?? 0,
                    $meta['limit'] ?? 0,
                );
            case self::REASON_GENERAL_QUOTA:
                return sprintf(
                    'You have filed %d tickets in the past %d hours (limit: %d). Please wait before filing another.',
                    $meta['count'] ?? 0,
                    $meta['hours'] ?? 0,
                    $meta['limit'] ?? 0,
                );
        }
        return 'Cannot create a ticket right now.';
    }

    // --- DB query methods, extracted so tests can override -------------
    //
    // These intentionally do exactly one thing each (a single count query)
    // so test subclasses can stub them with hardcoded return values without
    // having to spin up Eloquent.

    protected function countOpenAppealsForUser(User $actor): int
    {
        return SupportTicket::query()
            ->where('user_id', $actor->id)
            ->whereHas('category', function ($q) {
                $q->where('is_appeal', true);
            })
            ->whereIn('status', [
                SupportTicket::STATUS_OPEN,
                SupportTicket::STATUS_IN_PROGRESS,
                SupportTicket::STATUS_AWAITING_USER,
            ])
            ->count();
    }

    protected function countAppealsForUserSince(User $actor, Carbon $since): int
    {
        return SupportTicket::query()
            ->where('user_id', $actor->id)
            ->whereHas('category', function ($q) {
                $q->where('is_appeal', true);
            })
            ->where('created_at', '>=', $since)
            ->count();
    }

    protected function countGeneralTicketsForUserSince(User $actor, Carbon $since): int
    {
        return SupportTicket::query()
            ->where('user_id', $actor->id)
            ->whereHas('category', function ($q) {
                $q->where('is_appeal', false);
            })
            ->where('created_at', '>=', $since)
            ->count();
    }
}
