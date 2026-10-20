import { extend } from 'flarum/common/extend';
import IndexSidebar from 'flarum/forum/components/IndexSidebar';
import UserControls from 'flarum/forum/utils/UserControls';
import LinkButton from 'flarum/common/components/LinkButton';
import Button from 'flarum/common/components/Button';
import Select from 'flarum/common/components/Select';
import FieldSet from 'flarum/common/components/FieldSet';

import SupportCategory from './common/models/SupportCategory';
import SupportTicket from './common/models/SupportTicket';
import SupportReply from './common/models/SupportReply';
import SupportEvent from './common/models/SupportEvent';
import SupportSavedReply from './common/models/SupportSavedReply';

import {
  NewSupportReplyNotification,
  NewSupportTicketNotification,
  TicketAssignedNotification,
  AwaitingReminderNotification,
  TicketStatusChangedNotification,
  installSupportNotificationGrouping,
} from './forum/components/notifications';

import { tr, trText } from './forum/utils/translate';
import { installRealtime } from './forum/utils/live';
import { showNavInSidebar, showNavInAccountMenu, readForumAttribute, showError } from './forum/utils/helpers';
import { canHandleSupportTickets } from './forum/utils/permissions';
import { ticketTypes, TicketTypeRegistry } from './common/ticketTypes';
import type { TicketTypeClientDriver } from './common/ticketTypes';
import { registerTicketGambits } from './forum/query/ticketGambits';
import addSupportSearch from './forum/addSupportSearch';
export { ticketTypes, TicketTypeRegistry };
export type { TicketTypeClientDriver };

app.initializers.add('linkrobins-support', () => {
  (app as any).support = { ticketTypes };
  registerTicketGambits();
  addSupportSearch();

  // Register the store models so app.store.find()/createRecord() return typed,
  // cached, relationship-aware records for our resources.
  app.store.models['linkrobins-support-categories'] = SupportCategory;
  app.store.models['linkrobins-support-tickets'] = SupportTicket;
  app.store.models['linkrobins-support-replies'] = SupportReply;
  app.store.models['linkrobins-support-events'] = SupportEvent;
  app.store.models['linkrobins-support-saved-replies'] = SupportSavedReply;

  // The desk's pages load on demand, as their own chunks: a visitor reading a
  // discussion never opens them, and parsing them on every page costs phones
  // time. extend.php publishes the chunks with ->jsDirectory(); without it
  // they 404 and every support route falls back to the home page.
  app.routes['linkrobins-support.index'] = { path: '/support', component: () => import('./forum/components/SupportIndexPage') };
  app.routes['linkrobins-support.search'] = { path: '/support/search', component: () => import('./forum/components/SupportSearchPage') };
  app.routes['linkrobins-support.compose'] = { path: '/support/new', component: () => import('./forum/components/SupportComposePage') };
  app.routes['linkrobins-support.show'] = { path: '/support/:id', component: () => import('./forum/components/SupportShowPage') };

  if (app.notificationComponents) {
    app.notificationComponents['linkrobinsSupportNewReply'] = NewSupportReplyNotification;
    app.notificationComponents['linkrobinsSupportNewTicket'] = NewSupportTicketNotification;
    app.notificationComponents['linkrobinsSupportTicketStatusChanged'] = TicketStatusChangedNotification;
    app.notificationComponents['linkrobinsSupportTicketAssigned'] = TicketAssignedNotification;
    app.notificationComponents['linkrobinsSupportAwaitingReminder'] = AwaitingReminderNotification;
  }

  // Group support notifications under a translatable "Support" heading in the
  // notifications dropdown, instead of the generic forum-title group.
  installSupportNotificationGrouping();

  // Live replies and ticket updates, when flarum/realtime is enabled.
  installRealtime();

  // NotificationGrid lives in a lazily-loaded chunk, so it isn't in the
  // registry at init time -- a direct import resolves to undefined. Use the
  // string-path form of extend(), which defers resolution until the module
  // actually loads.
  extend('flarum/forum/components/NotificationGrid' as any, 'notificationTypes', (items: any) => {
    items.add('linkrobinsSupportNewReply', {
      name: 'linkrobinsSupportNewReply',
      icon: 'fas fa-life-ring',
      label: tr('settings.notify_new_reply_label', 'Someone replies to your support ticket'),
    });
    items.add('linkrobinsSupportNewTicket', {
      name: 'linkrobinsSupportNewTicket',
      icon: 'fas fa-ticket-alt',
      label: tr('settings.notify_new_ticket_label', 'A new support ticket is opened'),
    });
    items.add('linkrobinsSupportTicketStatusChanged', {
      name: 'linkrobinsSupportTicketStatusChanged',
      icon: 'fas fa-exchange-alt',
      label: tr('settings.notify_status_changed_label', "A support ticket's status changes"),
    });
    items.add('linkrobinsSupportTicketAssigned', {
      name: 'linkrobinsSupportTicketAssigned',
      icon: 'fas fa-user-check',
      label: tr('settings.notify_assigned_label', 'A support ticket is assigned to you'),
    });
    items.add('linkrobinsSupportAwaitingReminder', {
      name: 'linkrobinsSupportAwaitingReminder',
      icon: 'fas fa-hourglass-half',
      label: tr('settings.notify_awaiting_reminder_label', 'Support has been waiting a few days for my reply'),
    });
  });

  // Staff default landing view preference in the user account SettingsPage.
  // Deferred extend using string path to avoid pulling the SettingsPage chunk eagerly.
  extend('flarum/forum/components/SettingsPage' as any, 'settingsItems', function (this: any, items: any) {
    if (!canHandleSupportTickets()) return;

    const current = this.user?.preferences()?.linkrobinsSupportStaffDefaultView || 'is:open';

    const options: Record<string, string> = {
      'is:open': trText('status.open', 'Open'),
      'assigned:me -is:closed': trText('index.filter_assigned_to_me', 'Assigned to me'),
      'is:unassigned -is:closed': trText('index.filter_unassigned', 'Unassigned'),
      'is:mine': trText('index.my_tickets', 'My tickets'),
    };

    items.add(
      'linkrobinsSupport',
      m(
        FieldSet,
        {
          className: 'Settings-linkrobinsSupport FieldSet--min FieldSet--col',
          label: tr('settings.heading', 'Support Desk'),
        },
        m('div', { className: 'Form-group' }, [
          m('label', null, tr('settings.staff_default_view_label', 'Default support desk view')),
          m(Select, {
            options,
            value: current,
            onchange: (val: string) => {
              this.staffDefaultViewLoading = true;
              this.user.savePreferences({ linkrobinsSupportStaffDefaultView: val }).then(() => {
                this.staffDefaultViewLoading = false;
                m.redraw();
              });
            },
            disabled: this.staffDefaultViewLoading,
          }),
          m(
            'p',
            { className: 'helpText' },
            tr(
              'settings.staff_default_view_help',
              'Choose which queue or view opens by default when you navigate to the support desk without an active filter.'
            )
          ),
        ])
      ),
      50
    );
  });

  // Appeal-ban toggle in the user's moderation-controls dropdown (the same menu
  // as Suspend). Shown only to users with the manage_appeal_bans permission.
  // UserControls is a plain object (not a component class), so we extend the
  // object itself -- extending `.prototype` would silently no-op.
  extend(UserControls, 'moderationControls', (items: any, user: any) => {
    if (!readForumAttribute('canManageSupportAppealBans')) return;
    if (!user || typeof user.attribute !== 'function') return;
    const banned = !!user.attribute('supportAppealBanned');
    items.add(
      'linkrobinsSupportAppealBan',
      m(
        Button,
        {
          icon: banned ? 'fas fa-unlock' : 'fas fa-ban',
          onclick: () => {
            user
              .save({ supportAppealBanned: !banned })
              .then(() => {
                m.redraw();
              })
              .catch(() => {
                showError(tr('user_controls.toggle_failed', 'Could not update the appeal-ban status.'));
              });
          },
        },
        banned ? tr('user_controls.allow_appeals', 'Allow support appeals') : tr('user_controls.disallow_appeals', 'Disallow support appeals')
      )
    );
  });

  const supportLink = () => m(LinkButton, { href: app.route('linkrobins-support.index'), icon: 'fas fa-life-ring' }, tr('nav', 'Support'));

  // Support link in the forum's sidebar nav. Priority -11 slots it directly
  // below flarum/tags' "Tags" link (-10) and above its separator (-12) and tag
  // list (-14), so it doesn't sit oddly between "All Discussions" and the tags
  // block. Without the tags extension it simply lands under the remaining nav
  // links.
  extend(IndexSidebar.prototype, 'navItems', (items: any) => {
    if (!app.session || !app.session.user || !showNavInSidebar()) return;
    items.add('linkrobins-support', supportLink(), -11);
  });

  // And in the account menu, under Settings (50) and above Administration (0),
  // with the other entries that are about you rather than about the forum.
  // String-path extend for the same reason as NotificationGrid above: it
  // defers resolution until the module is actually loaded.
  extend('flarum/forum/components/SessionDropdown' as any, 'items', (items: any) => {
    if (!app.session || !app.session.user || !showNavInAccountMenu()) return;
    items.add('linkrobins-support', supportLink(), 40);
  });

  // Support stats for staff, in the account menu beside the Support link,
  // opening a modal the way LR Birdseye's Analytics item does.
  extend('flarum/forum/components/SessionDropdown' as any, 'items', (items: any) => {
    if (!app.session || !app.session.user || !readForumAttribute('canHandleSupportTickets')) return;
    items.add(
      'linkrobins-support-stats',
      m(
        Button,
        { icon: 'fas fa-chart-bar', onclick: () => app.modal.show(() => import('./forum/components/SupportStatsModal')) },
        tr('stats.title', 'Support stats')
      ),
      39
    );
  });
});
