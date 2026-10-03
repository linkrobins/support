<?php

namespace LinkRobins\Support\Api\Controller;

use Carbon\Carbon;
use Flarum\Http\RequestUtil;
use Flarum\User\Exception\NotAuthenticatedException;
use Illuminate\Database\ConnectionInterface;
use Illuminate\Support\Arr;
use Laminas\Diactoros\Response\EmptyResponse;
use LinkRobins\Support\Access\SupportAbilities;
use LinkRobins\Support\SupportTicket;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\RequestHandlerInterface;
use Tobyz\JsonApiServer\Exception\NotFoundException;

/**
 * POST /api/linkrobins-support-tickets/{id}/read: the actor has just looked
 * at this ticket, so it stops showing as unread for them.
 *
 * Only for a ticket the actor can see: a missing, foreign or (for a member)
 * deleted ticket is a 404, exactly as if they had tried to open it.
 */
class MarkTicketReadController implements RequestHandlerInterface
{
    public function __construct(
        protected ConnectionInterface $db,
    ) {
    }

    public function handle(ServerRequestInterface $request): ResponseInterface
    {
        $actor = RequestUtil::getActor($request);

        if ($actor->isGuest()) {
            throw new NotAuthenticatedException();
        }

        $id = (int) Arr::get($request->getQueryParams(), 'id');
        $query = SupportTicket::query()->whereKey($id);
        if (SupportAbilities::isStaff($actor)) {
            $query->withTrashed();
        } else {
            $query->where('user_id', (int) $actor->id);
        }

        if (! $query->exists()) {
            throw new NotFoundException();
        }

        $this->db->table('linkrobins_support_reads')->upsert(
            [['ticket_id' => $id, 'user_id' => (int) $actor->id, 'last_read_at' => Carbon::now()]],
            ['ticket_id', 'user_id'],
            ['last_read_at']
        );

        return new EmptyResponse(204);
    }
}
