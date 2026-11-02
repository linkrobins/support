import app from 'flarum/forum/app';
import Component from 'flarum/common/Component';
import extractText from 'flarum/common/utils/extractText';
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
        return app.translator.trans('linkrobins-support.forum.event.auto_closed');
      }
      // Moved by a reply's status rules, not picked by whoever replied.
      if (event.isAutomatic()) {
        return app.translator.trans('linkrobins-support.forum.event.status_changed_automatically', { from, to });
      }
      return actor
        ? app.translator.trans('linkrobins-support.forum.event.status_changed', { name: actor, from, to })
        : app.translator.trans('linkrobins-support.forum.event.status_changed_no_actor', { from, to });
    }

    const fromName = nameOf(event.fromUser && event.fromUser());
    const toName = nameOf(event.toUser && event.toUser());
    const someone = extractText(app.translator.trans('linkrobins-support.forum.event.deleted_user'));
    const hadFrom = !!event.hadAssignee();
    const hasTo = !!event.hasAssignee();

    if (hasTo && !hadFrom) {
      if (actor && actor === toName) {
        return app.translator.trans('linkrobins-support.forum.event.claimed', { name: actor });
      }
      return actor
        ? app.translator.trans('linkrobins-support.forum.event.assigned', { name: actor, assignee: toName || someone })
        : app.translator.trans('linkrobins-support.forum.event.assigned_no_actor', { assignee: toName || someone });
    }
    if (!hasTo) {
      return actor
        ? app.translator.trans('linkrobins-support.forum.event.unassigned', { name: actor, assignee: fromName || someone })
        : app.translator.trans('linkrobins-support.forum.event.unassigned_no_actor', { assignee: fromName || someone });
    }
    return actor
      ? app.translator.trans('linkrobins-support.forum.event.reassigned', {
          name: actor,
          from: fromName || someone,
          to: toName || someone,
        })
      : app.translator.trans('linkrobins-support.forum.event.reassigned_no_actor', { from: fromName || someone, to: toName || someone });
  }
}
