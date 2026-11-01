import app from 'flarum/forum/app';
import Modal from 'flarum/common/components/Modal';
import Button from 'flarum/common/components/Button';
import LoadingIndicator from 'flarum/common/components/LoadingIndicator';
import Avatar from 'flarum/common/components/Avatar';
import Icon from 'flarum/common/components/Icon';
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
    return app.translator.trans('linkrobins-support.forum.assign.title');
  }

  content() {
    const current = (this.attrs as any).currentId ? String((this.attrs as any).currentId) : null;

    return (
      <div className="Modal-body">
        {this.loadingStaff ? (
          <LoadingIndicator />
        ) : this.failed ? (
          <p className="LinkRobinsSupport-empty">{app.translator.trans('linkrobins-support.forum.assign.load_failed')}</p>
        ) : (
          <ul className="LinkRobinsSupport-assignList">
            {this.staff.map((user: any) => this._renderOption(user, current))}
          </ul>
        )}
        {current && (
          <div className="LinkRobinsSupport-assignFooter">
            <Button
              className="Button Button--link"
              icon="fas fa-user-slash"
              onclick={() => this.pick(null)}
            >
              {app.translator.trans('linkrobins-support.forum.assign.unassign')}
            </Button>
          </div>
        )}
      </div>
    );
  }

  _renderOption(user: any, current: string | null) {
    const id = String(user.id());
    const isCurrent = id === current;
    const me = app.session && app.session.user ? String(app.session.user.id()) : null;

    return (
      <li key={id}>
        <Button
          className={`Button LinkRobinsSupport-assignOption${isCurrent ? ' is-current' : ''}`}
          disabled={isCurrent}
          onclick={() => this.pick(user)}
        >
          <Avatar user={user} className="LinkRobinsSupport-assignAvatar" />
          <span className="LinkRobinsSupport-assignName">{user.displayName() || user.username()}</span>
          {id === me && (
            <span className="LinkRobinsSupport-assignYou">
              {app.translator.trans('linkrobins-support.forum.assign.you')}
            </span>
          )}
          {isCurrent && <Icon name="fas fa-check" className="LinkRobinsSupport-assignCheck" />}
        </Button>
      </li>
    );
  }

  pick(user: any | null) {
    (this.attrs as any).onAssign(user);
    this.hide();
  }
}
