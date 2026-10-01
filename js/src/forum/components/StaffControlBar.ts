import Component from 'flarum/common/Component';
import ItemList from 'flarum/common/utils/ItemList';
import type Mithril from 'mithril';
import { tr } from '../utils/translate';
import { statusLabel, decisionLabel } from '../utils/status';

// Presentational staff control bar: status select, appeal-decision select, and
// the assignment row (claim / unassign). Only rendered by SupportShowPage when
// the actor can handle tickets. State lives in the parent; this emits callbacks.
export default class StaffControlBar extends Component {
  view() {
    return m('div', { className: 'LinkRobinsSupport-staffBar' }, this.actionItems().toArray());
  }

  actionItems(): ItemList<Mithril.Children> {
    const items = new ItemList<Mithril.Children>();
    const { ticket, updating } = this.attrs as any;

    if (!ticket) {
      return items;
    }

    if (ticket.status() === 'closed') {
      // A closed ticket hides the status dropdown, so offer an explicit Reopen
      // button -- otherwise an accidental close is unrecoverable from the UI.
      items.add('closedBadge', m('span', { className: 'LinkRobinsSupport-staffBar-label' }, tr('show.closed_badge', 'Closed ticket')), 100);

      items.add(
        'reopen',
        m(
          'button',
          {
            type: 'button',
            className: 'Button Button--default LinkRobinsSupport-staffBtn',
            disabled: updating,
            onclick: () => (this.attrs as any).onReopen(),
          },
          tr('action.reopen', 'Reopen ticket')
        ),
        90
      );

      const decision = this.decisionGroup(ticket);
      if (decision) {
        items.add('decision', decision, 80);
      }

      items.add('assignment', this.assignmentRow(false), -10);

      return items;
    }

    const statuses = ['open', 'in_progress', 'awaiting_user', 'resolved', 'closed'];

    items.add(
      'status',
      m('label', { className: 'LinkRobinsSupport-staffBar-statusGroup' }, [
        m('span', { className: 'LinkRobinsSupport-staffBar-label' }, tr('staff.set_status', 'Set status:')),
        m(
          'select',
          {
            className: 'FormControl LinkRobinsSupport-staffBar-statusSelect',
            value: ticket.status(),
            disabled: updating,
            onchange: (e: any) => {
              const next = e.target.value;
              if (next && next !== ticket.status()) {
                (this.attrs as any).onSetStatus(next);
              }
            },
          },
          statuses.map((s) => m('option', { value: s }, statusLabel(s)))
        ),
      ]),
      100
    );

    const decision = this.decisionGroup(ticket);
    if (decision) {
      items.add('decision', decision, 80);
    }

    items.add('assignment', this.assignmentRow(true), -10);

    return items;
  }

  // Appeal tickets carry a decision (pending/accepted/rejected); regular tickets
  // have a null decision and get no selector. The backend gates the writable
  // `decision` attribute to staff.
  decisionGroup(ticket: any) {
    const { updating } = this.attrs as any;
    if (!ticket.decision()) return null;
    const decisions = ['pending', 'accepted', 'rejected'];

    return m('label', { className: 'LinkRobinsSupport-staffBar-statusGroup' }, [
      m('span', { className: 'LinkRobinsSupport-staffBar-label' }, tr('staff.set_decision', 'Appeal decision:')),
      m(
        'select',
        {
          className: 'FormControl LinkRobinsSupport-staffBar-statusSelect',
          value: ticket.decision(),
          disabled: updating,
          onchange: (e: any) => {
            const next = e.target.value;
            if (next && next !== ticket.decision()) {
              (this.attrs as any).onSetDecision(next);
            }
          },
        },
        decisions.map((d) => m('option', { value: d }, decisionLabel(d)))
      ),
    ]);
  }

  assignmentRow(allowChanges: boolean) {
    const { ticket, updating, onClaim, onUnassign } = this.attrs as any;
    const assigned = ticket.assignedStaff && ticket.assignedStaff();
    const actor = app.session && app.session.user;
    const actorIsAssigned = assigned && actor && String(assigned.id()) === String(actor.id());
    const label = assigned
      ? tr('show.assigned_to', 'Assigned to') + ' ' + (assigned.username() || 'user #' + assigned.id())
      : tr('show.unassigned', 'Unassigned');

    return m('div', { className: 'LinkRobinsSupport-staffBar-assign' }, [
      m('span', { className: 'LinkRobinsSupport-staffBar-label' }, label),
      allowChanges && !actorIsAssigned
        ? m(
            'button',
            {
              type: 'button',
              className: 'Button Button--default LinkRobinsSupport-staffBtn',
              disabled: updating,
              onclick: () => onClaim(),
            },
            tr('action.claim', 'Claim')
          )
        : null,
      allowChanges && assigned
        ? m(
            'button',
            {
              type: 'button',
              className: 'Button Button--default LinkRobinsSupport-staffBtn',
              disabled: updating,
              onclick: () => onUnassign(),
            },
            tr('action.unassign', 'Unassign')
          )
        : null,
    ]);
  }
}
