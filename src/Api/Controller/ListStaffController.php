<?php

namespace LinkRobins\Support\Api\Controller;

use Flarum\Http\RequestUtil;
use Flarum\User\Exception\PermissionDeniedException;
use Flarum\User\User;
use Laminas\Diactoros\Response\JsonResponse;
use LinkRobins\Support\Access\SupportAbilities;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\RequestHandlerInterface;

/**
 * GET /api/linkrobins-support-staff: the support team, for the "Assign"
 * picker on a ticket.
 *
 * Its own endpoint because core's user list requires the searchUsers
 * permission, which support staff often do not have; reusing it would leave
 * the picker empty for exactly the people who need it. Staff-only: who
 * handles tickets is internal routing, not something to hand any member.
 */
class ListStaffController implements RequestHandlerInterface
{
    public function handle(ServerRequestInterface $request): ResponseInterface
    {
        $actor = RequestUtil::getActor($request);

        if (! SupportAbilities::isStaff($actor)) {
            throw new PermissionDeniedException();
        }

        $query = User::query();
        SupportAbilities::whereStaff($query);

        $staff = $query->orderBy('username')->limit(200)->get()
            ->map(fn (User $user) => [
                'id'          => (string) $user->id,
                'username'    => $user->username,
                'displayName' => $user->display_name,
                'avatarUrl'   => $user->avatar_url,
            ])
            ->values()
            ->all();

        return new JsonResponse(['data' => $staff]);
    }
}
