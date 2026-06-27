import { extend } from 'flarum/common/extend';
import IndexSidebar from 'flarum/forum/components/IndexSidebar';
import UserControls from 'flarum/forum/utils/UserControls';
import LinkButton from 'flarum/common/components/LinkButton';
import Button from 'flarum/common/components/Button';

import SupportCategory from './common/models/SupportCategory';
import SupportTicket from './common/models/SupportTicket';
import SupportReply from './common/models/SupportReply';

import SupportIndexPage from './forum/components/SupportIndexPage';
import SupportComposePage from './forum/components/SupportComposePage';
import SupportShowPage from './forum/components/SupportShowPage';
import { NewSupportReplyNotification, NewSupportTicketNotification, installSupportNotificationGrouping } from './forum/components/notifications';

import { tr } from './forum/utils/translate';
import { basePath, BASE_PATH, readForumAttribute, showError } from './forum/utils/helpers';

app.initializers.add('linkrobins-support', () => {
  // Register the store models so app.store.find()/createRecord() return typed,
  // cached, relationship-aware records for our resources.
  app.store.models['linkrobins-support-categories'] = SupportCategory;
  app.store.models['linkrobins-support-tickets'] = SupportTicket;
  app.store.models['linkrobins-support-replies'] = SupportReply;

  app.routes['linkrobins-support.index'] = { path: BASE_PATH, component: SupportIndexPage };
  app.routes['linkrobins-support.compose'] = { path: BASE_PATH + '/new', component: SupportComposePage };
  app.routes['linkrobins-support.filtered'] = { path: BASE_PATH + '/status/:status', component: SupportIndexPage };
  app.routes['linkrobins-support.show'] = { path: BASE_PATH + '/:id', component: SupportShowPage };

  if (app.notificationComponents) {
    app.notificationComponents['linkrobinsSupportNewReply'] = NewSupportReplyNotification;
    app.notificationComponents['linkrobinsSupportNewTicket'] = NewSupportTicketNotification;
  }

  // Group support notifications under a translatable "Support" heading in the
  // notifications dropdown, instead of the generic forum-title group.
  installSupportNotificationGrouping();

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

  // Global "Support" link in the index sidebar nav (shown on every page).
  extend(IndexSidebar.prototype, 'navItems', (items: any) => {
    if (!app.session || !app.session.user) return;
    items.add('linkrobins-support', m(LinkButton, { href: basePath() + BASE_PATH, icon: 'fas fa-life-ring' }, tr('nav', 'Support')), 30);
  });
});
