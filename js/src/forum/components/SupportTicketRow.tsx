import app from 'flarum/forum/app';
import Component, { ComponentAttrs } from 'flarum/common/Component';
import Link from 'flarum/common/components/Link';
import Avatar from 'flarum/common/components/Avatar';
import Icon from 'flarum/common/components/Icon';
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

    return (
      <Link
        href={app.route('linkrobins-support.show', { id: ticket.id() })}
        className={`LinkRobinsSupport-row${isDeleted ? ' LinkRobinsSupport-row--deleted' : ''}${isUnread ? ' is-unread' : ''}`}
        key={`ticket-${ticket.id()}`}
      >
        <div className="LinkRobinsSupport-row-main">
          <div className="LinkRobinsSupport-row-subject">
            {isUnread && (
              <span
                className="LinkRobinsSupport-unreadDot"
                title={extractText(app.translator.trans('linkrobins-support.forum.index.unread'))}
                aria-label={extractText(app.translator.trans('linkrobins-support.forum.index.unread'))}
              />
            )}
            {ticket.subject() || app.translator.trans('linkrobins-support.forum.index.untitled')}
            {isDeleted && (
              <span className="LinkRobinsSupport-row-deletedBadge">
                {app.translator.trans('linkrobins-support.forum.index.deleted_badge')}
              </span>
            )}
          </div>
          <div className="LinkRobinsSupport-row-meta">
            {cat && (
              <span className="LinkRobinsSupport-row-cat">
                <span className="LinkRobinsSupport-chip-dot" style={{ background: cat.color() || 'var(--muted-color)' }} />
                {cat.name()}
              </span>
            )}
            {user && (
              <span className="LinkRobinsSupport-row-user">
                {user.displayName() || user.username()}
              </span>
            )}
            <span className="LinkRobinsSupport-row-date">
              {formatDate(ticket.lastReplyAt() || ticket.createdAt())}
            </span>
          </div>
        </div>
        <div className="LinkRobinsSupport-row-side">
          {canHandleSupportTickets() && priorityChip(ticket.priority && ticket.priority())}
          {this.badgeItems(ticket).toArray()}
          {statusChip(ticket.status())}
          {this._renderAssignee(ticket)}
        </div>
      </Link>
    );
  }

  _renderAssignee(ticket: any) {
    if (!canHandleSupportTickets()) return null;
    const assignee = ticket.assignedStaff && ticket.assignedStaff();
    if (!assignee) {
      return (
        <span className="LinkRobinsSupport-chip LinkRobinsSupport-chip--assignee is-unassigned">
          <Icon name="fas fa-user-slash" />
          {app.translator.trans('linkrobins-support.forum.index.unassigned')}
        </span>
      );
    }
    const name = assignee.displayName() || assignee.username();
    return (
      <span
        className="LinkRobinsSupport-chip LinkRobinsSupport-chip--assignee"
        title={extractText(app.translator.trans('linkrobins-support.forum.index.assigned_to', { name }))}
      >
        <Avatar user={assignee} />
        {name}
      </span>
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
