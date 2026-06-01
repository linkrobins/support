import Modal from 'flarum/common/components/Modal';
import Button from 'flarum/common/components/Button';
import LoadingIndicator from 'flarum/common/components/LoadingIndicator';
import { tx } from '../utils';

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
    return 'LinkRobinsSupportAppealBannedModal Modal--medium';
  }

  title() {
    return tx('linkrobins-support.admin.appeal_bans.banned_heading');
  }

  content() {
    return m('div', { className: 'Modal-body' }, [
      m('p', { className: 'helpText' }, tx('linkrobins-support.admin.appeal_bans.intro')),
      this.loadingUsers && this.users.length === 0
        ? m(LoadingIndicator)
        : this.users.length > 0
        ? [this._renderTable(), this._renderLoadMore()]
        : m('div', { className: 'LinkRobinsSupportAdmin-empty' }, tx('linkrobins-support.admin.appeal_bans.banned_empty')),
    ]);
  }

  _renderTable() {
    const base = (app.forum && app.forum.attribute && app.forum.attribute('baseUrl')) || '';
    return m('div', { className: 'LinkRobinsSupportAdmin-tableWrap' }, m('table', { className: 'LinkRobinsSupportAdmin-catTable' }, [
      m(
        'thead',
        null,
        m('tr', null, [
          m('th', null, tx('linkrobins-support.admin.appeal_bans.column_username')),
          m('th', null, tx('linkrobins-support.admin.appeal_bans.column_email')),
        ])
      ),
      m(
        'tbody',
        null,
        this.users.map((u: any) =>
          m('tr', { key: u.id() }, [
            m(
              'td',
              null,
              m('a', { href: base + '/u/' + encodeURIComponent(u.username() || ''), target: '_blank' }, u.username() || '?')
            ),
            m('td', { className: 'LinkRobinsSupportAdmin-mono' }, u.email() || '—'),
          ])
        )
      ),
    ]));
  }

  _renderLoadMore() {
    if (!this.hasMore) return null;
    return m(
      'div',
      { className: 'LinkRobinsSupportAdmin-loadMore', style: 'margin-top:10px;' },
      m(
        Button,
        {
          className: 'Button',
          disabled: this.loadingUsers,
          onclick: () => this._load(true),
        },
        this.loadingUsers ? tx('linkrobins-support.admin.common.loading') : tx('linkrobins-support.admin.appeal_bans.load_more')
      )
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
