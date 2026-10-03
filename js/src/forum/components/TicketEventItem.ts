import Component from 'flarum/common/Component';
import { tr } from '../utils/translate';
import { formatDate } from '../utils/helpers';
import { statusLabel } from '../utils/status';

function nameOf(user: any): string | null {
  if (!user) return null;
  try {
    return user.displayName() || user.username();
  } catch (e) {
    return null;
  }
}

/**
 * One line in the ticket timeline for a status or assignment change, e.g.
 * "Karl changed the status from Open to Resolved". Presentational only: the
 * show page owns the list and decides where each entry sits among replies.
 */
export default class TicketEventItem extends Component {
  view() {
    const event: any = (this.attrs as any).event;
    const type = event.type();
    const icon = type === 'assignment' ? 'fas fa-user-tag' : 'fas fa-exchange-alt';

    return m('div', { className: 'LinkRobinsSupport-event LinkRobinsSupport-event--' + type }, [
      m('i', { className: icon + ' LinkRobinsSupport-event-icon', 'aria-hidden': 'true' }),
      m('span', { className: 'LinkRobinsSupport-event-text' }, this._text(event, type)),
      m('span', { className: 'LinkRobinsSupport-event-date' }, formatDate(event.createdAt())),
    ]);
  }

  _text(event: any, type: string) {
    const actor = nameOf(event.user && event.user());

    if (type === 'status') {
      const from = event.fromStatus() ? statusLabel(event.fromStatus()) : '';
      const to = event.toStatus() ? statusLabel(event.toStatus()) : '';

      if (!actor && event.fromStatus() === 'resolved' && event.toStatus() === 'closed') {
        return tr('event.auto_closed', 'Closed automatically after a period with no activity');
      }
      return actor
        ? tr('event.status_changed', '{name} changed the status from {from} to {to}', { name: actor, from, to })
        : tr('event.status_changed_no_actor', 'The status changed from {from} to {to}', { from, to });
    }

    const fromName = nameOf(event.fromUser && event.fromUser());
    const toName = nameOf(event.toUser && event.toUser());
    const someone = tr('event.deleted_user', 'a deleted user');
    const hadFrom = !!event.hadAssignee();
    const hasTo = !!event.hasAssignee();

    if (hasTo && !hadFrom) {
      if (actor && actor === toName) {
        return tr('event.claimed', '{name} claimed this ticket', { name: actor });
      }
      return actor
        ? tr('event.assigned', '{name} assigned this ticket to {assignee}', { name: actor, assignee: toName || someone })
        : tr('event.assigned_no_actor', 'Assigned to {assignee}', { assignee: toName || someone });
    }
    if (!hasTo) {
      return actor
        ? tr('event.unassigned', '{name} unassigned {assignee}', { name: actor, assignee: fromName || someone })
        : tr('event.unassigned_no_actor', '{assignee} was unassigned', { assignee: fromName || someone });
    }
    return actor
      ? tr('event.reassigned', '{name} reassigned this ticket from {from} to {to}', { name: actor, from: fromName || someone, to: toName || someone })
      : tr('event.reassigned_no_actor', 'Reassigned from {from} to {to}', { from: fromName || someone, to: toName || someone });
  }
}
