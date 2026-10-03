import { tr } from './translate';
import { basePath, BASE_PATH } from './helpers';

/**
 * Resolve a status label at RENDER time. Building this as a static map at
 * module-load froze the labels to their English fallbacks, because the
 * translator hasn't loaded the active locale yet when this module evaluates.
 */
export function statusLabel(status: string): string {
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

const STATUS_CLASSES: Record<string, string> = {
  open: 'is-open',
  in_progress: 'is-progress',
  awaiting_user: 'is-awaiting',
  resolved: 'is-resolved',
  closed: 'is-closed',
};

export function statusClass(status: string): string {
  return STATUS_CLASSES[status] || '';
}

export function statusBadge(status: string): any {
  const label = statusLabel(status);
  const cls = STATUS_CLASSES[status] || '';
  return m('span', { className: 'LinkRobinsSupport-status ' + cls }, label);
}

/**
 * Translate an appeal decision (pending/accepted/rejected) at render time.
 * Falls back to the raw value for any unknown decision string.
 */
export function decisionLabel(decision: string): string {
  switch (decision) {
    case 'pending':
      return tr('decision.pending', 'Pending');
    case 'accepted':
      return tr('decision.accepted', 'Accepted');
    case 'rejected':
      return tr('decision.rejected', 'Rejected');
    default:
      return decision;
  }
}

export interface FilterOption {
  id: string;
  labelKey: string;
  fallback: string;
  icon: string;
  staffOnly: boolean;
}

// Label keys + fallbacks only -- resolved to text at render time via
// filterLabel(), NOT at module load (see statusLabel above for why).
export const FILTER_OPTIONS: FilterOption[] = [
  { id: 'mine', labelKey: 'index.my_tickets', fallback: 'My tickets', icon: 'fas fa-user', staffOnly: false },
  { id: 'assigned_to_me', labelKey: 'index.filter_assigned_to_me', fallback: 'Assigned to me', icon: 'fas fa-user-check', staffOnly: true },
  { id: 'unassigned', labelKey: 'index.filter_unassigned', fallback: 'Unassigned', icon: 'fas fa-user-slash', staffOnly: true },
  { id: 'all', labelKey: 'index.filter_all', fallback: 'All', icon: 'fas fa-inbox', staffOnly: true },
  { id: 'open', labelKey: 'status.open', fallback: 'Open', icon: 'fas fa-circle', staffOnly: true },
  { id: 'in_progress', labelKey: 'status.in_progress', fallback: 'In progress', icon: 'fas fa-spinner', staffOnly: true },
  { id: 'awaiting_user', labelKey: 'status.awaiting_response', fallback: 'Awaiting response', icon: 'fas fa-clock', staffOnly: true },
  { id: 'resolved', labelKey: 'status.resolved', fallback: 'Resolved', icon: 'fas fa-check-circle', staffOnly: true },
  { id: 'closed', labelKey: 'status.closed', fallback: 'Closed', icon: 'fas fa-times-circle', staffOnly: true },
];

export function filterLabel(opt: FilterOption): string {
  return tr(opt.labelKey, opt.fallback);
}

export function filterHrefFor(id: string): string {
  return basePath() + BASE_PATH + '/status/' + id;
}

/**
 * What an empty list says, per filter. A status list says there are no tickets
 * with that status; only the viewer's own empty list invites them to open one.
 * Resolved at render time like every other label here.
 */
export function emptyLabel(filter: string | null, canCreate: boolean): string {
  switch (filter) {
    case null:
    case 'mine':
      return canCreate ? tr('index.empty_own', 'No tickets yet. Click "New ticket" to open one.') : tr('index.empty', 'No tickets to show.');
    case 'assigned_to_me':
      return tr('index.empty_assigned_to_me', 'No open tickets are assigned to you.');
    case 'unassigned':
      return tr('index.empty_unassigned', 'Every open ticket has been claimed.');
    case 'all':
      return tr('index.empty', 'No tickets to show.');
    case 'open':
      return tr('index.empty_status.open', 'No open tickets.');
    case 'in_progress':
      return tr('index.empty_status.in_progress', 'No tickets in progress.');
    case 'awaiting_user':
      return tr('index.empty_status.awaiting_response', 'No tickets awaiting a response.');
    case 'resolved':
      return tr('index.empty_status.resolved', 'No resolved tickets.');
    case 'closed':
      return tr('index.empty_status.closed', 'No closed tickets.');
    default:
      return tr('index.empty', 'No tickets to show.');
  }
}
