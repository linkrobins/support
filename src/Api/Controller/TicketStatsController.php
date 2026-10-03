<?php

namespace LinkRobins\Support\Api\Controller;

use Carbon\Carbon;
use Carbon\CarbonInterface;
use Flarum\Http\RequestUtil;
use Flarum\User\Exception\PermissionDeniedException;
use Flarum\User\User;
use Illuminate\Support\Arr;
use Laminas\Diactoros\Response\JsonResponse;
use LinkRobins\Support\Access\SupportAbilities;
use LinkRobins\Support\SupportEvent;
use LinkRobins\Support\SupportReply;
use LinkRobins\Support\SupportTicket;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\RequestHandlerInterface;

/**
 * GET /api/linkrobins-support-stats?days=7|30|90: the staff Stats page.
 *
 * Everything is derived from what is already stored: tickets, replies and
 * the status history. Nothing new is tracked. Times are in seconds; the page
 * formats them. Staff only.
 *
 * Durations need history that only exists from the moment this version is
 * installed (status changes were not recorded before), so a window that
 * reaches back before the upgrade under-counts "time to resolve" and the
 * confirmed/auto-closed split until it fills up.
 */
class TicketStatsController implements RequestHandlerInterface
{
    public const WINDOWS = [7, 30, 90];

    /** Above this many tickets in a window, durations are computed from the most recent ones. */
    protected const SAMPLE_LIMIT = 5000;

    public function handle(ServerRequestInterface $request): ResponseInterface
    {
        $actor = RequestUtil::getActor($request);

        if (! SupportAbilities::isStaff($actor)) {
            throw new PermissionDeniedException();
        }

        $days = (int) Arr::get($request->getQueryParams(), 'days', 30);
        if (! in_array($days, self::WINDOWS, true)) {
            $days = 30;
        }

        $now = Carbon::now();
        $since = $now->copy()->subDays($days);

        $staffQuery = User::query();
        SupportAbilities::whereStaff($staffQuery);
        /** @var array<int, User> $staff */
        $staff = $staffQuery->get(['id', 'username'])->keyBy('id')->all();
        $staffIds = array_keys($staff);

        $tickets = SupportTicket::query()
            ->where('created_at', '>=', $since)
            ->orderByDesc('created_at')
            ->limit(self::SAMPLE_LIMIT)
            ->get(['id', 'user_id', 'created_at']);
        $ticketIds = $tickets->pluck('id')->all();
        $owners = $tickets->pluck('user_id', 'id')->all();
        $openedAt = $tickets->mapWithKeys(fn (SupportTicket $t) => [$t->id => $t->created_at])->all();

        // First staff reply on each ticket opened in the window. A staff
        // member's own ticket waits for someone else's answer.
        $firstResponse = [];
        $firstResponder = [];
        if ($ticketIds && $staffIds) {
            SupportReply::query()
                ->whereIn('ticket_id', $ticketIds)
                ->whereIn('user_id', $staffIds)
                ->where('is_internal_note', false)
                ->orderBy('created_at')
                ->get(['ticket_id', 'user_id', 'created_at'])
                ->each(function (SupportReply $reply) use (&$firstResponse, &$firstResponder, $owners, $openedAt) {
                    $ticketId = (int) $reply->ticket_id;
                    if (isset($firstResponse[$ticketId]) || (int) $reply->user_id === (int) ($owners[$ticketId] ?? 0)) {
                        return;
                    }
                    $firstResponse[$ticketId] = $this->seconds($openedAt[$ticketId] ?? null, $reply->created_at);
                    $firstResponder[$ticketId] = (int) $reply->user_id;
                });
        }

        // First move to resolved (or straight to closed) on each of them.
        $resolveTimes = [];
        if ($ticketIds) {
            SupportEvent::query()
                ->whereIn('ticket_id', $ticketIds)
                ->where('type', SupportEvent::TYPE_STATUS)
                ->whereIn('to_status', [SupportTicket::STATUS_RESOLVED, SupportTicket::STATUS_CLOSED])
                ->orderBy('created_at')
                ->get(['ticket_id', 'created_at'])
                ->each(function (SupportEvent $event) use (&$resolveTimes, $openedAt) {
                    $ticketId = (int) $event->ticket_id;
                    if (! isset($resolveTimes[$ticketId])) {
                        $resolveTimes[$ticketId] = $this->seconds($openedAt[$ticketId] ?? null, $event->created_at);
                    }
                });
        }

        // Closes in the window, for volume and for how tickets end.
        $closes = SupportEvent::query()
            ->with('ticket:id,user_id')
            ->where('type', SupportEvent::TYPE_STATUS)
            ->where('to_status', SupportTicket::STATUS_CLOSED)
            ->where('created_at', '>=', $since)
            ->get(['ticket_id', 'user_id', 'from_status', 'created_at']);

        $endings = ['confirmed' => 0, 'auto' => 0, 'staff' => 0];
        foreach ($closes as $close) {
            /** @var SupportEvent $close */
            if ($close->from_status !== SupportTicket::STATUS_RESOLVED) {
                continue;
            }
            if ($close->user_id === null) {
                $endings['auto']++;
            } elseif ($close->ticket && (int) $close->user_id === (int) $close->ticket->user_id) {
                $endings['confirmed']++;
            } else {
                $endings['staff']++;
            }
        }

        // Volume per period: days for a week, weeks otherwise.
        $buckets = $this->buckets($since, $now, $days === 7 ? 'day' : 'week');
        $bucketKey = fn (CarbonInterface $at) => $days === 7 ? $at->copy()->startOfDay()->toDateString() : $at->copy()->startOfWeek()->toDateString();
        foreach ($tickets as $ticket) {
            /** @var SupportTicket $ticket */
            $key = $bucketKey($ticket->created_at);
            if (isset($buckets[$key])) {
                $buckets[$key]['opened']++;
            }
        }
        foreach ($closes as $close) {
            /** @var SupportEvent $close */
            $key = $bucketKey($close->created_at);
            if (isset($buckets[$key])) {
                $buckets[$key]['closed']++;
            }
        }

        // The current backlog, not limited to the window.
        $waiting = fn () => SupportTicket::query()->whereIn('status', [
            SupportTicket::STATUS_OPEN,
            SupportTicket::STATUS_IN_PROGRESS,
            SupportTicket::STATUS_AWAITING_USER,
        ]);

        // Per staff member, over the window.
        $people = [];
        if ($staffIds) {
            $replies = SupportReply::query()
                ->whereIn('user_id', $staffIds)
                ->where('is_internal_note', false)
                ->where('created_at', '>=', $since)
                ->get(['ticket_id', 'user_id']);
            foreach ($staff as $id => $member) {
                $mine = $replies->where('user_id', $id);
                $responses = array_values(array_intersect_key($firstResponse, array_filter($firstResponder, fn ($who) => $who === $id)));
                if ($mine->isEmpty() && ! $responses) {
                    continue;
                }
                $people[] = [
                    'id' => (string) $id,
                    'username' => $member->username,
                    'displayName' => $member->display_name,
                    'replies' => $mine->count(),
                    'tickets' => $mine->pluck('ticket_id')->unique()->count(),
                    'firstResponses' => count($responses),
                    'medianFirstResponse' => $this->percentile($responses, 50),
                ];
            }
            usort($people, fn ($a, $b) => $b['replies'] <=> $a['replies']);
        }

        return new JsonResponse(['data' => [
            'days' => $days,
            'opened' => $tickets->count(),
            'closed' => $closes->count(),
            'firstResponse' => [
                'median' => $this->percentile(array_values($firstResponse), 50),
                'p90' => $this->percentile(array_values($firstResponse), 90),
                'answered' => count($firstResponse),
                'unanswered' => $tickets->count() - count($firstResponse),
            ],
            'timeToResolve' => [
                'median' => $this->percentile(array_values($resolveTimes), 50),
                'p90' => $this->percentile(array_values($resolveTimes), 90),
                'resolved' => count($resolveTimes),
            ],
            'backlog' => [
                'waiting' => $waiting()->count(),
                'olderThan3Days' => $waiting()->where('created_at', '<=', $now->copy()->subDays(3))->count(),
                'olderThan7Days' => $waiting()->where('created_at', '<=', $now->copy()->subDays(7))->count(),
                'unassigned' => $waiting()->whereNull('assigned_staff_id')->count(),
            ],
            'endings' => $endings,
            'volume' => array_values($buckets),
            'staff' => $people,
        ]]);
    }

    protected function seconds(?CarbonInterface $from, ?CarbonInterface $to): int
    {
        if (! $from || ! $to) {
            return 0;
        }

        return max(0, $to->getTimestamp() - $from->getTimestamp());
    }

    /**
     * Nearest-rank percentile; null when there is nothing to measure.
     *
     * @param list<int> $values
     */
    protected function percentile(array $values, int $percent): ?int
    {
        if (! $values) {
            return null;
        }
        sort($values);
        $rank = (int) ceil($percent / 100 * count($values));

        return $values[max(0, $rank - 1)];
    }

    /**
     * Empty periods from $since to $now, keyed by their start date, so the
     * chart shows quiet weeks as zero rather than leaving them out.
     *
     * @return array<string, array{start: string, opened: int, closed: int}>
     */
    protected function buckets(CarbonInterface $since, CarbonInterface $now, string $unit): array
    {
        $cursor = $unit === 'day' ? $since->copy()->startOfDay() : $since->copy()->startOfWeek();
        $out = [];
        while ($cursor <= $now) {
            $key = $cursor->toDateString();
            $out[$key] = ['start' => $key, 'opened' => 0, 'closed' => 0];
            $cursor = $unit === 'day' ? $cursor->copy()->addDay() : $cursor->copy()->addWeek();
        }

        return $out;
    }
}
