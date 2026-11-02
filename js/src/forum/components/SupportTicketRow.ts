import app from 'flarum/forum/app';
import Component, { ComponentAttrs } from 'flarum/common/Component';
import Link from 'flarum/common/components/Link';
import Avatar from 'flarum/common/components/Avatar';
import ItemList from 'flarum/common/utils/ItemList';
import extractText from 'flarum/common/utils/extractText';
import { formatDate } from '../utils/helpers';
import { canHandleSupportTickets } from '../utils/permissions';
import { statusChip, priorityChip } from '../utils/status';
import { ticketTypes } from '../../common/ticketTypes';

export interface ISupportTicketRowAttrs extends ComponentAttrs {
  ticket: any;
}

export default class SupportTicketRow extends Component<ISupportTicketRowAttrs> {
  view() {
    const ticket = this.attrs.ticket;
    const user = ticket.user && ticket.user();
    const cat = ticket.category && ticket.category();
    const isDeleted = !!(ticket.isDeleted && ticket.isDeleted());
    const isUnread = !!(ticket.isUnread && ticket.isUnread());

    return m(
      Link,
      {
        href: app.route('linkrobins-support.show', { id: ticket.id() }),
        className: 'LinkRobinsSupport-row' + (isDeleted ? ' LinkRobinsSupport-row--deleted' : '') + (isUnread ? ' is-unread' : ''),
        key: 'ticket-' + ticket.id(),
      },
      [
        m('div', { className: 'LinkRobinsSupport-row-main' }, [
          m('div', { className: 'LinkRobinsSupport-row-subject' }, [
            isUnread
              ? m('span', {
                  className: 'LinkRobinsSupport-unreadDot',
                  title: extractText(app.translator.trans('linkrobins-support.forum.index.unread')),
                  'aria-label': extractText(app.translator.trans('linkrobins-support.forum.index.unread')),
                })
              : null,
            ticket.subject() || app.translator.trans('linkrobins-support.forum.index.untitled'),
            isDeleted
              ? m('span', { className: 'LinkRobinsSupport-row-deletedBadge' }, app.translator.trans('linkrobins-support.forum.index.deleted_badge'))
              : null,
          ]),
          m('div', { className: 'LinkRobinsSupport-row-meta' }, [
            cat
              ? m('span', { className: 'LinkRobinsSupport-row-cat' }, [
                  m('span', { className: 'LinkRobinsSupport-chip-dot', style: { background: cat.color() || 'var(--muted-color)' } }),
                  cat.name(),
                ])
              : null,
            user ? m('span', { className: 'LinkRobinsSupport-row-user' }, user.displayName() || user.username()) : null,
            m('span', { className: 'LinkRobinsSupport-row-date' }, formatDate(ticket.lastReplyAt() || ticket.createdAt())),
          ]),
        ]),
        m('div', { className: 'LinkRobinsSupport-row-side' }, [
          canHandleSupportTickets() ? priorityChip(ticket.priority && ticket.priority()) : null,
          this.badgeItems(ticket).toArray(),
          statusChip(ticket.status()),
          this._renderAssignee(ticket),
        ]),
      ]
    );
  }

  _renderAssignee(ticket: any) {
    if (!canHandleSupportTickets()) return null;
    const assignee = ticket.assignedStaff && ticket.assignedStaff();
    if (!assignee) {
      return m('span', { className: 'LinkRobinsSupport-chip LinkRobinsSupport-chip--assignee is-unassigned' }, [
        m('i', { className: 'fas fa-user-slash', 'aria-hidden': 'true' }),
        app.translator.trans('linkrobins-support.forum.index.unassigned'),
      ]);
    }
    const name = assignee.displayName() || assignee.username();
    return m(
      'span',
      {
        className: 'LinkRobinsSupport-chip LinkRobinsSupport-chip--assignee',
        title: extractText(app.translator.trans('linkrobins-support.forum.index.assigned_to', { name })),
      },
      [m(Avatar, { user: assignee }), name]
    );
  }

  badgeItems(ticket: any): ItemList<any> {
    const items = new ItemList<any>();
    const cat = ticket.category && ticket.category();
    if (cat) {
      const driver = ticketTypes.forCategory(cat);
      if (driver && driver.badgeItems) {
        driver.badgeItems(items, ticket);
      }
    }
    return items;
  }
}
