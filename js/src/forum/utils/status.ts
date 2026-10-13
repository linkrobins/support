import { tr } from './translate';

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
      return tr('decision.pending', 'Pending');
    case 'accepted':
      return tr('decision.accepted', 'Accepted');
    case 'rejected':
      return tr('decision.rejected', 'Rejected');
    default:
      return decision;
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
    priority === 'urgent' ? tr('priority.urgent', 'Urgent') : tr('priority.low', 'Low priority'),
  ]);
}
