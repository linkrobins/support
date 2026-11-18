<?php

namespace LinkRobins\Support\Throttler;

use Flarum\Http\RequestUtil;
use Flarum\Locale\TranslatorInterface;
use Flarum\Post\Exception\FloodingException;
use Flarum\User\User;
use Illuminate\Cache\RateLimiter;
use Psr\Http\Message\ServerRequestInterface;

/**
 * Anti-flood throttler for support ticket creation.
 *
 * Runs at the HTTP middleware layer via Flarum's Extend\ThrottleApi.
 * Checks whether the actor is still within the cooldown window from a prior
 * successful ticket creation and rejects with HTTP 429 before any controller
 * or database transaction begins. Cooldown hits are recorded only after a
 * ticket creation actually succeeds.
 */
class TicketCreationThrottler
{
    public static int $timeout = 10;

    public function __construct(
        protected RateLimiter $limiter,
        protected TranslatorInterface $translator,
    ) {
    }

    public function __invoke(ServerRequestInterface $request): ?bool
    {
        if ($request->getAttribute('routeName') !== 'linkrobins-support-tickets.create') {
            return null;
        }

        $actor = RequestUtil::getActor($request);

        // Staff and users with core postWithoutThrottle ability bypass anti-flood throttling.
        if ($this->isExempt($actor)) {
            return false;
        }

        $key = $this->throttleKey($request, $actor);

        if ($this->limiter->tooManyAttempts($key, 1)) {
            throw new FloodingException(
                $this->translator->trans('linkrobins-support.api.rate_limit.too_many_requests')
            );
        }

        return null;
    }

    /**
     * Start the cooldown window after a ticket has been successfully created.
     */
    public function recordHit(ServerRequestInterface $request, User $actor): void
    {
        if ($this->isExempt($actor)) {
            return;
        }

        $this->limiter->hit($this->throttleKey($request, $actor), static::$timeout);
    }

    public function isExempt(User $actor): bool
    {
        return $actor->can('postWithoutThrottle') || $actor->hasPermission('lr-support.handle_tickets');
    }

    protected function throttleKey(ServerRequestInterface $request, User $actor): string
    {
        if (! $actor->isGuest()) {
            return "linkrobins_support.throttle.ticket.user.{$actor->id}";
        }

        $serverParams = $request->getServerParams();
        $ip = (string) ($request->getAttribute('ipAddress') ?? $serverParams['REMOTE_ADDR'] ?? 'guest');

        return 'linkrobins_support.throttle.ticket.ip.' . sha1($ip);
    }
}
