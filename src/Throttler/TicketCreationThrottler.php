<?php

namespace LinkRobins\Support\Throttler;

use Flarum\Http\RequestUtil;
use Flarum\User\User;
use Illuminate\Cache\RateLimiter;
use Psr\Http\Message\ServerRequestInterface;

/**
 * Anti-flood throttler for support ticket creation.
 *
 * Runs at the HTTP middleware layer via Flarum's Extend\ThrottleApi.
 * Checks whether an authenticated non-exempt actor is within the cooldown
 * window from a prior successful ticket creation and rejects with HTTP 429
 * before any controller or database transaction begins. Cooldown hits are
 * recorded only after a ticket creation actually succeeds.
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
        if ($request->getAttribute('routeName') !== 'linkrobins-support-tickets.create') {
            return null;
        }

        $actor = RequestUtil::getActor($request);

        // Guests cannot create tickets (GlobalPolicy::createTicket), and exempt
        // actors skip this throttler without disabling unrelated throttlers.
        if ($actor->isGuest() || $this->isExempt($actor)) {
            return null;
        }

        if ($this->limiter->tooManyAttempts($this->throttleKey($actor), 1)) {
            return true;
        }

        return null;
    }

    /**
     * Start the cooldown window after a ticket has been successfully created.
     */
    public function recordHit(User $actor): void
    {
        if ($actor->isGuest() || $this->isExempt($actor)) {
            return;
        }

        $this->limiter->hit($this->throttleKey($actor), static::$timeout);
    }

    public function isExempt(User $actor): bool
    {
        return $actor->can('postWithoutThrottle') || $actor->hasPermission('lr-support.handle_tickets');
    }

    protected function throttleKey(User $actor): string
    {
        return "linkrobins_support.throttle.ticket.user.{$actor->id}";
    }
}
