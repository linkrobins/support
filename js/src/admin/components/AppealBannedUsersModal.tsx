import app from 'flarum/admin/app';
import Modal from 'flarum/common/components/Modal';
import Button from 'flarum/common/components/Button';
import LoadingIndicator from 'flarum/common/components/LoadingIndicator';

// API maximum page size for the user list.
const BANNED_PAGE_LIMIT = 100;

/**
 * Read-only list of currently appeal-banned users, shown in a modal so it
 * doesn't clutter the main extension page. To change a user's status, open
 * their profile (the username links there) and use the moderation controls.
 */
export default class AppealBannedUsersModal extends Modal {
  users: any[] = [];
  loadingUsers = true;
  hasMore = false;

  oninit(vnode: any) {
    super.oninit(vnode);
    this.users = [];
    this.loadingUsers = true;
    this.hasMore = false;
    this._load(false);
  }

  className() {
    // `Modal--medium` was never a thing -- core defines only --small and
    // --large -- so this has always rendered at the default 600px. Say that
    // outright instead of carrying a class name that does nothing.
    return 'LinkRobinsSupportAppealBannedModal';
  }

  title() {
    return app.translator.trans('linkrobins-support.admin.appeal_bans.banned_heading');
  }

  content() {
    return (
      <div className="Modal-body">
        <p className="helpText">{app.translator.trans('linkrobins-support.admin.appeal_bans.intro')}</p>
        {this.loadingUsers && this.users.length === 0 ? (
          <LoadingIndicator />
        ) : this.users.length > 0 ? (
          <>
            {this._renderTable()}
            {this._renderLoadMore()}
          </>
        ) : (
          <div className="LinkRobinsSupportAdmin-empty">
            {app.translator.trans('linkrobins-support.admin.appeal_bans.banned_empty')}
          </div>
        )}
      </div>
    );
  }

  _renderTable() {
    const base = (app.forum && app.forum.attribute && app.forum.attribute('baseUrl')) || '';
    return (
      <div className="LinkRobinsSupportAdmin-tableWrap">
        <table className="LinkRobinsSupportAdmin-catTable">
          <thead>
            <tr>
              <th>{app.translator.trans('linkrobins-support.admin.appeal_bans.column_username')}</th>
              <th>{app.translator.trans('linkrobins-support.admin.appeal_bans.column_email')}</th>
            </tr>
          </thead>
          <tbody>
            {this.users.map((u: any) => (
              <tr key={u.id()}>
                <td>
                  <a href={base + '/u/' + encodeURIComponent(u.username() || '')} target="_blank" rel="noopener noreferrer">
                    {u.username() || '?'}
                  </a>
                </td>
                <td className="LinkRobinsSupportAdmin-mono">{u.email() || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  _renderLoadMore() {
    if (!this.hasMore) return null;
    return (
      <div className="LinkRobinsSupportAdmin-loadMore" style={{ marginTop: '10px' }}>
        <Button
          className="Button"
          disabled={this.loadingUsers}
          onclick={() => this._load(true)}
        >
          {this.loadingUsers
            ? app.translator.trans('linkrobins-support.admin.common.loading')
            : app.translator.trans('linkrobins-support.admin.appeal_bans.load_more')}
        </Button>
      </div>
    );
  }

  // Server-side filter (AppealBannedFilter) returns appeal-banned users. Paged
  // at the API max of 100, with a Load-more so forums with many banned users
  // aren't silently truncated.
  _load(append: boolean) {
    this.loadingUsers = true;
    if (!append) {
      this.users = [];
      this.hasMore = false;
    }
    m.redraw();

    const offset = append ? this.users.length : 0;

    app.store
      .find('users', {
        filter: { supportAppealBanned: 1 },
        page: { limit: BANNED_PAGE_LIMIT, offset },
        sort: 'username',
      })
      .then((users: any) => {
        const list = users || [];
        this.users = append ? this.users.concat(list) : list;
        // More pages remain if the response advertises a next link.
        this.hasMore = !!(users && users.payload && users.payload.links && users.payload.links.next);
        this.loadingUsers = false;
        m.redraw();
      })
      .catch((err: any) => {
        this.loadingUsers = false;
        console.error('[linkrobins/support] banned-users load failed:', err);
        m.redraw();
      });
  }
}
