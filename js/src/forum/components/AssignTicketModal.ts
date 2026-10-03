import Modal from 'flarum/common/components/Modal';
import Button from 'flarum/common/components/Button';
import LoadingIndicator from 'flarum/common/components/LoadingIndicator';
import { tr } from '../utils/translate';
import { loadStaff, type StaffMember } from '../utils/api';

/**
 * Pick who handles a ticket: anyone on the support team, yourself, or nobody.
 * One click assigns and closes. The ticket page does the saving through
 * `onAssign`, passing the chosen staff member or null to unassign.
 */
export default class AssignTicketModal extends Modal<any> {
  staff: StaffMember[] = [];
  loadingStaff = true;
  failed = false;

  oninit(vnode: any) {
    super.oninit(vnode);
    loadStaff()
      .then((staff) => {
        this.staff = staff;
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
    const me = app.session && app.session.user ? String(app.session.user.id()) : null;

    return m('div', { className: 'Modal-body' }, [
      this.loadingStaff
        ? m(LoadingIndicator)
        : this.failed
          ? m('p', { className: 'LinkRobinsSupport-empty' }, tr('assign.load_failed', 'Could not load the support team.'))
          : m(
              'ul',
              { className: 'LinkRobinsSupport-assignList' },
              this.staff.map((member) => {
                const isCurrent = member.id === current;
                return m(
                  'li',
                  { key: member.id },
                  m(
                    Button,
                    {
                      className: 'Button LinkRobinsSupport-assignOption' + (isCurrent ? ' is-current' : ''),
                      disabled: isCurrent,
                      onclick: () => this.pick(member),
                    },
                    [
                      member.avatarUrl
                        ? m('img', { className: 'Avatar LinkRobinsSupport-assignAvatar', src: member.avatarUrl, alt: '' })
                        : m(
                            'span',
                            { className: 'Avatar LinkRobinsSupport-assignAvatar' },
                            (member.displayName || member.username || '?').charAt(0).toUpperCase()
                          ),
                      m('span', { className: 'LinkRobinsSupport-assignName' }, member.displayName || member.username),
                      member.id === me ? m('span', { className: 'LinkRobinsSupport-assignYou' }, tr('assign.you', '(you)')) : null,
                      isCurrent ? m('i', { className: 'fas fa-check LinkRobinsSupport-assignCheck', 'aria-hidden': 'true' }) : null,
                    ]
                  )
                );
              })
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

  pick(member: StaffMember | null) {
    (this.attrs as any).onAssign(member);
    this.hide();
  }
}
