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

    (new Extend\SearchDriver(DatabaseSearchDriver::class))
        ->addSearcher(SupportTicket::class, TicketSearcher::class)
        ->addFilter(TicketSearcher::class, Filters\StatusFilter::class)
        ->addFilter(TicketSearcher::class, Filters\CategoryIdFilter::class)
        ->addFilter(TicketSearcher::class, Filters\MineFilter::class)
        ->addSearcher(SupportReply::class, ReplySearcher::class)
        ->addFilter(ReplySearcher::class, Filters\TicketIdFilter::class),

    (new Extend\Notification())
        ->type(NewSupportReplyBlueprint::class,  ['alert', 'email'])
        ->type(NewSupportTicketBlueprint::class, ['alert', 'email']),

    (new Extend\View())
        ->namespace('linkrobins-support', __DIR__ . '/views'),

    (new Extend\ApiResource(\Flarum\Api\Resource\UserResource::class))
        ->fields(fn () => [
            \Flarum\Api\Schema\Boolean::make('supportAppealBanned')
                ->property('support_appeal_banned')
                ->writable(function ($model, \Flarum\Api\Context $context) {
                    return $context->getActor()->isAdmin();
                })
                ->visible(function ($model, \Flarum\Api\Context $context) {
                    $actor = $context->getActor();
                    if ($actor->isGuest()) return false;
                    return $actor->isAdmin() || (int) $actor->id === (int) $model->id;
                }),
        ]),

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
