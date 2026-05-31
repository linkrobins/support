import { readForumAttribute } from './helpers';

function isAdmin(): boolean {
  try {
    const u = app.session && app.session.user;
    return !!(u && typeof u.isAdmin === 'function' && u.isAdmin());
  } catch (e) {
    return false;
  }
}

export function canCreateSupportTicket(): boolean {
  try {
    if (!app.session || !app.session.user) return false;
    if (isAdmin()) return true;
    return !!readForumAttribute('canCreateSupportTicket');
  } catch (e) {
    return false;
  }
}

export function canHandleSupportTickets(): boolean {
  try {
    if (!app.session || !app.session.user) return false;
    if (isAdmin()) return true;
    return !!readForumAttribute('canHandleSupportTickets');
  } catch (e) {
    return false;
  }
}

export function supportAppealBanned(): boolean {
  try {
    return !!readForumAttribute('supportAppealBanned');
  } catch (e) {
    return false;
  }
}

export function isUserSuspended(): boolean {
  try {
    return !!readForumAttribute('supportSuspended');
  } catch (e) {
    return false;
  }
}
