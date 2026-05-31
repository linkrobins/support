<?php

namespace LinkRobins\Support\Access;

use Flarum\User\Access\AbstractPolicy;
use Flarum\User\User;
use LinkRobins\Support\SupportReply;

/**
 * Per-reply permissions.
 *
 *   update -- staff only (edit content, soft-delete, restore)
 *   delete -- staff only (permanent removal of an already soft-deleted reply)
 *
 * These back the endpoint-level can() gates on SupportReplyResource. The
 * resource's updating()/deleting() hooks keep the same checks as
 * defense-in-depth.
 */
class SupportReplyPolicy extends AbstractPolicy
{
    public function update(User $actor, SupportReply $reply): bool
    {
        return $this->isStaff($actor);
    }

    public function delete(User $actor, SupportReply $reply): bool
    {
        return $this->isStaff($actor);
    }

    protected function isStaff(User $actor): bool
    {
        return SupportAbilities::isStaff($actor);
    }
}
