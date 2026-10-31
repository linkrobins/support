import Link from 'flarum/common/components/Link';
import type User from 'flarum/common/models/User';
import { trText } from './translate';

export const BASE_PATH = '/support';

export function readForumAttribute(key: string): any {
  try {
    if (app.forum && typeof app.forum.attribute === 'function') {
      return app.forum.attribute(key);
    }
  } catch (e) {}
  return null;
}

/**
 * Where the Support link may appear, and whether the forum's own navigation is
 * shown on support pages. All three are admin switches.
 *
 * The two link switches default ON when the setting has never been stored,
 * matching the server side: only an absent value means "not set", while '' and
 * '0' both mean off.
 */
export function showNavInSidebar(): boolean {
  const value = readForumAttribute('linkrobinsSupportNavInSidebar');
  return value === undefined || value === null ? true : !!value;
}

export function showNavInAccountMenu(): boolean {
  const value = readForumAttribute('linkrobinsSupportNavInAccountMenu');
  return value === undefined || value === null ? true : !!value;
}

export function showForumNavOnSupportPages(): boolean {
  return !!readForumAttribute('linkrobinsSupportForumNavOnSupportPages');
}

export function isGuest(): boolean {
  return !app.session || !app.session.user;
}

export function basePath(): string {
  try {
    return (app.forum && app.forum.attribute && app.forum.attribute('basePath')) || '';
  } catch (e) {
    return '';
  }
}

export function suppressTagsList(): void {
  try {
    if (app.current && typeof app.current.set === 'function') {
      app.current.set('noTagsList', true);
    }
  } catch (e) {}
}

export function formatDate(value: Date | string | null | undefined): string {
  if (!value) return '';
  try {
    const d = value instanceof Date ? value : new Date(value);
    if (isNaN(d.getTime())) return '';
    // Format date and time separately and join with "at" rather than
    // toLocaleString's single comma-glued string, which reads as an awkward
    // double-comma run when embedded in a sentence.
    const datePart = d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    const timePart = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    return trText('common.date_at_time', '{date} at {time}', { date: datePart, time: timePart });
  } catch (e) {
    return '';
  }
}

export function safeNavigate(href: string, ev?: any): void {
  if (ev && (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.button === 1)) return;
  if (typeof href !== 'string' || href === '') return;
  const base = basePath();
  let path = href;
  if (base && href.indexOf(base) === 0) path = href.slice(base.length);
  if (path.charAt(0) !== '/') return;
  if (ev) ev.preventDefault();
  try {
    m.route.set(path);
  } catch (e) {}
}

export function showError(message: any): void {
  try {
    if (app && app.alerts && typeof app.alerts.show === 'function') {
      app.alerts.show({ type: 'error' }, message);
      return;
    }
  } catch (e) {}
  // Fallback when the alert system isn't available. Must NOT call showError
  // again (that recurses infinitely and overflows the stack); log instead.
  try {
    console.error('[linkrobins/support] ' + message);
  } catch (e) {}
}

/**
 * Render a username as a link to the user's profile. Accepts a store User
 * model; falls back to plain text if there's no username.
 */
export function userLink(user: User | null | undefined): any {
  if (!user) return '';
  const username = user.username && user.username();
  const label = (user.displayName && user.displayName()) || username || '';
  if (!username) return label;
  const href = basePath() + '/u/' + encodeURIComponent(username);
  return Link.component({ href }, label);
}

/**
 * Put a support page on core's history, so the phone header shows its back
 * control (core shows "back" only when app.history can go back, and a page
 * puts itself there with app.history.push()).
 *
 * Core starts every page load with one entry, the forum home. So when a
 * support page is the first one loaded, the support front page goes on first
 * and back lands on /support instead of leaving the support desk. When the
 * visitor came from another page, back goes there. The front page itself
 * pushes nothing in the first case, so a direct load of /support has no back.
 */
export function pushSupportHistory(name: string, title: string): void {
  try {
    const history = app.history;
    if (!history) return;
    const front = 'linkrobins-support.index';
    if (!history.canGoBack()) {
      if (name === front) return;
      history.push(front, trText('nav', 'Support'), app.route(front));
    }
    history.push(name, title, m.route.get());
  } catch (e) {
    // A back button is never worth a broken page.
  }
}
