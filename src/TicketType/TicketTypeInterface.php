<?php

namespace LinkRobins\Support\TicketType;

use Flarum\User\User;
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
     * Icon class (e.g. 'fas fa-life-ring', 'fas fa-gavel').
     */
    public function icon(): string;

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
}
