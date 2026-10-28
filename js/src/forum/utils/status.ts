import app from 'flarum/forum/app';
import extractText from 'flarum/common/utils/extractText';
import { basePath, BASE_PATH } from './helpers';

/**
 * Resolve a status label at RENDER time. Building this as a static map at
 * module-load froze the labels to their English fallbacks, because the
 * translator hasn't loaded the active locale yet when this module evaluates.
 */
export function statusLabel(status: string): string {
  switch (status) {
    case 'open':
      return extractText(app.translator.trans('linkrobins-support.forum.status.open'));
    case 'in_progress':
      return extractText(app.translator.trans('linkrobins-support.forum.status.in_progress'));
    case 'awaiting_user':
      return extractText(app.translator.trans('linkrobins-support.forum.status.awaiting_response'));
    case 'resolved':
      return extractText(app.translator.trans('linkrobins-support.forum.status.resolved'));
    case 'closed':
      return extractText(app.translator.trans('linkrobins-support.forum.status.closed'));
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

/**
 * The status as a chip: tinted by status, with a dot, in sentence case. Used
 * in the ticket header and the ticket list so both read the same.
 */
export function statusChip(status: string): any {
  return m('span', { className: 'LinkRobinsSupport-chip LinkRobinsSupport-chip--status ' + statusClass(status) }, [
    m('span', { className: 'LinkRobinsSupport-chip-dot' }),
    statusLabel(status),
  ]);
}

/**
 * Translate an appeal decision (pending/accepted/rejected) at render time.
 * Falls back to the raw value for any unknown decision string.
 */
export function decisionLabel(decision: string): string {
  switch (decision) {
    case 'pending':
      return extractText(app.translator.trans('linkrobins-support.forum.decision.pending'));
    case 'accepted':
      return extractText(app.translator.trans('linkrobins-support.forum.decision.accepted'));
    case 'rejected':
      return extractText(app.translator.trans('linkrobins-support.forum.decision.rejected'));
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
  { id: 'mine', labelKey: 'linkrobins-support.forum.index.my_tickets', fallback: 'My tickets', icon: 'fas fa-user', staffOnly: false },
  {
    id: 'assigned_to_me',
    labelKey: 'linkrobins-support.forum.index.filter_assigned_to_me',
    fallback: 'Assigned to me',
    icon: 'fas fa-user-check',
    staffOnly: true,
  },
  { id: 'unassigned', labelKey: 'linkrobins-support.forum.index.filter_unassigned', fallback: 'Unassigned', icon: 'fas fa-user-slash', staffOnly: true },
  { id: 'all', labelKey: 'linkrobins-support.forum.index.filter_all', fallback: 'All', icon: 'fas fa-inbox', staffOnly: true },
  { id: 'open', labelKey: 'linkrobins-support.forum.status.open', fallback: 'Open', icon: 'fas fa-circle', staffOnly: true },
  { id: 'in_progress', labelKey: 'linkrobins-support.forum.status.in_progress', fallback: 'In progress', icon: 'fas fa-spinner', staffOnly: true },
  {
    id: 'awaiting_user',
    labelKey: 'linkrobins-support.forum.status.awaiting_response',
    fallback: 'Awaiting response',
    icon: 'fas fa-clock',
    staffOnly: true,
  },
  { id: 'resolved', labelKey: 'linkrobins-support.forum.status.resolved', fallback: 'Resolved', icon: 'fas fa-check-circle', staffOnly: true },
  { id: 'closed', labelKey: 'linkrobins-support.forum.status.closed', fallback: 'Closed', icon: 'fas fa-times-circle', staffOnly: true },
];

export function filterLabel(opt: FilterOption): string {
  return extractText(app.translator.trans(opt.labelKey));
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
      return canCreate
        ? extractText(app.translator.trans('linkrobins-support.forum.index.empty_own'))
        : extractText(app.translator.trans('linkrobins-support.forum.index.empty'));
    case 'assigned_to_me':
      return extractText(app.translator.trans('linkrobins-support.forum.index.empty_assigned_to_me'));
    case 'unassigned':
      return extractText(app.translator.trans('linkrobins-support.forum.index.empty_unassigned'));
    case 'all':
      return extractText(app.translator.trans('linkrobins-support.forum.index.empty'));
    case 'open':
      return extractText(app.translator.trans('linkrobins-support.forum.index.empty_status.open'));
    case 'in_progress':
      return extractText(app.translator.trans('linkrobins-support.forum.index.empty_status.in_progress'));
    case 'awaiting_user':
      return extractText(app.translator.trans('linkrobins-support.forum.index.empty_status.awaiting_response'));
    case 'resolved':
      return extractText(app.translator.trans('linkrobins-support.forum.index.empty_status.resolved'));
    case 'closed':
      return extractText(app.translator.trans('linkrobins-support.forum.index.empty_status.closed'));
    default:
      return extractText(app.translator.trans('linkrobins-support.forum.index.empty'));
  }
}

/**
 * The priority chip, for staff: only for low and urgent, since normal is the
 * default and a chip on every ticket would say nothing.
 */
export function priorityChip(priority: string | null | undefined): any {
  if (priority !== 'urgent' && priority !== 'low') return null;
  return m('span', { className: 'LinkRobinsSupport-chip LinkRobinsSupport-chip--priority is-' + priority }, [
    m('i', { className: priority === 'urgent' ? 'fas fa-exclamation' : 'fas fa-arrow-down', 'aria-hidden': 'true' }),
    priority === 'urgent'
      ? app.translator.trans('linkrobins-support.forum.priority.urgent')
      : app.translator.trans('linkrobins-support.forum.priority.low'),
  ]);
}
