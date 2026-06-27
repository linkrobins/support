import Component from 'flarum/common/Component';
import Button from 'flarum/common/components/Button';
import Dropdown from 'flarum/common/components/Dropdown';
import { tr } from '../utils/translate';
import { formatDate, userLink } from '../utils/helpers';
import { statusBadge, decisionLabel } from '../utils/status';

// Presentational ticket header: title row (subject + status badge + deleted
// badge + moderation dropdown), meta row, and the appeal decision line.
// SupportShowPage owns the state and passes the ticket plus moderation
// callbacks; this component only renders.
export default class TicketHeader extends Component {
  view() {
    const { ticket, canModerate } = this.attrs as any;
    const creator = ticket.user && ticket.user();
    const category = ticket.category && ticket.category();
    const isDeleted = !!ticket.isDeleted();

    return m('header', { className: 'LinkRobinsSupport-header LinkRobinsSupport-ticket-header' }, [
      m('div', { className: 'LinkRobinsSupport-ticket-titleRow' }, [
        m('h1', { className: 'LinkRobinsSupport-title' }, ticket.subject()),
        statusBadge(ticket.status()),
        isDeleted
          ? m('span', { className: 'LinkRobinsSupport-reply-deletedBadge' }, [
              m('i', { className: 'fas fa-trash' }),
              ' ',
              tr('show.deleted_badge', 'Deleted'),
            ])
          : null,
        canModerate ? this.actions(ticket, isDeleted) : null,
      ]),
      m('div', { className: 'LinkRobinsSupport-ticket-meta' }, [
        category ? m('span', { className: 'LinkRobinsSupport-row-cat', style: 'color: ' + (category.color() || 'inherit') }, category.name()) : null,
        creator ? m('span', null, [tr('show.opened_by', 'Opened by'), ' ', userLink(creator)]) : null,
        m('span', null, formatDate(ticket.createdAt())),
      ]),
      ticket.decision()
        ? m('div', { className: 'LinkRobinsSupport-decision' }, [
            tr('show.decision', 'Decision:'),
            ' ',
            m('span', { className: 'LinkRobinsSupport-decision-' + ticket.decision() }, decisionLabel(ticket.decision())),
          ])
        : null,
    ]);
  }

  actions(ticket: any, isDeleted: boolean) {
    const { ticketBusy, onSoftDelete, onRestore, onForceDelete } = this.attrs as any;
    const canUpdate = !!ticket.canUpdate();
    const canDelete = !!ticket.canDelete();
    const busy = !!ticketBusy;

    const items: any[] = [];
    if (!isDeleted) {
      if (canUpdate) {
        items.push(
          m(
            Button,
            {
              icon: 'fas fa-trash',
              className: 'LinkRobinsSupport-reply-action--danger',
              disabled: busy,
              onclick: () => onSoftDelete(),
            },
            tr('ticket.delete', 'Delete ticket')
          )
        );
      }
    } else {
      if (canUpdate) {
        items.push(m(Button, { icon: 'fas fa-undo', disabled: busy, onclick: () => onRestore() }, tr('ticket.restore', 'Restore ticket')));
      }
      if (canDelete) {
        items.push(
          m(
            Button,
            {
              icon: 'fas fa-times',
              className: 'LinkRobinsSupport-reply-action--danger',
              disabled: busy,
              onclick: () => onForceDelete(),
            },
            tr('action.delete_forever', 'Delete forever')
          )
        );
      }
    }

    if (items.length === 0) return null;

    return m(
      'span',
      { className: 'LinkRobinsSupport-ticket-actions' },
      m(
        Dropdown,
        {
          menuClassName: 'Dropdown-menu--right',
          buttonClassName: 'Button Button--icon Button--flat LinkRobinsSupport-reply-actionsToggle',
          icon: 'fas fa-ellipsis-h',
          accessibleToggleLabel: tr('ticket.mod_actions', 'Ticket moderation actions'),
        },
        items
      )
    );
  }
}
