<?php

/*
 * This file is part of linkrobins/support.
 *
 * For detailed copyright and license information, please view the
 * LICENSE file that was distributed with this source code.
 */

namespace LinkRobins\Support\Tests\unit;

use Carbon\Carbon;
use Flarum\Locale\TranslatorInterface;
use Flarum\Settings\SettingsRepositoryInterface;
use Flarum\User\User;
use Illuminate\Contracts\Cache\Repository as CacheRepository;
use LinkRobins\Support\RateLimiter;
use LinkRobins\Support\SupportCategory;
use LinkRobins\Support\TicketType\TicketTypeInterface;
use LinkRobins\Support\TicketType\TicketTypeManager;
use Mockery as m;
use Mockery\Adapter\Phpunit\MockeryTestCase;
use PHPUnit\Framework\Attributes\Test;

class RateLimiterCacheTest extends MockeryTestCase
{
    private function user(int $id): User
    {
        $user = m::mock(User::class);
        $user->shouldReceive('getAttribute')->andReturnUsing(function (string $key) use ($id) {
            if ($key === 'id') {
                return $id;
            }
            if ($key === 'support_appeal_banned') {
                return false;
            }
            return null;
        });
        $user->shouldReceive('__get')->with('id')->andReturn($id)->byDefault();
        $user->shouldReceive('isGuest')->andReturn(false);

        return $user;
    }

    private function category(bool $isAppeal = false): SupportCategory
    {
        $type = m::mock(TicketTypeInterface::class);
        $type->shouldReceive('checkRateLimit')->andReturn(null);
        $type->shouldReceive('isAppeal')->andReturn($isAppeal);

        $category = m::mock(SupportCategory::class);
        $category->shouldReceive('ticketType')->andReturn($type);

        return $category;
    }

    #[Test]
    public function general_check_uses_cache_remember(): void
    {
        $settings = m::mock(SettingsRepositoryInterface::class);
        $settings->shouldReceive('get')->with('linkrobins-support.general_limit_per_window', 10)->andReturn(5);
        $settings->shouldReceive('get')->with('linkrobins-support.general_window_hours', 24)->andReturn(24);

        $translator = m::mock(TranslatorInterface::class);
        $cache = m::mock(CacheRepository::class);
        $typeManager = m::mock(TicketTypeManager::class);

        // When cache returns 2 (under limit of 5), check should succeed with OK.
        $cache->shouldReceive('remember')
            ->with('linkrobins_support.quota.general.2.24h', RateLimiter::CACHE_TTL, m::type('callable'))
            ->once()
            ->andReturn(2);

        $limiter = new RateLimiter($settings, $translator, $cache, $typeManager);
        $result = $limiter->check($this->user(2), $this->category(isAppeal: false));

        $this->assertTrue($result['ok']);
        $this->assertEquals(RateLimiter::REASON_OK, $result['reason']);
    }

    #[Test]
    public function general_check_fails_when_cached_count_exceeds_limit(): void
    {
        $settings = m::mock(SettingsRepositoryInterface::class);
        $settings->shouldReceive('get')->with('linkrobins-support.general_limit_per_window', 10)->andReturn(5);
        $settings->shouldReceive('get')->with('linkrobins-support.general_window_hours', 24)->andReturn(24);

        $translator = m::mock(TranslatorInterface::class);
        $cache = m::mock(CacheRepository::class);
        $typeManager = m::mock(TicketTypeManager::class);

        // When cache returns 5 (reaches limit), check should fail.
        $cache->shouldReceive('remember')
            ->with('linkrobins_support.quota.general.2.24h', RateLimiter::CACHE_TTL, m::type('callable'))
            ->once()
            ->andReturn(5);

        $limiter = new RateLimiter($settings, $translator, $cache, $typeManager);
        $result = $limiter->check($this->user(2), $this->category(isAppeal: false));

        $this->assertFalse($result['ok']);
        $this->assertEquals(RateLimiter::REASON_GENERAL_QUOTA, $result['reason']);
        $this->assertEquals(5, $result['meta']['count']);
        $this->assertEquals(5, $result['meta']['limit']);
    }

    #[Test]
    public function appeal_check_uses_cache_remember_for_open_and_window_counts(): void
    {
        $settings = m::mock(SettingsRepositoryInterface::class);
        $settings->shouldReceive('get')->with('linkrobins-support.appeal_max_concurrent_open', 1)->andReturn(2);
        $settings->shouldReceive('get')->with('linkrobins-support.appeal_limit_per_window', 3)->andReturn(3);
        $settings->shouldReceive('get')->with('linkrobins-support.appeal_window_days', 30)->andReturn(30);

        $translator = m::mock(TranslatorInterface::class);
        $cache = m::mock(CacheRepository::class);
        $typeManager = m::mock(TicketTypeManager::class);

        $cache->shouldReceive('remember')
            ->with('linkrobins_support.quota.open_appeals.2', RateLimiter::CACHE_TTL, m::type('callable'))
            ->once()
            ->andReturn(1);
        $cache->shouldReceive('remember')
            ->with('linkrobins_support.quota.appeals.2.30d', RateLimiter::CACHE_TTL, m::type('callable'))
            ->once()
            ->andReturn(2);

        $limiter = new RateLimiter($settings, $translator, $cache, $typeManager);
        $result = $limiter->check($this->user(2), $this->category(isAppeal: true));

        $this->assertTrue($result['ok']);
        $this->assertEquals(RateLimiter::REASON_OK, $result['reason']);
    }

    #[Test]
    public function fresh_check_bypasses_cache_remember(): void
    {
        $settings = m::mock(SettingsRepositoryInterface::class);
        $settings->shouldReceive('get')->with('linkrobins-support.general_limit_per_window', 10)->andReturn(2);
        $settings->shouldReceive('get')->with('linkrobins-support.general_window_hours', 24)->andReturn(24);
        $settings->shouldReceive('get')->with('linkrobins-support.appeal_max_concurrent_open', 1)->andReturn(2);
        $settings->shouldReceive('get')->with('linkrobins-support.appeal_limit_per_window', 3)->andReturn(3);
        $settings->shouldReceive('get')->with('linkrobins-support.appeal_window_days', 30)->andReturn(30);

        $translator = m::mock(TranslatorInterface::class);
        $cache = m::mock(CacheRepository::class);
        $cache->shouldNotReceive('remember');
        $typeManager = m::mock(TicketTypeManager::class);

        $limiter = new class($settings, $translator, $cache, $typeManager) extends RateLimiter {
            protected function queryGeneralTicketsForUserSince(User $actor, Carbon $since): int
            {
                return 2;
            }

            protected function queryOpenAppealsForUser(User $actor): int
            {
                return 1;
            }

            protected function queryAppealsForUserSince(User $actor, Carbon $since): int
            {
                return 3;
            }
        };

        $general = $limiter->check($this->user(2), $this->category(isAppeal: false), fresh: true);
        $this->assertFalse($general['ok']);
        $this->assertEquals(RateLimiter::REASON_GENERAL_QUOTA, $general['reason']);
        $this->assertEquals(2, $general['meta']['count']);

        $appeal = $limiter->check($this->user(2), $this->category(isAppeal: true), fresh: true);
        $this->assertFalse($appeal['ok']);
        $this->assertEquals(RateLimiter::REASON_APPEAL_QUOTA, $appeal['reason']);
        $this->assertEquals(3, $appeal['meta']['count']);
    }

    #[Test]
    public function clear_user_quota_cache_forgets_all_user_keys(): void
    {
        $settings = m::mock(SettingsRepositoryInterface::class);
        $settings->shouldReceive('get')->with('linkrobins-support.appeal_window_days', 30)->andReturn(30);
        $settings->shouldReceive('get')->with('linkrobins-support.general_window_hours', 24)->andReturn(24);

        $translator = m::mock(TranslatorInterface::class);
        $cache = m::mock(CacheRepository::class);
        $typeManager = m::mock(TicketTypeManager::class);

        $cache->shouldReceive('forget')->with('linkrobins_support.quota.open_appeals.2')->once();
        $cache->shouldReceive('forget')->with('linkrobins_support.quota.appeals.2.30d')->once();
        $cache->shouldReceive('forget')->with('linkrobins_support.quota.general.2.24h')->once();

        $limiter = new RateLimiter($settings, $translator, $cache, $typeManager);
        $limiter->clearUserQuotaCache(2);
    }
}
