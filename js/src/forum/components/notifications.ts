import Notification from 'flarum/forum/components/Notification';
import { override } from 'flarum/common/extend';
import NotificationList from 'flarum/forum/components/NotificationList';
import HeaderListGroup from 'flarum/forum/components/HeaderListGroup';
import NotificationType from 'flarum/forum/components/NotificationType';
import Discussion from 'flarum/common/models/Discussion';
import Link from 'flarum/common/components/Link';
import listItems from 'flarum/common/helpers/listItems';
import { tr } from '../utils/translate';
import { basePath, BASE_PATH } from '../utils/helpers';

const SUPPORT_NOTIFICATION_TYPES = [
  'linkrobinsSupportNewReply',
  'linkrobinsSupportNewTicket',
  'linkrobinsSupportTicketStatusChanged',
  'linkrobinsSupportTicketAssigned',
];

/** Status labels live in one place; the locale calls awaiting_user "awaiting_response". */
function statusLabel(status: string): string {
  switch (status) {
    case 'open':
      return tr('status.open', 'Open');
    case 'in_progress':
      return tr('status.in_progress', 'In progress');
    case 'awaiting_user':
      return tr('status.awaiting_response', 'Awaiting response');
    case 'resolved':
      return tr('status.resolved', 'Resolved');
    case 'closed':
      return tr('status.closed', 'Closed');
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
          label = tr('nav', 'Support');
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
      return tr('notifications.reply_from', '{name} replied to your ticket', { name: from.displayName() });
    }
    return tr('notifications.reply_generic', 'Support replied to your ticket');
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
    const data = n && n.content && n.content();
    const isAppeal = !!(data && data.isAppeal);
    const from = n && n.fromUser && n.fromUser();
    const who = from && from.displayName ? from.displayName() : tr('notifications.someone', 'A user');
    return isAppeal
      ? tr('notifications.new_appeal', '{name} opened a new appeal', { name: who })
      : tr('notifications.new_ticket', '{name} opened a new support ticket', { name: who });
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
    const data = (n && n.content && n.content()) || {};
    const status = statusLabel(data.status || '');
    const from = n && n.fromUser && n.fromUser();
    const me = app.session && app.session.user;
    const subj = n && n.subject();

    // A member reopening their own ticket reads as an event by that person;
    // everything else is something that happened to the reader's ticket.
    const ownTicket = !!(subj && subj.user && me && subj.user() && String(subj.user().id()) === String(me.id()));
    if (!ownTicket && from && from.displayName && data.status === 'open') {
      return tr('notifications.reopened_by_owner', '{name} reopened their ticket', { name: from.displayName() });
    }
    return ownTicket
      ? tr('notifications.status_changed', 'Your ticket was marked {status}', { status })
      : tr('notifications.status_changed_generic', 'A ticket was marked {status}', { status });
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
      ? tr('notifications.assigned', '{name} assigned a ticket to you', { name: from.displayName() })
      : tr('notifications.assigned_generic', 'A ticket was assigned to you');
  }
  excerpt() {
    return ticketExcerpt(this.attrs && this.attrs.notification);
  }
}
