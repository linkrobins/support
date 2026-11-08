<?php

namespace LinkRobins\Support\Event;

use Flarum\User\User;
use LinkRobins\Support\SupportTicket;

/**
 * A ticket's assignee changed: assigned by a staff member, claimed by a staff
 * member replying to an unassigned ticket, or unassigned ($assignee null).
 */
class TicketAssigned
{
    public readonly ?int $assigneeId;
    public readonly ?int $oldAssigneeId;

    public function __construct(
        public readonly SupportTicket $ticket,
        public readonly ?User $actor,
        public readonly ?User $assignee,
        public readonly ?User $oldAssignee = null,
        ?int $assigneeId = null,
        ?int $oldAssigneeId = null,
    ) {
        $this->assigneeId = $assigneeId ?? ($assignee ? (int) $assignee->id : null);
        $this->oldAssigneeId = $oldAssigneeId ?? ($oldAssignee ? (int) $oldAssignee->id : null);
    }
}
