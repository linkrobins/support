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

    public function edit(User $actor, SupportCategory $category): bool
    {
        return $actor->isAdmin();
    }

    public function delete(User $actor, SupportCategory $category): bool
    {
        return $actor->isAdmin();
    }
}
