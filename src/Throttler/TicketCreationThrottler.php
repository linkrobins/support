<?php

namespace LinkRobins\Support\Throttler;

use Flarum\Http\RequestUtil;
use Flarum\User\User;
use Illuminate\Cache\RateLimiter;
use Psr\Http\Message\ServerRequestInterface;

/**
 * Anti-flood throttler for support tickets and replies.
 *
 * Runs at the HTTP middleware layer via Flarum's Extend\ThrottleApi.
 * Protects the server from rapid-fire spam and automated scripts by
 * rejecting repeated submissions within a short cooldown window with HTTP 429
 * before any controller or database transaction begins.
 */
class TicketCreationThrottler
{
    public static int $timeout = 10;

    public function __construct(
        protected RateLimiter $limiter,
    ) {
    }

    public function __invoke(ServerRequestInterface $request): ?bool
    {
        $routeName = $request->getAttribute('routeName');

        // Only throttle ticket and reply creation endpoints.
        if (! in_array($routeName, ['linkrobins-support-tickets.create', 'linkrobins-support-replies.create'], true)) {
            return null;
        }

        $actor = RequestUtil::getActor($request);

        // Staff and users with core postWithoutThrottle ability bypass anti-flood throttling.
        if ($actor->can('postWithoutThrottle') || $actor->hasPermission('lr-support.handle_tickets')) {
            return false;
        }

        $key = $this->throttleKey($request, $actor);

        if ($this->limiter->tooManyAttempts($key, 1)) {
            return true;
        }

        $this->limiter->hit($key, static::$timeout);

        return null;
    }

    protected function throttleKey(ServerRequestInterface $request, User $actor): string
    {
        $action = $request->getAttribute('routeName') === 'linkrobins-support-tickets.create'
            ? 'ticket'
            : 'reply';

        if (! $actor->isGuest()) {
            return "linkrobins_support.throttle.{$action}.user.{$actor->id}";
        }

        $serverParams = $request->getServerParams();
        $ip = (string) ($request->getAttribute('ipAddress') ?? $serverParams['REMOTE_ADDR'] ?? 'guest');

        return "linkrobins_support.throttle.{$action}.ip." . sha1($ip);
    }
}
