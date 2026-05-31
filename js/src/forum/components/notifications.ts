import Notification from 'flarum/forum/components/Notification';
import { tr } from '../utils/translate';
import { basePath, BASE_PATH } from '../utils/helpers';

export class NewSupportReplyNotification extends Notification {
  icon() {
    return 'fas fa-life-ring';
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
  icon() {
    const n = this.attrs && this.attrs.notification;
    const data = n && n.content && n.content();
    // Appeals get a distinct gavel glyph instead of the generic ticket icon.
    return data && data.isAppeal ? 'fas fa-gavel' : 'fas fa-ticket-alt';
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
