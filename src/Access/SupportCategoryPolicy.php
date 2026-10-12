<?php

namespace LinkRobins\Support\Access;

use Flarum\User\Access\AbstractPolicy;
use Flarum\User\User;
use LinkRobins\Support\SupportCategory;

class SupportCategoryPolicy extends AbstractPolicy
{
    public function view(User $actor, SupportCategory $category): bool
    {
        return true;
    }

    // Per-category creation rights are SupportCategory::canCreate(), checked
    // in SupportTicketResource::creating() and exposed as the category's
    // canCreate attribute; the global createTicket ability gates the endpoint.
    //
    // No per-model edit()/delete() abilities: every category-mutating
    // endpoint (Create/Update/Delete in SupportCategoryResource) gates on
    // the global `manageCategories` ability, so model-scoped checks here
    // were never reached.
}
