import Component from 'flarum/common/Component';
import Button from 'flarum/common/components/Button';
import Dropdown from 'flarum/common/components/Dropdown';
import Avatar from 'flarum/common/components/Avatar';
import { tr, trText } from '../utils/translate';
import { statusChip, statusClass, statusLabel, decisionLabel, priorityChip } from '../utils/status';
import AssignTicketModal from './AssignTicketModal';

const STATUSES = ['open', 'in_progress', 'awaiting_user', 'resolved', 'closed'];
const DECISIONS = ['pending', 'accepted', 'rejected'];

// Presentational ticket header: the subject on its own line, a wrapping meta
// line under it (status, category, assignee), and the appeal
// decision line. For staff the status pill and the decision are dropdowns, and
// assignment lives in the moderation menu, so the ticket needs no separate
// control bar.
// The moderation menu is positioned into the header's top-right corner by the
// stylesheet, which is why it is rendered before the title.
// SupportShowPage owns the state and passes the ticket plus moderation
// callbacks; this component only renders.
export default class TicketHeader extends Component {
  view() {
    const { ticket, canModerate, isStaff } = this.attrs as any;
    const category = ticket.category && ticket.category();
    const isDeleted = !!ticket.isDeleted();

    return m('header', { className: 'LinkRobinsSupport-header LinkRobinsSupport-ticket-header' }, [
      canModerate ? this.actions(ticket, isDeleted) : null,
      m('h1', { className: 'LinkRobinsSupport-title' }, ticket.subject()),
      m('div', { className: 'LinkRobinsSupport-ticket-meta' }, [
        isStaff && !isDeleted ? this.statusControl(ticket) : statusChip(ticket.status()),
        isStaff ? priorityChip(ticket.priority && ticket.priority()) : null,
        isDeleted
          ? m('span', { className: 'LinkRobinsSupport-reply-deletedBadge' }, [
              m('i', { className: 'fas fa-trash' }),
              ' ',
              tr('show.deleted_badge', 'Deleted'),
            ])
          : null,
        category
          ? m('span', { className: 'LinkRobinsSupport-chip LinkRobinsSupport-chip--category' }, [
              m('span', { className: 'LinkRobinsSupport-chip-dot', style: { background: category.color() || 'var(--muted-color)' } }),
              category.name(),
            ])
          : null,
        isStaff ? this.assignee(ticket) : null,
      ]),
      ticket.decision()
        ? m('div', { className: 'LinkRobinsSupport-decision' }, [
            tr('show.decision', 'Decision:'),
            ' ',
            isStaff && !isDeleted
              ? this.decisionControl(ticket)
              : m('span', { className: 'LinkRobinsSupport-decision-' + ticket.decision() }, decisionLabel(ticket.decision())),
          ])
        : null,
    ]);
  }

  /**
   * The status pill as a dropdown. Changing status is the action staff take
   * most, so it stays one click away rather than going behind the menu.
   * Picking Closed still asks for confirmation (the page's _setStatus).
   */
  statusControl(ticket: any) {
    const { onSetStatus, updating } = this.attrs as any;
    const current = ticket.status();

    return m(
      Dropdown,
      {
        className: 'LinkRobinsSupport-statusDropdown',
        buttonClassName: 'LinkRobinsSupport-chip LinkRobinsSupport-chip--status ' + statusClass(current),
        label: [m('span', { className: 'LinkRobinsSupport-chip-dot' }), statusLabel(current)],
        caretIcon: 'fas fa-caret-down',
        accessibleToggleLabel: trText('staff.change_status', 'Change status'),
      },
      STATUSES.map((s) =>
        m(
          Button,
          {
            icon: s === current ? 'fas fa-check' : 'fas fa-fw',
            disabled: !!updating || s === current,
            onclick: () => onSetStatus(s),
          },
          statusLabel(s)
        )
      )
    );
  }

  decisionControl(ticket: any) {
    const { onSetDecision, updating } = this.attrs as any;
    const current = ticket.decision();

    return m(
      Dropdown,
      {
        className: 'LinkRobinsSupport-decisionDropdown',
        buttonClassName: 'Button Button--text LinkRobinsSupport-decisionToggle LinkRobinsSupport-decision-' + current,
        label: decisionLabel(current),
        caretIcon: 'fas fa-caret-down',
        accessibleToggleLabel: trText('staff.change_decision', 'Change appeal decision'),
      },
      DECISIONS.map((d) =>
        m(
          Button,
          {
            icon: d === current ? 'fas fa-check' : 'fas fa-fw',
            disabled: !!updating || d === current,
            onclick: () => onSetDecision(d),
          },
          decisionLabel(d)
        )
      )
    );
  }

  assignee(ticket: any) {
    const assigned = ticket.assignedStaff && ticket.assignedStaff();
    return assigned
      ? m(
          'span',
          {
            className: 'LinkRobinsSupport-chip LinkRobinsSupport-chip--assignee',
            title: trText('show.assigned_to_name', 'Assigned to {name}', { name: assigned.displayName() || assigned.username() }),
          },
          [m(Avatar, { user: assigned }), assigned.displayName() || assigned.username()]
        )
      : m('span', { className: 'LinkRobinsSupport-chip LinkRobinsSupport-chip--assignee is-unassigned' }, [
          m('i', { className: 'fas fa-user-slash', 'aria-hidden': 'true' }),
          tr('show.unassigned', 'Unassigned'),
        ]);
  }

  actions(ticket: any, isDeleted: boolean) {
    const { ticketBusy, onSoftDelete, onRestore, onForceDelete, onAssign, onSetPriority, isStaff, updating } = this.attrs as any;
    // Soft-delete and restore are staff-only on the server (isDeleted is
    // writable for staff alone). canUpdate is also true for an owner on their
    // own closed ticket, which is how Reopen works, so on its own it offered
    // owners a Delete that always failed.
    const canUpdate = !!ticket.canUpdate();
    const canDelete = !!ticket.canDelete();
    const busy = !!ticketBusy;

    const items: any[] = [];
    if (!isDeleted) {
      if (isStaff) {
        const assigned = ticket.assignedStaff && ticket.assignedStaff();
        items.push(
          m(
            Button,
            {
              icon: 'fas fa-user-tag',
              disabled: busy || !!updating,
              onclick: () =>
                app.modal.show(AssignTicketModal, {
                  currentId: assigned ? assigned.id() : null,
                  onAssign: (member: any) => onAssign(member),
                }),
            },
            tr('ticket.assign', 'Assign…')
          )
        );

        // Priority: offer the two levels it is not on.
        const current = (ticket.priority && ticket.priority()) || 'normal';
        const levels: Array<[string, string, any]> = [
          ['urgent', 'fas fa-exclamation', tr('ticket.priority_urgent', 'Mark as urgent')],
          ['normal', 'fas fa-minus', tr('ticket.priority_normal', 'Normal priority')],
          ['low', 'fas fa-arrow-down', tr('ticket.priority_low', 'Mark as low priority')],
        ];
        levels
          .filter(([level]) => level !== current)
          .forEach(([level, icon, label]) => {
            items.push(m(Button, { icon, disabled: busy || !!updating, onclick: () => onSetPriority(level) }, label));
          });
      }
      if (canUpdate && isStaff) {
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
      if (canUpdate && isStaff) {
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
