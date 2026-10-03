<?php

namespace LinkRobins\Support\Api\Controller;

use Flarum\Http\RequestUtil;
use Flarum\User\Exception\NotAuthenticatedException;
use Laminas\Diactoros\Response\JsonResponse;
use LinkRobins\Support\Access\SupportAbilities;
use LinkRobins\Support\SupportTicket;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\RequestHandlerInterface;

/**
 * GET /api/linkrobins-support-counts: the numbers beside the support sidebar
 * links.
 *
 * Everyone gets `mine_unread`, how many of their own tickets have a reply
 * they have not seen. Staff also get the open work in each queue and status
 * view. Closed tickets are never counted: that number only grows, and a
 * count beside it would just be noise. Deleted tickets are left out too.
 */
class TicketCountsController implements RequestHandlerInterface
{
    public function handle(ServerRequestInterface $request): ResponseInterface
    {
        $actor = RequestUtil::getActor($request);

        if ($actor->isGuest()) {
            throw new NotAuthenticatedException();
        }

        $isStaff = SupportAbilities::isStaff($actor);

        // A member's own tickets are few; staff can own tickets too, and the
        // same rule applies to them.
        $own = SupportTicket::query()->where('user_id', (int) $actor->id);
        SupportTicket::withUnreadFor($own, $actor, $isStaff);
        $counts = [
            'mine_unread' => $own->get(['id'])->filter(fn (SupportTicket $t) => (bool) $t->is_unread)->count(),
        ];

        if ($isStaff) {
            $notClosed = fn () => SupportTicket::query()->where('status', '!=', SupportTicket::STATUS_CLOSED);

            $counts['assigned_to_me'] = $notClosed()->where('assigned_staff_id', (int) $actor->id)->count();
            $counts['unassigned'] = $notClosed()->whereNull('assigned_staff_id')->count();

            $byStatus = $notClosed()
                ->selectRaw('status, COUNT(*) as aggregate')
                ->groupBy('status')
                ->pluck('aggregate', 'status');

            foreach ([
                SupportTicket::STATUS_OPEN,
                SupportTicket::STATUS_IN_PROGRESS,
                SupportTicket::STATUS_AWAITING_USER,
                SupportTicket::STATUS_RESOLVED,
            ] as $status) {
                $counts[$status] = (int) ($byStatus[$status] ?? 0);
            }
        }

        return new JsonResponse(['data' => $counts]);
    }
}
