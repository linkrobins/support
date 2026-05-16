<?php

use Flarum\Extend;
use Flarum\Search\Database\DatabaseSearchDriver;
use Flarum\User\User;
use LinkRobins\Support\Access;
use LinkRobins\Support\Api\Resource\SupportCategoryResource;
use LinkRobins\Support\Api\Resource\SupportReplyResource;
use LinkRobins\Support\Api\Resource\SupportTicketResource;
use LinkRobins\Support\Notification\NewSupportReplyBlueprint;
use LinkRobins\Support\Notification\NewSupportTicketBlueprint;
use LinkRobins\Support\Search\Filter as Filters;
use LinkRobins\Support\Search\ReplySearcher;
use LinkRobins\Support\Search\TicketSearcher;
use LinkRobins\Support\SupportCategory;
use LinkRobins\Support\SupportReply;
use LinkRobins\Support\SupportServiceProvider;
use LinkRobins\Support\SupportTicket;

return [
    (new Extend\Frontend('forum'))
        ->js(__DIR__ . '/js/forum.js')
        ->css(__DIR__ . '/less/forum.less')
        ->route('/support',                       'linkrobins-support.index')
        ->route('/support/new',                   'linkrobins-support.compose')
        ->route('/support/status/{status}',       'linkrobins-support.filtered')
        ->route('/support/{id}',                  'linkrobins-support.show'),

    (new Extend\Frontend('admin'))
        ->js(__DIR__ . '/js/admin.js')
        ->css(__DIR__ . '/less/admin.less'),

    new Extend\Locales(__DIR__ . '/locale'),

    (new Extend\ApiResource(SupportCategoryResource::class)),
    (new Extend\ApiResource(SupportTicketResource::class)),
    (new Extend\ApiResource(SupportReplyResource::class)),

    (new Extend\Policy())
        ->modelPolicy(SupportTicket::class,   Access\SupportTicketPolicy::class)
        ->modelPolicy(SupportCategory::class, Access\SupportCategoryPolicy::class)
        ->globalPolicy(Access\GlobalPolicy::class),

    (new Extend\ServiceProvider())
        ->register(SupportServiceProvider::class),

    // Register searchers + filters so Flarum's API Index endpoints
    // accept `filter[status]=open`, `filter[mine]=1`, and friends.
    // Flarum 2 enforces a strict allowlist on top-level query
    // parameters and routes filter-shaped params through this
    // infrastructure -- there is no shorter path.
    (new Extend\SearchDriver(DatabaseSearchDriver::class))
        ->addSearcher(SupportTicket::class, TicketSearcher::class)
        ->addFilter(TicketSearcher::class, Filters\StatusFilter::class)
        ->addFilter(TicketSearcher::class, Filters\CategoryIdFilter::class)
        ->addFilter(TicketSearcher::class, Filters\MineFilter::class)
        ->addSearcher(SupportReply::class, ReplySearcher::class)
        ->addFilter(ReplySearcher::class, Filters\TicketIdFilter::class),

    // Notifications. Both blueprints opt into alert + email by default
    // so users get notified without needing to flip a switch. Each
    // recipient can still toggle them off in their notification prefs.
    (new Extend\Notification())
        ->type(NewSupportReplyBlueprint::class,  ['alert', 'email'])
        ->type(NewSupportTicketBlueprint::class, ['alert', 'email']),

    // Make the email view templates discoverable under the
    // `linkrobins-support::` namespace so the Mailable interface's
    // `getEmailViews()` resolves correctly.
    (new Extend\View())
        ->namespace('linkrobins-support', __DIR__ . '/views'),

    // Expose support_appeal_banned on the User resource so the admin UI
    // can read and toggle it. Writable only by admins -- this is a
    // moderation action, not a self-service preference.
    (new Extend\ApiResource(\Flarum\Api\Resource\UserResource::class))
        ->fields(fn () => [
            \Flarum\Api\Schema\Boolean::make('supportAppealBanned')
                ->property('support_appeal_banned')
                ->writable(function ($model, \Flarum\Api\Context $context) {
                    return $context->getActor()->isAdmin();
                })
                ->visible(function ($model, \Flarum\Api\Context $context) {
                    // Only the user themselves or an admin can see this
                    // field. Other users have no business knowing whether
                    // someone else is appeal-banned.
                    $actor = $context->getActor();
                    if ($actor->isGuest()) return false;
                    return $actor->isAdmin() || (int) $actor->id === (int) $model->id;
                }),
        ]),

    // Forum-payload flags so the frontend knows what to render without
    // probing the policy itself. All wrapped in try/catch so a broken
    // policy can't 500 the entire forum payload.
    (new Extend\ApiResource(\Flarum\Api\Resource\ForumResource::class))
        ->fields(fn () => [
            \Flarum\Api\Schema\Boolean::make('canCreateSupportTicket')
                ->get(function ($model, \Flarum\Api\Context $context) {
                    $actor = $context->getActor();
                    if ($actor->isGuest()) {
                        return false;
                    }
                    try {
                        return $actor->can('createTicket');
                    } catch (\Throwable $e) {
                        error_log('[linkrobins/support] canCreateSupportTicket probe failed: ' . $e->getMessage());
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
                        error_log('[linkrobins/support] canHandleSupportTickets probe failed: ' . $e->getMessage());
                        return false;
                    }
                }),

            // Expose the per-user appeal-ban flag so the frontend can hide
            // the "file an appeal" affordance and explain why.
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

            // Expose whether the actor is currently suspended (via the
            // flarum/suspend extension). The frontend uses this to show
            // only appeal categories on the compose page, since suspended
            // users can't file general tickets.
            //
            // Naming caveat: we intentionally don't call this "isBanned"
            // because Flarum doesn't have a built-in concept of banning.
            // "Suspended" is what the column actually represents.
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

    // Default rate-limit settings; admins can override from the extension
    // settings page (next session).
    (new Extend\Settings())
        ->default('linkrobins-support.appeal_limit_per_window',    '3')
        ->default('linkrobins-support.appeal_window_days',         '30')
        ->default('linkrobins-support.appeal_max_concurrent_open', '1')
        ->default('linkrobins-support.general_limit_per_window',   '10')
        ->default('linkrobins-support.general_window_hours',       '24')
        ->serializeToForum('linkrobinsSupportAppealLimitPerWindow',    'linkrobins-support.appeal_limit_per_window')
        ->serializeToForum('linkrobinsSupportAppealWindowDays',        'linkrobins-support.appeal_window_days')
        ->serializeToForum('linkrobinsSupportAppealMaxConcurrentOpen', 'linkrobins-support.appeal_max_concurrent_open')
        ->serializeToForum('linkrobinsSupportGeneralLimitPerWindow',   'linkrobins-support.general_limit_per_window')
        ->serializeToForum('linkrobinsSupportGeneralWindowHours',      'linkrobins-support.general_window_hours'),
];
