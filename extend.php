<?php

use Flarum\Extend;
use Flarum\Search\Database\DatabaseSearchDriver;
use Flarum\User\Search\UserSearcher;
use Flarum\User\User;
use LinkRobins\Support\Access;
use LinkRobins\Support\Api\Resource\SupportCategoryResource;
use LinkRobins\Support\Api\Resource\SupportReplyResource;
use LinkRobins\Support\Api\Resource\SupportTicketResource;
use LinkRobins\Support\Notification\NewSupportReplyBlueprint;
use LinkRobins\Support\Notification\NewSupportTicketBlueprint;
use LinkRobins\Support\Notification\TicketAssignedBlueprint;
use LinkRobins\Support\Notification\TicketStatusChangedBlueprint;
use LinkRobins\Support\Search\Filter as Filters;
use LinkRobins\Support\Search\ReplySearcher;
use LinkRobins\Support\Search\TicketSearcher;
use LinkRobins\Support\SupportCategory;
use LinkRobins\Support\SupportReply;
use LinkRobins\Support\SupportServiceProvider;
use LinkRobins\Support\SupportTicket;

return [
    (new Extend\Frontend('forum'))
        ->js(__DIR__ . '/js/dist/forum.js')
        ->css(__DIR__ . '/less/forum.less')
        ->route('/support',                       'linkrobins-support.index')
        ->route('/support/new',                   'linkrobins-support.compose')
        ->route('/support/status/{status}',       'linkrobins-support.filtered')
        ->route('/support/{id}',                  'linkrobins-support.show'),

    (new Extend\Frontend('admin'))
        ->js(__DIR__ . '/js/dist/admin.js')
        ->css(__DIR__ . '/less/admin.less'),

    new Extend\Locales(__DIR__ . '/locale'),

    (new Extend\ApiResource(SupportCategoryResource::class)),
    (new Extend\ApiResource(SupportTicketResource::class)),
    (new Extend\ApiResource(SupportReplyResource::class)),

    (new Extend\Policy())
        ->modelPolicy(SupportTicket::class,   Access\SupportTicketPolicy::class)
        ->modelPolicy(SupportReply::class,    Access\SupportReplyPolicy::class)
        ->modelPolicy(SupportCategory::class, Access\SupportCategoryPolicy::class)
        ->globalPolicy(Access\GlobalPolicy::class),

    (new Extend\ServiceProvider())
        ->register(SupportServiceProvider::class),

    (new Extend\SearchDriver(DatabaseSearchDriver::class))
        ->addSearcher(SupportTicket::class, TicketSearcher::class)
        ->addFilter(TicketSearcher::class, Filters\StatusFilter::class)
        ->addFilter(TicketSearcher::class, Filters\CategoryIdFilter::class)
        ->addFilter(TicketSearcher::class, Filters\MineFilter::class)
        ->addSearcher(SupportReply::class, ReplySearcher::class)
        ->addFilter(ReplySearcher::class, Filters\TicketIdFilter::class)
        // Enables filter[supportAppealBanned]=1 on the core user list (powers
        // the read-only admin appeal-bans list). Without this the filter was
        // ignored and every user was returned.
        ->addFilter(UserSearcher::class, Filters\AppealBannedFilter::class)
        // Enables filter[supportStaff]=1 on the same list, which is how the
        // admin category editor populates its default-assignee picker.
        ->addFilter(UserSearcher::class, Filters\StaffFilter::class),

    (new Extend\Notification())
        ->type(NewSupportReplyBlueprint::class,  ['alert', 'email'])
        ->type(NewSupportTicketBlueprint::class, ['alert', 'email'])
        // Status changes alert by default but do not email: a ticket can move
        // through several statuses in a day, and an inbox copy of each one is
        // the kind of noise that makes people mute support mail altogether.
        // Anyone who wants the emails can switch them on per-type in their
        // own notification settings.
        ->type(TicketStatusChangedBlueprint::class, ['alert'])
        ->type(TicketAssignedBlueprint::class, ['alert', 'email']),

    (new Extend\View())
        ->namespace('linkrobins-support', __DIR__ . '/views'),

    (new Extend\ApiResource(\Flarum\Api\Resource\UserResource::class))
        ->fields(fn () => [
            \Flarum\Api\Schema\Boolean::make('supportAppealBanned')
                ->property('support_appeal_banned')
                ->writable(function ($model, \Flarum\Api\Context $context) {
                    // Moderators with the permission (and admins, who have all
                    // permissions) can toggle a user's appeal-ban from the
                    // user's profile controls.
                    return $context->getActor()->hasPermission('linkrobins-support.manage_appeal_bans');
                })
                ->visible(function ($model, \Flarum\Api\Context $context) {
                    $actor = $context->getActor();
                    if ($actor->isGuest()) return false;
                    return $actor->hasPermission('linkrobins-support.manage_appeal_bans')
                        || (int) $actor->id === (int) $model->id;
                }),
        ]),

    (new Extend\ApiResource(\Flarum\Api\Resource\ForumResource::class))
        ->fields(fn () => [
            // Whether the current user may toggle appeal-bans (shown as a
            // control in the user's profile dropdown). Admins always pass.
            \Flarum\Api\Schema\Boolean::make('canManageSupportAppealBans')
                ->get(fn ($model, \Flarum\Api\Context $context) =>
                    ! $context->getActor()->isGuest()
                    && $context->getActor()->hasPermission('linkrobins-support.manage_appeal_bans')),

            \Flarum\Api\Schema\Boolean::make('canCreateSupportTicket')
                ->get(function ($model, \Flarum\Api\Context $context) {
                    $actor = $context->getActor();
                    if ($actor->isGuest()) {
                        return false;
                    }
                    // A policy can() shouldn't throw under normal operation;
                    // if it somehow does, degrade to false rather than 500 the
                    // forum boot payload (this field ships on every forum
                    // response). Mirrors the supportAppealBanned/supportSuspended
                    // probes below -- no logger resolve() in the field closure.
                    try {
                        return $actor->can('createTicket');
                    } catch (\Throwable $e) {
                        return false;
                    }
                }),

            \Flarum\Api\Schema\Boolean::make('canHandleSupportTickets')
                ->get(function ($model, \Flarum\Api\Context $context) {
                    $actor = $context->getActor();
                    if ($actor->isGuest()) {
                        return false;
                    }
                    try {
                        return $actor->can('handleTickets');
                    } catch (\Throwable $e) {
                        return false;
                    }
                }),

            \Flarum\Api\Schema\Boolean::make('supportAppealBanned')
                ->get(function ($model, \Flarum\Api\Context $context) {
                    $actor = $context->getActor();
                    if ($actor->isGuest()) {
                        return false;
                    }
                    try {
                        return (bool) $actor->getAttribute('support_appeal_banned');
                    } catch (\Throwable $e) {
                        return false;
                    }
                }),

            \Flarum\Api\Schema\Boolean::make('supportSuspended')
                ->get(function ($model, \Flarum\Api\Context $context) {
                    $actor = $context->getActor();
                    if ($actor->isGuest()) {
                        return false;
                    }
                    try {
                        return \LinkRobins\Support\UserState::isSuspended($actor);
                    } catch (\Throwable $e) {
                        return false;
                    }
                }),
        ]),

    // Navigation switches. Two of these default ON, which is the case the
    // Serializing listener below exists for: a `false` arrives as '' and an
    // empty stored value would otherwise fall back to the default, so the
    // checkbox would spring back on while the forum treated it as off.
    (new Extend\Event())
        ->listen(\Flarum\Settings\Event\Serializing::class, function (\Flarum\Settings\Event\Serializing $event) {
            if (in_array($event->key, [
                'linkrobins-support.nav_in_sidebar',
                'linkrobins-support.nav_in_account_menu',
                'linkrobins-support.forum_nav_on_support_pages',
            ], true)) {
                $event->value = $event->value === '' || $event->value === '0' ? '0' : '1';
            }
        }),

    (new Extend\Settings())
        ->default('linkrobins-support.nav_in_sidebar',             '1')
        ->default('linkrobins-support.nav_in_account_menu',        '1')
        ->default('linkrobins-support.forum_nav_on_support_pages', '0')
        // Only an absent value means "never set", so it takes the default.
        // Anything stored is read for what it is: '' and '0' are both off.
        ->serializeToForum('linkrobinsSupportNavInSidebar', 'linkrobins-support.nav_in_sidebar', fn ($value) => $value === null ? true : (bool) $value)
        ->serializeToForum('linkrobinsSupportNavInAccountMenu', 'linkrobins-support.nav_in_account_menu', fn ($value) => $value === null ? true : (bool) $value)
        ->serializeToForum('linkrobinsSupportForumNavOnSupportPages', 'linkrobins-support.forum_nav_on_support_pages', fn ($value) => (bool) $value)
        ->default('linkrobins-support.appeal_limit_per_window',    '3')
        ->default('linkrobins-support.appeal_window_days',         '30')
        ->default('linkrobins-support.appeal_max_concurrent_open', '1')
        ->default('linkrobins-support.general_limit_per_window',   '10')
        ->default('linkrobins-support.general_window_hours',       '24'),
        // Note: these settings are consumed server-side by RateLimiter; they
        // are intentionally NOT serialized to the forum frontend (the JS never
        // reads them).
];
