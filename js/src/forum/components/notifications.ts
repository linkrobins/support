import app from 'flarum/forum/app';
import Notification from 'flarum/forum/components/Notification';
import { override } from 'flarum/common/extend';
import NotificationList from 'flarum/forum/components/NotificationList';
import HeaderListGroup from 'flarum/forum/components/HeaderListGroup';
import NotificationType from 'flarum/forum/components/NotificationType';
import Discussion from 'flarum/common/models/Discussion';
import Link from 'flarum/common/components/Link';
import listItems from 'flarum/common/helpers/listItems';
import extractText from 'flarum/common/utils/extractText';
import { basePath, BASE_PATH } from '../utils/helpers';

const SUPPORT_NOTIFICATION_TYPES = [
  'linkrobinsSupportNewReply',
  'linkrobinsSupportNewTicket',
  'linkrobinsSupportTicketStatusChanged',
  'linkrobinsSupportTicketAssigned',
];

/** Status labels live in one place; the locale calls awaiting_user "awaiting_response". */
function statusLabel(status: string): any {
  switch (status) {
    case 'open':
      return app.translator.trans('linkrobins-support.forum.status.open');
    case 'in_progress':
      return app.translator.trans('linkrobins-support.forum.status.in_progress');
    case 'awaiting_user':
      return app.translator.trans('linkrobins-support.forum.status.awaiting_response');
    case 'resolved':
      return app.translator.trans('linkrobins-support.forum.status.resolved');
    case 'closed':
      return app.translator.trans('linkrobins-support.forum.status.closed');
    default:
      return status;
  }
}

/** Every support notification points at its ticket. */
function ticketHref(notification: any): string {
  const subj = notification ? notification.subject() : null;
  const bp = basePath();
  return subj && subj.id ? bp + BASE_PATH + '/' + subj.id() : bp + BASE_PATH;
}

/** Ticket subject, used as every support notification's excerpt line. */
function ticketExcerpt(notification: any): string {
  const subj = notification ? notification.subject() : null;
  if (subj && subj.attribute) {
    return subj.attribute('subject') || '';
  }
  return '';
}

/**
 * Core's NotificationList groups notifications by discussion, and lumps anything
 * not tied to a discussion (like our support tickets) into one neutral group
 * labelled with the forum title (e.g. "Flarum"). There's no per-type hook, so we
 * reimplement `content` to route support notifications into their own group with
 * a translatable "Support" heading, while leaving all other grouping untouched.
 */
export function installSupportNotificationGrouping() {
  override(NotificationList.prototype, 'content', function (this: any, _orig: any, state: any) {
    if (state.isLoading() || !state.hasItems()) return null;

    return state.getPages().map((page: any) => {
      const groups: any[] = [];
      const byKey: Record<string, any> = {};

      page.items.forEach((notification: any) => {
        const subject = notification.subject();
        if (typeof subject === 'undefined') return;

        const contentType = notification.contentType && notification.contentType();
        const isSupport = SUPPORT_NOTIFICATION_TYPES.indexOf(contentType) !== -1;

        // Mirror core's discussion resolution for non-support notifications.
        let discussion = null;
        if (!isSupport) {
          if (subject instanceof Discussion) discussion = subject;
          else if (subject && subject.discussion) discussion = subject.discussion();
        }

        const key = isSupport ? 'linkrobins-support' : discussion ? 'd' + discussion.id() : 'neutral';

        byKey[key] = byKey[key] || { discussion, support: isSupport, notifications: [] };
        byKey[key].notifications.push(notification);
        if (groups.indexOf(byKey[key]) === -1) groups.push(byKey[key]);
      });

      return groups.map((group) => {
        let label;
        if (group.support) {
          label = app.translator.trans('linkrobins-support.forum.nav');
        } else if (group.discussion) {
          const badges = group.discussion.badges().toArray();
          label = m(Link, { href: app.route.discussion(group.discussion) }, [
            badges && badges.length ? m('ul', { className: 'HeaderListGroup-badges badges' }, listItems(badges)) : null,
            m('span', null, group.discussion.title()),
          ]);
        } else {
          label = app.forum.attribute('title');
        }

        return m(
          HeaderListGroup,
          { label },
          group.notifications.map((notification: any) => m(NotificationType, { notification }))
        );
      });
    });
  });
}

export class NewSupportReplyNotification extends Notification {
  // No Font Awesome glyph for support notifications -- just the sender avatar.
  icon() {
    return '';
  }
  href() {
    const subj = this.attrs && this.attrs.notification ? this.attrs.notification.subject() : null;
    const bp = basePath();
    if (subj && subj.id) {
      return bp + BASE_PATH + '/' + subj.id();
    }
    return bp + BASE_PATH;
  }
  content() {
    const n = this.attrs && this.attrs.notification;
    const from = n && n.fromUser && n.fromUser();
    if (from && from.displayName) {
      return app.translator.trans('linkrobins-support.forum.notifications.reply_from', { name: from.displayName() });
    }
    return app.translator.trans('linkrobins-support.forum.notifications.reply_generic');
  }
  excerpt() {
    const subj = this.attrs && this.attrs.notification ? this.attrs.notification.subject() : null;
    if (subj && subj.attribute) {
      const s = subj.attribute('subject');
      if (s) return s;
    }
    return '';
  }
}

export class NewSupportTicketNotification extends Notification {
  // No Font Awesome glyph for support notifications -- just the sender avatar.
  icon() {
    return '';
  }
  href() {
    const subj = this.attrs && this.attrs.notification ? this.attrs.notification.subject() : null;
    const bp = basePath();
    if (subj && subj.id) {
      return bp + BASE_PATH + '/' + subj.id();
    }
    return bp + BASE_PATH;
  }
  content() {
    const n = this.attrs && this.attrs.notification;
    const data: any = n && n.content && n.content();
    const isAppeal = !!(data && data.isAppeal);
    const from = n && n.fromUser && n.fromUser();
    const who = from && from.displayName ? from.displayName() : extractText(app.translator.trans('linkrobins-support.forum.notifications.someone'));
    return isAppeal
      ? app.translator.trans('linkrobins-support.forum.notifications.new_appeal', { name: who })
      : app.translator.trans('linkrobins-support.forum.notifications.new_ticket', { name: who });
  }
  excerpt() {
    const subj = this.attrs && this.attrs.notification ? this.attrs.notification.subject() : null;
    if (subj && subj.attribute) {
      const s = subj.attribute('subject');
      if (s) return s;
    }
    return '';
  }
}

export class TicketStatusChangedNotification extends Notification {
  icon() {
    return '';
  }
  href() {
    return ticketHref(this.attrs && this.attrs.notification);
  }
  content() {
    const n = this.attrs && this.attrs.notification;
    const data: any = (n && n.content && n.content()) || {};
    const status = statusLabel(data.status || '');
    const from = n && n.fromUser && n.fromUser();
    const me = app.session && app.session.user;
    const subj: any = n && n.subject();

    // A member reopening their own ticket reads as an event by that person;
    // everything else is something that happened to the reader's ticket.
    const ownTicket = !!(subj && subj.user && me && subj.user() && String(subj.user().id()) === String(me.id()));
    if (!ownTicket && from && from.displayName && data.status === 'open') {
      return app.translator.trans('linkrobins-support.forum.notifications.reopened_by_owner', { name: from.displayName() });
    }
    // The owner closing their own ticket from "Did this solve your problem?".
    const fromOwner = !!(subj && subj.user && from && subj.user() && String(subj.user().id()) === String(from.id()));
    if (!ownTicket && fromOwner && data.status === 'closed') {
      return app.translator.trans('linkrobins-support.forum.notifications.confirmed_solved_by_owner', { name: from.displayName() });
    }
    return ownTicket
      ? app.translator.trans('linkrobins-support.forum.notifications.status_changed', { status })
      : app.translator.trans('linkrobins-support.forum.notifications.status_changed_generic', { status });
  }
  excerpt() {
    return ticketExcerpt(this.attrs && this.attrs.notification);
  }
}

export class TicketAssignedNotification extends Notification {
  icon() {
    return '';
  }
  href() {
    return ticketHref(this.attrs && this.attrs.notification);
  }
  content() {
    const n = this.attrs && this.attrs.notification;
    const from = n && n.fromUser && n.fromUser();
    return from && from.displayName
      ? app.translator.trans('linkrobins-support.forum.notifications.assigned', { name: from.displayName() })
      : app.translator.trans('linkrobins-support.forum.notifications.assigned_generic');
  }
  excerpt() {
    return ticketExcerpt(this.attrs && this.attrs.notification);
  }
}

/** The forum's one-off nudge: staff have been waiting on the owner's reply. */
export class AwaitingReminderNotification extends Notification {
  icon() {
    return '';
  }
  href() {
    return ticketHref(this.attrs && this.attrs.notification);
  }
  content() {
    return app.translator.trans('linkrobins-support.forum.notifications.awaiting_reminder');
  }
  excerpt() {
    return ticketExcerpt(this.attrs && this.attrs.notification);
  }
}
