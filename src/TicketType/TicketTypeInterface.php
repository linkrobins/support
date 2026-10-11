<?php

namespace LinkRobins\Support\TicketType;

use Flarum\User\User;
use LinkRobins\Support\RateLimiter;
use LinkRobins\Support\SupportCategory;
use LinkRobins\Support\SupportTicket;

interface TicketTypeInterface
{
    /**
     * Unique identifier for this ticket type (e.g. 'standard', 'appeal').
     */
    public function id(): string;

    /**
     * Human-readable label or translation key for the type.
     */
    public function name(): string;


    /**
     * Whether the actor is allowed to create a ticket in this category.
     * Suspended users can typically only create appeal-type tickets.
     */
    public function canCreate(User $actor, SupportCategory $category): bool;

    /**
     * Whether the ticket owner may reopen the ticket after it has been closed.
     */
    public function canReopen(SupportTicket $ticket, User $actor): bool;

    /**
     * Whether the owner of a resolved ticket is offered the "Confirm Solved" prompt.
     */
    public function canConfirmSolved(SupportTicket $ticket, User $actor): bool;

    /**
     * The initial decision value assigned when a new ticket is created, or null.
     */
    public function initialDecision(SupportTicket $ticket): ?string;

    /**
     * Allowed decision values for this ticket type (e.g. ['pending', 'accepted', 'rejected']).
     * An empty array indicates this ticket type does not use decisions.
     *
     * @return list<string>
     */
    public function allowedDecisions(): array;

    /**
     * Whether this ticket type behaves as a ban appeal (subject to appeal rate limits).
     */
    public function isAppeal(): bool;

    /**
     * Check rate limits for ticket creation. Return null to use default rate limiting.
     *
     * @return array{ok: bool, reason?: string, message?: string, meta?: array}|null
     */
    public function checkRateLimit(User $actor, SupportCategory $category, RateLimiter $limiter): ?array;

    /**
     * Hook before ticket is persisted. Validate custom attributes or attach metadata.
     *
     * @param array<string, mixed> $data Raw request data from client
     */
    public function onCreating(SupportTicket $ticket, array $data, User $actor): void;

    /**
     * Hook after ticket and first post are saved to database.
     *
     * @param array<string, mixed> $data Raw request data from client
     */
    public function onCreated(SupportTicket $ticket, array $data, User $actor): void;

    /**
     * Hook when a ticket decision is updated by staff (e.g. accepted, rejected).
     */
    public function onDecided(SupportTicket $ticket, string $newDecision, ?string $oldDecision, ?User $actor): void;

    /**
     * Hook when a ticket status changes (e.g. open -> in_progress, resolved -> closed).
     */
    public function onStatusChanged(SupportTicket $ticket, string $newStatus, ?string $oldStatus, ?User $actor): void;
}
