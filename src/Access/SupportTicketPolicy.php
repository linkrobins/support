<?php

namespace LinkRobins\Support\Access;

use Flarum\User\Access\AbstractPolicy;
use Flarum\User\User;
use LinkRobins\Support\SupportTicket;

/**
 * Per-ticket permissions.
 *
 *   view    -- ticket creator or staff
 *   reply   -- ticket creator or staff (closed tickets reject replies)
 *   update  -- staff only (change status, decision, assignment)
 *   delete  -- admin only (deliberately strict)
 */
class SupportTicketPolicy extends AbstractPolicy
{
    public function view(User $actor, SupportTicket $ticket): bool
    {
        if ($actor->isAdmin()) {
            return true;
        }
        if ($this->isStaff($actor)) {
            return true;
        }
        return $this->isOwner($actor, $ticket);
    }

    public function reply(User $actor, SupportTicket $ticket): bool
    {
        if (! $this->view($actor, $ticket)) {
            return false;
        }
        // Closed tickets reject all replies (including from staff). Reopen
        // first if you really need to add a note.
        if ($ticket->isClosed()) {
            return false;
        }
        return true;
    }

    public function update(User $actor, SupportTicket $ticket): bool
    {
        if ($actor->isAdmin()) {
            return true;
        }
        return $this->isStaff($actor);
    }

    public function delete(User $actor, SupportTicket $ticket): bool
    {
        // Permanent (force-)delete. Admins always may; other staff need the
        // explicit force_delete_tickets permission. Plain soft-delete /
        // restore is handled separately (any staff, via the resource's
        // isDeleted toggle).
        return SupportAbilities::canForceDelete($actor);
    }

    public function postInternalNote(User $actor, SupportTicket $ticket): bool
    {
        if (! $this->reply($actor, $ticket)) {
            return false;
        }
        return $this->isStaff($actor);
    }

    protected function isOwner(User $actor, SupportTicket $ticket): bool
    {
        return ! $actor->isGuest()
            && $ticket->user_id !== null
            && (int) $ticket->user_id === (int) $actor->id;
    }

    protected function isStaff(User $actor): bool
    {
        return SupportAbilities::isStaff($actor);
    }
}
