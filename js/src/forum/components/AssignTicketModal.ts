import Modal from 'flarum/common/components/Modal';
import Button from 'flarum/common/components/Button';
import LoadingIndicator from 'flarum/common/components/LoadingIndicator';
import Avatar from 'flarum/common/components/Avatar';
import { tr } from '../utils/translate';
import { loadStaff, type StaffMember } from '../utils/api';

/** A staff record from the endpoint, as a store user (reusing one if loaded). */
function toUserModel(member: StaffMember): any {
  return (
    app.store.getById('users', member.id) ||
    app.store.pushObject({
      type: 'users',
      id: member.id,
      attributes: { username: member.username, displayName: member.displayName, avatarUrl: member.avatarUrl },
    })
  );
}

/**
 * Pick who handles a ticket: anyone on the support team, yourself, or nobody.
 * One click assigns and closes. The ticket page does the saving through
 * `onAssign`, passing the chosen user or null to unassign.
 */
export default class AssignTicketModal extends Modal<any> {
  // Store user models, so avatars render (and colour) exactly as elsewhere on
  // the forum and the page can save the relationship directly.
  staff: any[] = [];
  loadingStaff = true;
  failed = false;

  oninit(vnode: any) {
    super.oninit(vnode);
    loadStaff()
      .then((staff) => {
        this.staff = staff.map((member) => toUserModel(member));
        this.loadingStaff = false;
        m.redraw();
      })
      .catch(() => {
        this.failed = true;
        this.loadingStaff = false;
        m.redraw();
      });
  }

  className() {
    return 'LinkRobinsSupport-assignModal Modal--small';
  }

  title() {
    return tr('assign.title', 'Assign ticket');
  }

  content() {
    const current = (this.attrs as any).currentId ? String((this.attrs as any).currentId) : null;

    return m('div', { className: 'Modal-body' }, [
      this.loadingStaff
        ? m(LoadingIndicator)
        : this.failed
          ? m('p', { className: 'LinkRobinsSupport-empty' }, tr('assign.load_failed', 'Could not load the support team.'))
          : m(
              'ul',
              { className: 'LinkRobinsSupport-assignList' },
              this.staff.map((user: any) => this._renderOption(user, current))
            ),
      current
        ? m(
            'div',
            { className: 'LinkRobinsSupport-assignFooter' },
            m(
              Button,
              { className: 'Button Button--link', icon: 'fas fa-user-slash', onclick: () => this.pick(null) },
              tr('assign.unassign', 'Unassign')
            )
          )
        : null,
    ]);
  }

  _renderOption(user: any, current: string | null) {
    const id = String(user.id());
    const isCurrent = id === current;
    const me = app.session && app.session.user ? String(app.session.user.id()) : null;

    return m(
      'li',
      { key: id },
      m(
        Button,
        {
          className: 'Button LinkRobinsSupport-assignOption' + (isCurrent ? ' is-current' : ''),
          disabled: isCurrent,
          onclick: () => this.pick(user),
        },
        [
          m(Avatar, { user, className: 'LinkRobinsSupport-assignAvatar' }),
          m('span', { className: 'LinkRobinsSupport-assignName' }, user.displayName() || user.username()),
          id === me ? m('span', { className: 'LinkRobinsSupport-assignYou' }, tr('assign.you', '(you)')) : null,
          isCurrent ? m('i', { className: 'fas fa-check LinkRobinsSupport-assignCheck', 'aria-hidden': 'true' }) : null,
        ]
      )
    );
  }

  pick(user: any | null) {
    (this.attrs as any).onAssign(user);
    this.hide();
  }
}
