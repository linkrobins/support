<?php

/*
 * This file is part of linkrobins/support.
 *
 * For detailed copyright and license information, please view the
 * LICENSE file that was distributed with this source code.
 */

namespace LinkRobins\Support\Tests\unit;

use Flarum\User\User;
use LinkRobins\Support\Access\SupportAbilities;
use Mockery as m;
use Mockery\Adapter\Phpunit\MockeryTestCase;
use PHPUnit\Framework\Attributes\Test;

class SupportAbilitiesTest extends MockeryTestCase
{
    /**
     * Build a User test double whose isGuest/isAdmin/hasPermission answers are
     * controlled per-case. We mock only those three interactions -- the whole
     * contract of SupportAbilities -- rather than booting an app.
     *
     * @param  list<string>  $permissions
     */
    private function user(bool $guest, bool $admin = false, array $permissions = []): User
    {
        $user = m::mock(User::class);
        $user->shouldReceive('isGuest')->andReturn($guest);
        $user->shouldReceive('isAdmin')->andReturn($admin);
        $user->shouldReceive('hasPermission')->andReturnUsing(
            fn (string $permission) => in_array($permission, $permissions, true)
        );

        return $user;
    }

    #[Test]
    public function guests_are_never_staff(): void
    {
        $this->assertFalse(SupportAbilities::isStaff($this->user(guest: true)));
    }

    #[Test]
    public function admins_are_staff(): void
    {
        $this->assertTrue(SupportAbilities::isStaff($this->user(guest: false, admin: true)));
    }

    #[Test]
    public function users_holding_handle_tickets_are_staff(): void
    {
        $user = $this->user(guest: false, permissions: [SupportAbilities::HANDLE_TICKETS]);

        $this->assertTrue(SupportAbilities::isStaff($user));
    }

    #[Test]
    public function plain_users_are_not_staff(): void
    {
        $this->assertFalse(SupportAbilities::isStaff($this->user(guest: false)));
    }

    #[Test]
    public function force_delete_needs_admin_or_the_force_delete_permission(): void
    {
        $this->assertTrue(SupportAbilities::canForceDelete($this->user(guest: false, admin: true)));
        $this->assertTrue(SupportAbilities::canForceDelete(
            $this->user(guest: false, permissions: [SupportAbilities::FORCE_DELETE_TICKETS])
        ));

        // handle_tickets (plain staff) is NOT enough to force-delete.
        $this->assertFalse(SupportAbilities::canForceDelete(
            $this->user(guest: false, permissions: [SupportAbilities::HANDLE_TICKETS])
        ));
        $this->assertFalse(SupportAbilities::canForceDelete($this->user(guest: true)));
    }
}
